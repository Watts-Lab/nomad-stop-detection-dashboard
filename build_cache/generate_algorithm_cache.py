import argparse
from concurrent.futures import ProcessPoolExecutor
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory

import geopandas as gpd
import numpy as np
import pandas as pd

import nomad.data as data_folder
import nomad.io.base as loader
import nomad.stop_detection.density_algs as DENSITY
import nomad.stop_detection.sequential_algs as SEQUENTIAL
import nomad.stop_detection.utils as STOP_UTILS
import nomad.visit_attribution.visit_attribution as visits
from nomad.city_gen import City
from nomad.map_utils import blocks_to_mercator
from nomad.stop_detection.validation import AlgorithmRegistry, compute_stop_detection_metrics

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
    "hdbscan",
]
DELTA_ROAM_VALUES = [float(value) for value in np.arange(5, 120.1, 2.5)]
DIST_THRESH_VALUES = [float(value) for value in np.arange(0, 50.1, 2.5)]
DUR_MIN_VALUES = [5, 10]
TIME_THRESH_VALUES = [60, 240]
DT_MAX_VALUES = [60, 120]
MIN_PTS_VALUES = [2, 3]
CELL_SIZE_VALUES = [25, 37.5, 50, 75, 100, 175, 250, 375, 500]
MIN_TIME_VALUES = [5, 10]
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

    sparse_df["precomp_locations"] = visits.poi_map(
        sparse_df,
        poi_table=poi_subset,
        data_crs="EPSG:3857",
        max_distance=20,
        location_id="location",
        x="x",
        y="y",
    )
    return sparse_df, diaries_df, poi_subset, buildings_df, users


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


def frontend_building_type(value):
    if value == "workplace":
        return "work"
    if value == "retail":
        return "shop"
    return value


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
    buildings["type"] = buildings["building_type"].map(frontend_building_type)
    scene = {
        "crs": "EPSG:3857",
        "source": f"Garden City {config_key} generated by generate_algorithm_cache.py",
        "bounds": bounds,
        "buildings": json_records(buildings.loc[:, ["id", "type", "rings"]]),
    }
    with open(output_dir / "scene.json", "w", encoding="utf-8") as f:
        json.dump(scene, f, ensure_ascii=False, allow_nan=False, default=json_value)


def summarize_stop_with_location(group_df):
    return STOP_UTILS.summarize_stop(
        group_df,
        x="x",
        y="y",
        timestamp="timestamp",
        keep_col_names=True,
        passthrough_cols=["location"],
        complete_output=False,
    )


def build_stops(labelled_pings):
    clustered = labelled_pings.loc[labelled_pings["cluster"] != -1].copy()
    if clustered.empty:
        return pd.DataFrame(columns=["user_id", "cluster", "timestamp", "duration", "x", "y", "location"])
    stops = clustered.groupby(["user_id", "cluster"], as_index=False).apply(
        summarize_stop_with_location, include_groups=False
    )
    return stops.reset_index(drop=True)


def label_lachesis(sparse_df, delta_roam, dt_max, dur_min):
    return SEQUENTIAL.lachesis_labels(
        sparse_df,
        dt_max=dt_max,
        delta_roam=delta_roam,
        dur_min=dur_min,
        return_anchors=True,
        traj_cols=TRAJ_COLS,
    )


def label_sequential(sparse_df, delta_roam, dt_max, dur_min, method):
    return SEQUENTIAL.detect_stops_labels(
        sparse_df,
        delta_roam=delta_roam,
        dt_max=dt_max,
        dur_min=dur_min,
        method=method,
        traj_cols=TRAJ_COLS,
    )


def label_gridbased(sparse_df, cell_size, min_time, min_cluster_size):
    grid_df = sparse_df.copy()
    grid_df["location_id"] = (
        "g-"
        + np.floor(grid_df["x"] / cell_size).astype(int).astype(str)
        + "-"
        + np.floor(grid_df["y"] / cell_size).astype(int).astype(str)
    )
    return SEQUENTIAL.grid_based_labels(
        grid_df,
        time_thresh=min_time,
        min_cluster_size=min_cluster_size,
        dur_min=min_time,
        traj_cols={**TRAJ_COLS, "location_id": "location_id"},
    )


def label_seqscan(sparse_df, dist_thresh, time_thresh, min_pts, dur_min, back_merge):
    return DENSITY.seqscan_labels(
        sparse_df,
        dist_thresh=dist_thresh,
        time_thresh=time_thresh,
        min_pts=min_pts,
        dur_min=dur_min,
        back_merge=back_merge,
        return_cores=True,
        traj_cols=TRAJ_COLS,
    )


def label_st_dbscan(sparse_df, dist_thresh, time_thresh, min_pts, remove_overlaps):
    return DENSITY.ta_dbscan_labels(
        sparse_df,
        dist_thresh=dist_thresh,
        time_thresh=time_thresh,
        min_pts=min_pts,
        remove_overlaps=remove_overlaps,
        return_cores=True,
        traj_cols=TRAJ_COLS,
    )


def label_dbstop(sparse_df, dist_thresh, time_thresh, min_pts, dur_min, back_merge):
    return DENSITY.dbstop_labels(
        sparse_df,
        dist_thresh=dist_thresh,
        time_thresh=time_thresh,
        min_pts=min_pts,
        dur_min=dur_min,
        back_merge=back_merge,
        return_cores=True,
        traj_cols=TRAJ_COLS,
    )


def label_hdbscan(sparse_df, dist_thresh, time_thresh, min_pts, dur_min, min_cluster_size):
    return DENSITY.hdbscan_labels(
        sparse_df,
        dist_thresh=dist_thresh,
        time_thresh=time_thresh,
        min_pts=min_pts,
        min_cluster_size=min_cluster_size,
        dur_min=dur_min,
        return_cores=True,
        traj_cols=TRAJ_COLS,
    )


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
            "labeler": label_lachesis,
            "result_kind": "anchor",
            "params": {
                "delta_roam": DELTA_ROAM_VALUES,
                "dt_max": DT_MAX_VALUES,
                "dur_min": DUR_MIN_VALUES,
            },
        },
        "sequential_centroid": {
            "display_name": "Sequential (centroid-anchored)",
            "labeler": label_sequential,
            "result_kind": "labels",
            "params": {
                "delta_roam": DELTA_ROAM_VALUES,
                "dt_max": DT_MAX_VALUES,
                "dur_min": DUR_MIN_VALUES,
                "method": "centroid",
            },
        },
        "sequential_first": {
            "display_name": "Sequential (first-anchored)",
            "labeler": label_sequential,
            "result_kind": "labels",
            "params": {
                "delta_roam": DELTA_ROAM_VALUES,
                "dt_max": DT_MAX_VALUES,
                "dur_min": DUR_MIN_VALUES,
                "method": "sliding",
            },
        },
        "gridbased": {
            "display_name": "Grid-Based",
            "labeler": label_gridbased,
            "result_kind": "labels",
            "params": {
                "cell_size": CELL_SIZE_VALUES,
                "min_time": MIN_TIME_VALUES,
                "min_cluster_size": 2,
            },
        },
        "st_dbscan": {
            "display_name": "ST-DBSCAN",
            "labeler": label_st_dbscan,
            "result_kind": "density",
            "params": {
                "dist_thresh": DIST_THRESH_VALUES,
                "time_thresh": TIME_THRESH_VALUES,
                "min_pts": MIN_PTS_VALUES,
                "remove_overlaps": True,
            },
        },
        "dbstop": {
            "display_name": "DBSTOP",
            "labeler": label_dbstop,
            "result_kind": "density",
            "params": {**density_params, "back_merge": False},
        },
        "seqscan": {
            "display_name": "SeqScan",
            "labeler": label_seqscan,
            "result_kind": "density",
            "params": {**density_params, "back_merge": False},
        },
        "hdbscan": {
            "display_name": "HDBSCAN",
            "labeler": label_hdbscan,
            "result_kind": "density",
            "params": {**density_params, "min_cluster_size": 1},
        },
    }


def compute_metrics(stops_df, truth_df, key, config_id):
    rows = []
    for user_id, truth in truth_df.groupby("user_id"):
        user_stops = stops_df.loc[stops_df.user_id == user_id]
        metrics = compute_stop_detection_metrics(
            stops=user_stops,
            truth=truth,
            user_id=user_id,
            algorithm=key,
            traj_cols={"location_id": "location"},
            timestamp="timestamp",
        )
        metrics["config_id"] = config_id
        rows.append(metrics)
    return pd.DataFrame(rows)


def initialize_worker(sparse_df, diaries_df, poi_subset):
    global JOB_CONTEXT
    JOB_CONTEXT = sparse_df, diaries_df, poi_subset


def run_config_job(job):
    algorithm, config_id = job
    sparse_df, diaries_df, poi_subset = JOB_CONTEXT
    key = algorithm["algorithm"]
    labelled_frames = []
    result_rows = []

    for user_id, user_sparse in sparse_df.groupby("user_id", sort=False):
        result = algorithm["call"](user_sparse)
        if isinstance(result, pd.Series):
            result = result.to_frame()
        result = result.rename(columns={
            "promotion_time": "aux_time",
            "anchor_time": "aux_time",
        })

        result_row = {
            "user_id": user_id,
            "config_id": config_id,
            "cluster": result["cluster"].to_numpy(dtype=np.int16),
        }
        if "core" in result:
            result_row["core"] = result["core"].to_numpy(dtype=np.int16)
        if "aux_time" in result:
            aux_time = result["aux_time"].astype(object)
            result_row["aux_time"] = aux_time.where(aux_time.notna(), None).tolist()
        result_rows.append(result_row)

        user_labelled = user_sparse.drop(columns=["datetime"], errors="ignore")
        user_labelled["cluster"] = result["cluster"]
        labelled_frames.append(user_labelled)

    labelled = pd.concat(labelled_frames, ignore_index=True)
    labelled["location"] = labelled["precomp_locations"]
    labelled["location"] = visits.point_in_polygon(
        labelled,
        poi_table=poi_subset,
        method="majority",
        location_id="location",
        recompute_location=False,
        x="x",
        y="y",
    )

    stops = build_stops(labelled)
    return {
        "results": pd.DataFrame(result_rows),
        "stops": stops.assign(config_id=config_id),
        "metrics": compute_metrics(stops, diaries_df, key, config_id),
    }


def run_jobs(jobs, sparse_df, diaries_df, poi_subset, workers):
    if workers == 1:
        initialize_worker(sparse_df, diaries_df, poi_subset)
        yield from map(run_config_job, jobs)
        return

    chunksize = max(1, len(jobs) // (workers * 4))
    with ProcessPoolExecutor(
        max_workers=workers,
        initializer=initialize_worker,
        initargs=(sparse_df, diaries_df, poi_subset),
    ) as executor:
        yield from executor.map(run_config_job, jobs, chunksize=chunksize)


def run_algorithm(algorithm, spec, registry_algorithms, sparse_df, diaries_df, poi_subset, output_dir, workers):
    results_frames = []
    stops_frames = []
    metrics_frames = []
    algorithm_dir = output_dir / algorithm
    algorithm_dir.mkdir(parents=True, exist_ok=True)
    jobs = list(zip(registry_algorithms, range(1, len(registry_algorithms) + 1)))
    configs = [
        {
            "config_id": config_id,
            "key": registry_algorithm["algorithm"],
            "params": registry_algorithm["params"],
        }
        for registry_algorithm, config_id in jobs
    ]

    for result in run_jobs(jobs, sparse_df, diaries_df, poi_subset, workers):
        results_frames.append(result["results"])
        stops_frames.append(result["stops"])
        metrics_frames.append(result["metrics"])

    nonempty_stops = [frame for frame in stops_frames if not frame.empty]
    stops_df = pd.concat(nonempty_stops, ignore_index=True) if nonempty_stops else pd.DataFrame(
        columns=["user_id", "cluster", "timestamp", "duration", "x", "y", "location", "config_id"]
    )
    metrics_df = pd.concat(metrics_frames, ignore_index=True).drop(columns=["algorithm"], errors="ignore")
    results_df = (
        pd.concat(results_frames, ignore_index=True)
        .sort_values(["user_id", "config_id"])
        .reset_index(drop=True)
    )
    results_df["config_id"] = results_df["config_id"].astype("uint16")
    write_single_parquet(
        results_df,
        algorithm_dir / "results.parquet",
        row_group_size=len(configs),
    )

    stops_out = compact_coordinates(
        stops_df.loc[:, ["user_id", "cluster", "timestamp", "duration", "x", "y", "config_id"]]
    )
    write_single_parquet(
        stops_out,
        algorithm_dir / "stops.parquet",
    )
    metrics_df.to_parquet(
        algorithm_dir / "metrics.parquet",
        index=False,
        compression=PARQUET_COMPRESSION,
    )
    with open(algorithm_dir / "configs.json", "w", encoding="utf-8") as f:
        json.dump({"configs": configs}, f, ensure_ascii=False, separators=(",", ":"), default=json_value)

    manifest_entry = {
        "display_name": spec["display_name"],
        "result_kind": spec["result_kind"],
        "configs": f"{algorithm}/configs.json",
        "results": f"{algorithm}/results.parquet",
        "stops": f"{algorithm}/stops.parquet",
        "metrics": f"{algorithm}/metrics.parquet",
    }
    return manifest_entry


def write_manifest(output_dir, config_key, files, users):
    manifest = {
        "config_key": config_key,
        "format": "stop-detection-dashboard-parquet-cache-v4",
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
        registry.add_algorithm(spec["labeler"], family=algorithm, **spec["params"])

    sparse_df, diaries_df, poi_subset, buildings_df, users = load_inputs(config, max_users)
    if scene_only:
        output_dir.mkdir(parents=True, exist_ok=True)
        write_scene_json(output_dir, sparse_df, buildings_df, config_key)
        write_routes_json(output_dir, diaries_df, config["city_file"], config_key)
        return

    output_dir.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(
        dir=output_dir.parent, prefix=f".{output_dir.name}-"
    ) as temp_dir:
        staging_root = Path(temp_dir)
        staging_dir = staging_root / "cache"
        backup_dir = staging_root.with_name(f"{staging_root.name}-previous")
        staging_dir.mkdir()
        write_shared_tables(staging_dir, sparse_df, diaries_df)
        write_scene_json(staging_dir, sparse_df, buildings_df, config_key)
        write_routes_json(
            staging_dir, diaries_df, config["city_file"], config_key
        )

        files = {}
        for algorithm in algorithms:
            files[algorithm] = run_algorithm(
                algorithm,
                specs[algorithm],
                list(registry.iter_algorithms(family=algorithm)),
                sparse_df,
                diaries_df,
                poi_subset,
                staging_dir,
                workers,
            )
        write_manifest(staging_dir, config_key, files, users)

        if output_dir.exists():
            output_dir.replace(backup_dir)
        try:
            staging_dir.replace(output_dir)
        except BaseException:
            if backup_dir.exists():
                backup_dir.replace(output_dir)
            raise
        if backup_dir.exists():
            backup_dir.replace(staging_root / "previous")


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
