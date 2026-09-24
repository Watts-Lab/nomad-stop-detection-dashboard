import argparse
from concurrent.futures import ProcessPoolExecutor
import json
import os
from pathlib import Path
import shutil

import geopandas as gpd
import numpy as np
import pandas as pd
from tqdm import tqdm

import nomad.data as data_folder
import nomad.filters as filters
import nomad.io.base as loader
import nomad.stop_detection.density_algs as DENSITY
import nomad.stop_detection.sequential_algs as SEQUENTIAL
import nomad.stop_detection.utils as STOP_UTILS
import nomad.visit_attribution.visit_attribution as visits
from nomad.city_gen import City
from nomad.map_utils import blocks_to_mercator
from nomad.stop_detection.validation import AlgorithmRegistry, compute_stop_detection_metrics
from xray_schema import CACHE_FORMAT, XRAY_SCHEMAS

CONFIG_DIR = Path(__file__).resolve().parent
REPO_ROOT = Path(__file__).resolve().parents[1]
NOMAD_DATA_DIR = Path(data_folder.__file__).parent
DEFAULT_OUTPUT_DIR = REPO_ROOT / "cached_results" / "two-stop-cache"
COORDINATE_PRECISION = 0
COORDINATE_DTYPE = "int"
PARQUET_COMPRESSION = "zstd"
PARQUET_PART_FILE = "part-0.parquet"
DEFAULT_WORKERS = min(4, max(1, (os.cpu_count() or 2) - 1))
DEFAULT_ALGORITHMS = [
    "lachesis",
    "sequential_centroid",
    "sequential_first",
    "gridbased",
    "st_dbscan",
    "dbstop",
    "seqscan",
]
DELTA_ROAM_VALUES = np.linspace(5, 120, 21).tolist()
DIST_THRESH_VALUES = [float(value) for value in np.arange(0, 50.1, 2.5)]
HDBSCAN_DIST_THRESH_VALUES = [float(value) for value in np.arange(5, 40.1, 2.5)]
DUR_MIN_VALUES = [5, 10]
TIME_THRESH_VALUES = [60, 240]
DT_MAX_VALUES = [60, 120]
MIN_PTS_VALUES = [2, 3]
H3_RESOLUTION_VALUES = [10, 11, 12, 13]
TRAJ_COLS = {
    "user_id": "user_id",
    "timestamp": "timestamp",
    "x": "x",
    "y": "y",
}
JOB_CONTEXT = None


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate compact static caches for the stop-detection dashboard."
    )
    parser.add_argument("--config-key", default="2_stops")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--algorithms", nargs="+", default=DEFAULT_ALGORITHMS)
    parser.add_argument("--max-users", type=int, default=None)
    parser.add_argument("--scene-only", action="store_true")
    parser.add_argument("--workers", type=int, default=DEFAULT_WORKERS)
    return parser.parse_args()


def resolve_config_path(path_value):
    path = Path(path_value)
    if path.is_absolute():
        return path

    config_path = CONFIG_DIR / path
    data_path = NOMAD_DATA_DIR / path
    if data_path.exists() and not config_path.exists():
        return data_path
    return config_path


def resolve_parquet_path(path_value):
    path = resolve_config_path(path_value)
    if path.is_dir():
        return sorted(path.glob("*.parquet"))[0]
    return path


def read_config(config_key):
    with open(CONFIG_DIR / f"config_{config_key}.json", "r", encoding="utf-8") as f:
        return json.load(f)


def load_inputs(config, max_users):
    out = config["output_files"]
    sparse_df = loader.from_file(resolve_parquet_path(out["sparse_path"]), format="parquet")
    diaries_df = loader.from_file(resolve_parquet_path(out["diaries_path"]), format="parquet").rename(
        columns={"identifier": "user_id"}
    )
    buildings_df = gpd.read_parquet(resolve_config_path(config["buildings_file"]))
    poi_table = buildings_df.rename(columns={"id": "location"})
    users = pd.Series(diaries_df.user_id.unique(), name="user_id")
    if max_users is not None:
        users = users.head(max_users)

    sparse_df = sparse_df.loc[sparse_df.user_id.isin(users)].copy()
    diaries_df = diaries_df.loc[diaries_df.user_id.isin(users)].copy()
    poi_subset = poi_table.loc[poi_table.location.isin(diaries_df["location"].dropna())].copy()
    sparse_df = sparse_df.sort_values(["user_id", "timestamp"]).reset_index(drop=True)
    users = sparse_df["user_id"].drop_duplicates().reset_index(drop=True)

    sparse_df["location_id"] = visits.poi_map(
        sparse_df,
        poi_table=poi_subset,
        data_crs="EPSG:3857",
        max_distance=20,
        location_id="location",
        x="x",
        y="y",
    )
    return sparse_df, diaries_df, buildings_df, users


def compact_coordinates(frame):
    frame = frame.copy()
    for col in ["x", "y"]:
        frame[col] = frame[col].round(COORDINATE_PRECISION)
        if COORDINATE_DTYPE == "int":
            frame[col] = frame[col].astype("Int64")
    return frame


def write_single_parquet(frame, path, row_group_size=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_parquet(
        path,
        index=False,
        compression=PARQUET_COMPRESSION,
        row_group_size=row_group_size,
    )


def write_shared_tables(output_dir, sparse_df, diaries_df):
    traj_cols = ["user_id", "timestamp", "x", "y"]
    diary_cols = ["timestamp", "duration", "user_id", "location", "x", "y"]

    trajectory = (
        compact_coordinates(sparse_df.loc[:, traj_cols])
        .groupby("user_id", sort=False, observed=True)[["timestamp", "x", "y"]]
        .agg(list)
        .reset_index()
    )
    write_single_parquet(
        trajectory,
        output_dir / "trajectory" / PARQUET_PART_FILE,
        row_group_size=1,
    )
    write_single_parquet(
        compact_coordinates(
            diaries_df.loc[:, diary_cols].sort_values(["user_id", "timestamp"])
        ),
        output_dir / "diary" / PARQUET_PART_FILE,
    )


def geometry_rings(geometry):
    return [
        [[float(x), float(y)] for x, y in geometry.exterior.coords]
    ]


def json_value(value):
    if isinstance(value, np.generic):
        return value.item()
    raise TypeError(f"Object of type {value.__class__.__name__} is not JSON serializable")


def json_records(frame):
    return json.loads(frame.to_json(orient="records"))


def mercator_points(points, city):
    coords = pd.DataFrame(points, columns=["x", "y"])
    converted = blocks_to_mercator(
        coords,
        block_size=city.block_side_length,
        false_easting=city.web_mercator_origin_x,
        false_northing=city.web_mercator_origin_y,
        rotation_deg=city.rotation_deg,
    )
    return converted.loc[:, ["x", "y"]].round(6).values.tolist()


def route_record(row, city):
    origin = city.buildings_gdf.loc[row["from"]]
    destination = city.buildings_gdf.loc[row["to"]]
    start = (int(origin["door_cell_x"]), int(origin["door_cell_y"]))
    end = (int(destination["door_cell_x"]), int(destination["door_cell_y"]))
    blocks = city.get_shortest_path(start, end)
    centroids = city.blocks_gdf.loc[blocks].geometry.centroid
    points = [origin["door_point"]] + [(point.x, point.y) for point in centroids] + [destination["door_point"]]
    return {
        "from": row["from"],
        "to": row["to"],
        "blocks": [[int(x), int(y)] for x, y in blocks],
        "path": mercator_points(points, city),
    }


def street_records(city):
    streets = city.streets_gdf.loc[:, ["id", "geometry"]].copy()
    streets["coords"] = streets.geometry.apply(lambda geometry: list(geometry.exterior.coords))
    street_points = streets.loc[:, ["id", "coords"]].explode("coords")
    street_points["coords"] = mercator_points(street_points["coords"].tolist(), city)
    return (
        street_points.groupby("id", sort=False)["coords"]
        .apply(list)
        .reset_index()
        .to_dict("records")
    )


def write_routes_json(output_dir, diaries_df, city_file, config_key):
    city = City.from_geopackage(resolve_config_path(city_file), load_gravity=False)
    city.compute_shortest_paths(callable_only=True)
    location_ids = sorted(str(location) for location in diaries_df["location"].dropna().unique())
    location_ids = [location for location in location_ids if location in city.buildings_gdf.index]
    buildings = city.buildings_gdf.loc[location_ids].copy()
    locations = buildings.index.to_series()

    door_points = mercator_points(buildings["door_point"].tolist(), city)
    doors = buildings.assign(
        x=[point[0] for point in door_points],
        y=[point[1] for point in door_points],
        type=buildings["building_type"],
    ).loc[:, ["id", "type", "door_cell_x", "door_cell_y", "x", "y"]]

    route_pairs = locations.rename("from").to_frame().merge(
        locations.rename("to").to_frame(),
        how="cross",
    )
    route_pairs = route_pairs.loc[route_pairs["from"] != route_pairs["to"]]
    routes = route_pairs.apply(route_record, axis=1, city=city).tolist()

    payload = {
        "crs": "EPSG:3857",
        "source": f"Garden City {config_key} shortest paths generated by generate_algorithm_cache.py",
        "streets": street_records(city),
        "doors": doors.to_dict("records"),
        "routes": routes,
    }
    with open(output_dir / "routes.json", "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"), default=json_value)


def write_scene_json(output_dir, sparse_df, buildings_df, config_key):
    scene_coordinates = compact_coordinates(sparse_df.loc[:, ["x", "y"]])
    bounds = [
        int(scene_coordinates.x.min()),
        int(scene_coordinates.y.min()),
        int(scene_coordinates.x.max()),
        int(scene_coordinates.y.max()),
    ]
    buildings = buildings_df.loc[:, ["id", "building_type", "geometry"]].copy()
    buildings["rings"] = buildings.geometry.apply(geometry_rings)
    buildings["type"] = buildings["building_type"]
    scene = {
        "crs": "EPSG:3857",
        "source": f"Garden City {config_key} generated by generate_algorithm_cache.py",
        "bounds": bounds,
        "buildings": json_records(buildings.loc[:, ["id", "type", "rings"]]),
    }
    with open(output_dir / "scene.json", "w", encoding="utf-8") as f:
        json.dump(scene, f, ensure_ascii=False, allow_nan=False, default=json_value)


def algorithm_specs():
    density_params = {
        "dist_thresh": DIST_THRESH_VALUES,
        "time_thresh": TIME_THRESH_VALUES,
        "min_pts": MIN_PTS_VALUES,
        "dur_min": DUR_MIN_VALUES,
    }
    return {
        "lachesis": {
            "display_name": "Lachesis",
            "labeler": SEQUENTIAL.lachesis_labels,
            "xray": XRAY_SCHEMAS["lachesis"],
            "return_kwargs": {"return_anchors": True},
            "params": {
                "delta_roam": DELTA_ROAM_VALUES,
                "dt_max": DT_MAX_VALUES,
                "dur_min": DUR_MIN_VALUES,
            },
        },
        "sequential_centroid": {
            "display_name": "Sequential (centroid-anchored)",
            "labeler": SEQUENTIAL.detect_stops_labels,
            "xray": XRAY_SCHEMAS["sequential_centroid"],
            "params": {
                "delta_roam": DELTA_ROAM_VALUES,
                "dt_max": DT_MAX_VALUES,
                "dur_min": DUR_MIN_VALUES,
                "method": "centroid",
            },
        },
        "sequential_first": {
            "display_name": "Sequential (first-anchored)",
            "labeler": SEQUENTIAL.detect_stops_labels,
            "xray": XRAY_SCHEMAS["sequential_first"],
            "params": {
                "delta_roam": DELTA_ROAM_VALUES,
                "dt_max": DT_MAX_VALUES,
                "dur_min": DUR_MIN_VALUES,
                "method": "sliding",
            },
        },
        "gridbased": {
            "display_name": "Grid-Based",
            "labeler": SEQUENTIAL.grid_based_labels,
            "xray": XRAY_SCHEMAS["gridbased"],
            "external_params": {
                "h3_resolution": H3_RESOLUTION_VALUES,
            },
            "params": {
                "time_thresh": TIME_THRESH_VALUES,
                "dur_min": DUR_MIN_VALUES,
                "min_cluster_size": 2,
                "location_id": "tessellation",
            },
        },
        "st_dbscan": {
            "display_name": "ST-DBSCAN",
            "labeler": DENSITY.ta_dbscan_labels,
            "xray": XRAY_SCHEMAS["st_dbscan"],
            "return_kwargs": {"return_cores": True},
            "params": {
                "dist_thresh": DIST_THRESH_VALUES,
                "time_thresh": TIME_THRESH_VALUES,
                "min_pts": MIN_PTS_VALUES,
                "remove_overlaps": True,
            },
        },
        "dbstop": {
            "display_name": "DBSTOP",
            "labeler": DENSITY.dbstop_labels,
            "xray": XRAY_SCHEMAS["dbstop"],
            "return_kwargs": {"return_cores": True},
            "params": {**density_params, "back_merge": False},
        },
        "seqscan": {
            "display_name": "SeqScan",
            "labeler": DENSITY.seqscan_labels,
            "xray": XRAY_SCHEMAS["seqscan"],
            "return_kwargs": {"return_cores": True},
            "params": {**density_params, "back_merge": False},
        },
        "hdbscan": {
            "display_name": "HDBSCAN",
            "labeler": DENSITY.hdbscan_labels,
            "xray": XRAY_SCHEMAS["hdbscan"],
            "return_kwargs": {"return_cores": True},
            "params": {
                **density_params,
                "dist_thresh": HDBSCAN_DIST_THRESH_VALUES,
                "min_cluster_size": 1,
            },
        },
    }


def initialize_worker(sparse_df, diaries_df, registry):
    global JOB_CONTEXT
    JOB_CONTEXT = sparse_df, diaries_df, registry, algorithm_specs()


def run_user_job(user_id):
    sparse_df, diaries_df, registry, specs = JOB_CONTEXT
    user_sparse = sparse_df.loc[sparse_df.user_id == user_id]
    truth = diaries_df.loc[diaries_df.user_id == user_id]
    h3_inputs = {}
    output = {}
    family_config_ids = {}

    for algorithm in registry:
        family = algorithm["family"]
        config_id = family_config_ids.get(family, 0) + 1
        family_config_ids[family] = config_id
        family_output = output.setdefault(family, {"results": [], "metrics": []})
        spec = specs[family]
        call_kwargs = {"traj_cols": TRAJ_COLS, **spec.get("return_kwargs", {})}

        detection_input = user_sparse
        if family == "gridbased":
            resolution = algorithm["params"]["h3_resolution"]
            if resolution not in h3_inputs:
                grid_input = user_sparse.copy()
                grid_input["tessellation"] = filters.to_tessellation(
                    grid_input,
                    index="h3",
                    res=resolution,
                    data_crs="EPSG:3857",
                    traj_cols=TRAJ_COLS,
                )
                h3_inputs[resolution] = grid_input
            detection_input = h3_inputs[resolution]

        result = registry.time_call(algorithm, detection_input, **call_kwargs)
        if isinstance(result, pd.Series):
            result = result.to_frame()
        result_row = {
            "user_id": user_id,
            "config_id": config_id,
            "cluster": result["cluster"].to_numpy(dtype=np.int16),
        }
        for field in spec["xray"]["fields"]:
            if field == "core":
                result_row["xray_core"] = result[field].to_numpy(dtype=np.int16)
            else:
                values = result[field].astype(object)
                result_row[f"xray_{field}"] = values.where(values.notna(), None).tolist()
        family_output["results"].append(result_row)

        stops = STOP_UTILS.summarize_stops(
            detection_input,
            result["cluster"],
            x="x",
            y="y",
            timestamp="timestamp",
            keep_col_names=True,
            passthrough_cols=["user_id", "location_id"],
            passthrough_agg={
                "location_id": lambda values: values.mode().iat[0]
                if values.notna().any()
                else None,
            },
            traj_cols=TRAJ_COLS,
        )
        metrics = compute_stop_detection_metrics(
            stops=stops,
            truth=truth,
            user_id=user_id,
            algorithm=algorithm["algorithm"],
            traj_cols={"location_id": "location_id"},
            right_traj_cols={"location_id": "location", "timestamp": "timestamp"},
            timestamp="timestamp",
        )
        metrics["config_id"] = config_id
        family_output["metrics"].append(registry.annotate_metrics(metrics, algorithm))

    for family_output in output.values():
        for frame_name in family_output:
            family_output[frame_name] = pd.DataFrame(family_output[frame_name])

    return output


def run_jobs(users, sparse_df, diaries_df, registry, workers):
    if workers == 1:
        initialize_worker(sparse_df, diaries_df, registry)
        yield from map(run_user_job, users)
        return

    with ProcessPoolExecutor(
        max_workers=workers,
        initializer=initialize_worker,
        initargs=(sparse_df, diaries_df, registry),
    ) as executor:
        yield from executor.map(run_user_job, users)


def write_algorithm(algorithm, spec, configurations, frames, output_dir):
    algorithm_dir = output_dir / algorithm
    algorithm_dir.mkdir(parents=True, exist_ok=True)
    configs = [
        {
            "config_id": config_id,
            "key": item["algorithm"],
            "params": item["params"],
        }
        for config_id, item in enumerate(configurations, start=1)
    ]
    metrics_df = pd.concat(frames["metrics"], ignore_index=True)
    results_df = (
        pd.concat(frames["results"], ignore_index=True)
        .sort_values(["user_id", "config_id"])
        .reset_index(drop=True)
    )
    results_df["config_id"] = results_df["config_id"].astype("uint16")
    write_single_parquet(
        results_df,
        algorithm_dir / "results.parquet",
        row_group_size=len(configs),
    )
    metrics_df.to_parquet(
        algorithm_dir / "metrics.parquet",
        index=False,
        compression=PARQUET_COMPRESSION,
    )
    with open(algorithm_dir / "configs.json", "w", encoding="utf-8") as f:
        json.dump({"configs": configs}, f, ensure_ascii=False, separators=(",", ":"), default=json_value)

    return {
        "display_name": spec["display_name"],
        "xray": spec["xray"],
        "configs": f"{algorithm}/configs.json",
        "results": f"{algorithm}/results.parquet",
        "metrics": f"{algorithm}/metrics.parquet",
    }


def write_manifest(output_dir, config_key, files, users):
    manifest = {
        "config_key": config_key,
        "format": CACHE_FORMAT,
        "algorithm_keys": list(files.keys()),
        "algorithms": files,
        "users": users.astype(str).tolist(),
        "shared_files": {
            "scene": "scene.json",
            "routes": "routes.json",
            "trajectory": f"trajectory/{PARQUET_PART_FILE}",
            "diary": f"diary/{PARQUET_PART_FILE}",
        },
    }
    with open(output_dir / "manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2, allow_nan=False, default=json_value)


def generate_cache(config_key, output_dir, algorithms, max_users=None, scene_only=False, workers=1):
    config = read_config(config_key)
    specs = algorithm_specs()
    registry = AlgorithmRegistry()
    for algorithm in algorithms:
        spec = specs[algorithm]
        registry.add_algorithm(
            spec["labeler"],
            family=algorithm,
            external_params=spec.get("external_params"),
            **spec["params"],
        )

    sparse_df, diaries_df, buildings_df, users = load_inputs(config, max_users)
    if scene_only:
        output_dir.mkdir(parents=True, exist_ok=True)
        write_scene_json(output_dir, sparse_df, buildings_df, config_key)
        write_routes_json(output_dir, diaries_df, config["city_file"], config_key)
        return

    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True)
    write_shared_tables(output_dir, sparse_df, diaries_df)
    write_scene_json(output_dir, sparse_df, buildings_df, config_key)
    write_routes_json(output_dir, diaries_df, config["city_file"], config_key)

    frames = {
        algorithm: {"results": [], "metrics": []}
        for algorithm in algorithms
    }
    for user_output in tqdm(
        run_jobs(
            users.tolist(),
            sparse_df,
            diaries_df,
            registry,
            workers,
        ),
        total=len(users),
        desc=f"{config_key}: stop detection and metrics",
        unit="user",
    ):
        for algorithm, output in user_output.items():
            frames[algorithm]["results"].append(output["results"])
            frames[algorithm]["metrics"].append(output["metrics"])

    files = {}
    for algorithm in algorithms:
        files[algorithm] = write_algorithm(
            algorithm,
            specs[algorithm],
            list(registry.iter_algorithms(family=algorithm)),
            frames[algorithm],
            output_dir,
        )
    write_manifest(output_dir, config_key, files, users)


def main():
    args = parse_args()
    generate_cache(
        args.config_key,
        Path(args.output_dir),
        args.algorithms,
        args.max_users,
        args.scene_only,
        args.workers,
    )


if __name__ == "__main__":
    main()
