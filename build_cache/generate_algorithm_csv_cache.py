import argparse
import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

import nomad.data as data_folder
import nomad.io.base as loader
import nomad.stop_detection.dbstop as DBSTOP
import nomad.stop_detection.dbscan as TADBSCAN
import nomad.stop_detection.density_based as DENSITY_BASED
import nomad.stop_detection.lachesis as LACHESIS
import nomad.stop_detection.sequential as SEQUENTIAL
import nomad.stop_detection.utils as STOP_UTILS
import nomad.visit_attribution.visit_attribution as visits
from nomad.city_gen import City
from nomad.map_utils import blocks_to_mercator
from nomad.stop_detection.validation import compute_stop_detection_metrics


CONFIG_DIR = Path(__file__).resolve().parent
REPO_ROOT = CONFIG_DIR.parents[1]
NOMAD_DATA_DIR = Path(data_folder.__file__).parent
DEFAULT_OUTPUT_DIR = REPO_ROOT / "cached_results" / "stop-detection-cache"
DEFAULT_ALGORITHMS = ["lachesis", "sequential", "seqscan", "st_dbscan", "dbstop"]
PARAM_COLUMN_MAP = {
    "algorithm_id": "key",
    "dist_thresh": "dt",
    "delta_roam": "dr",
    "dt_max": "dmx",
    "dur_min": "dmn",
    "time_thresh": "tt",
    "min_pts": "mp",
    "back_merge": "bm",
    "remove_overlaps": "ro",
    "method": "m",
}


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate static CSV caches for the ECharts stop-detection dashboard."
    )
    parser.add_argument("--config-key", default="2_stops")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--algorithms", nargs="+", default=DEFAULT_ALGORITHMS)
    parser.add_argument("--sweep-min", type=float, default=5)
    parser.add_argument("--sweep-max", type=float, default=50)
    parser.add_argument("--sweep-points", type=int, default=10)
    parser.add_argument("--max-users", type=int, default=None)
    parser.add_argument("--scene-only", action="store_true")
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


def clean_output_dir(output_dir):
    output_dir.mkdir(parents=True, exist_ok=True)
    for path in output_dir.glob("*.csv"):
        path.unlink()
    for path in output_dir.glob("*.json"):
        path.unlink()
    for path in output_dir.iterdir():
        if path.is_dir():
            for child in path.glob("*.csv"):
                child.unlink()
            for child in path.glob("*.json"):
                child.unlink()


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
    buildings_subset = buildings_df.loc[buildings_df.id.isin(diaries_df["location"].dropna())].copy()

    sparse_df["precomp_locations"] = visits.poi_map(
        sparse_df,
        poi_table=poi_subset,
        data_crs="EPSG:3857",
        max_distance=20,
        location_id="location",
        x="x",
        y="y",
    )
    return sparse_df, diaries_df, poi_subset, buildings_subset, users


def write_shared_csvs(output_dir, sparse_df, diaries_df):
    traj_cols = ["x", "y", "datetime", "timestamp", "user_id", "ha", "tz_offset"]
    diary_cols = ["datetime", "timestamp", "duration", "location", "user_id", "x", "y", "tz_offset"]

    sparse_df.loc[:, traj_cols].sort_values(["user_id", "timestamp"]).to_csv(
        output_dir / "trajectory.csv", index=False
    )
    diaries_df.loc[:, diary_cols].sort_values(["user_id", "timestamp"]).to_csv(
        output_dir / "diary.csv", index=False
    )


def geometry_rings(geometry):
    return [
        [[float(x), float(y)] for x, y in geometry.exterior.coords]
    ]


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


def write_routes_json(output_dir, diaries_df, city_file, config_key):
    city = City.from_geopackage(resolve_config_path(city_file), load_gravity=False)
    city.compute_shortest_paths(callable_only=True)
    buildings = city.buildings_gdf.copy()
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
        "source": f"Garden City {config_key} all-building shortest paths generated by generate_algorithm_csv_cache.py",
        "doors": doors.to_dict("records"),
        "routes": routes,
    }
    with open(output_dir / "routes.json", "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))


def write_scene_json(output_dir, sparse_df, diaries_df, buildings_df, config_key):
    bounds = [
        float(sparse_df.x.min()),
        float(sparse_df.y.min()),
        float(sparse_df.x.max()),
        float(sparse_df.y.max()),
    ]
    print("buildings columns:", buildings_df.columns.tolist())
    buildings = buildings_df.loc[:, ["id", "building_type", "geometry"]].copy()
    buildings["rings"] = buildings.geometry.apply(geometry_rings)
    scene = {
        "crs": "EPSG:3857",
        "source": f"Garden City {config_key} generated by generate_algorithm_csv_cache.py",
        "bounds": bounds,
        "users": sparse_df.user_id.drop_duplicates().astype(str).tolist(),
        "buildings": buildings.loc[:, ["id", "building_type", "rings"]].to_dict("records"),
        "pings": sparse_df.loc[:, ["user_id", "x", "y", "timestamp"]]
        .sort_values(["user_id", "timestamp"])
        .to_dict("records"),
        "truth": diaries_df.loc[:, ["user_id", "location", "timestamp", "duration", "x", "y"]]
        .sort_values(["user_id", "timestamp"])
        .to_dict("records"),
    }
    with open(output_dir / "scene.json", "w", encoding="utf-8") as f:
        json.dump(scene, f, ensure_ascii=False)


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
    stops = clustered.groupby(["user_id", "cluster"], as_index=False).apply(
        summarize_stop_with_location, include_groups=False
    )
    return stops.reset_index(drop=True)


def label_lachesis(sparse_df, sweep_value):
    actual_value = 1.7 * float(sweep_value)
    labels = LACHESIS.lachesis_labels(
        sparse_df,
        dt_max=60,
        delta_roam=actual_value,
        dur_min=5,
        x="x",
        y="y",
        timestamp="timestamp",
    )
    return labels, {"dr": actual_value, "dmx": 60, "dmn": 5}


def label_sequential(sparse_df, sweep_value):
    actual_value = float(sweep_value)
    labels = SEQUENTIAL.detect_stops_labels(
        sparse_df,
        delta_roam=actual_value,
        dt_max=60,
        dur_min=5,
        method="centroid",
        x="x",
        y="y",
        timestamp="timestamp",
    )
    return labels, {"dr": actual_value, "dmx": 60, "dmn": 5, "m": "centroid"}


def label_seqscan(sparse_df, sweep_value):
    actual_value = float(sweep_value)
    labels = DENSITY_BASED.seqscan_labels(
        sparse_df,
        dist_thresh=actual_value,
        time_thresh=60,
        min_pts=2,
        dur_min=5,
        back_merge=False,
        x="x",
        y="y",
        timestamp="timestamp",
    )
    return labels, {"dt": actual_value, "tt": 60, "mp": 2, "dmn": 5, "bm": False}


def label_st_dbscan(sparse_df, sweep_value):
    actual_value = float(sweep_value)
    labels = TADBSCAN.ta_dbscan_labels(
        sparse_df,
        dist_thresh=actual_value,
        time_thresh=60,
        min_pts=2,
        remove_overlaps=True,
        x="x",
        y="y",
        timestamp="timestamp",
    )
    return labels, {"dt": actual_value, "tt": 60, "mp": 2, "ro": True}


def label_dbstop(sparse_df, sweep_value):
    actual_value = float(sweep_value)
    labels = DBSTOP.dbstop_labels(
        sparse_df,
        dist_thresh=actual_value,
        time_thresh=60,
        min_pts=2,
        dur_min=5,
        back_merge=False,
        x="x",
        y="y",
        timestamp="timestamp",
    )
    return labels, {"dt": actual_value, "tt": 60, "mp": 2, "dmn": 5, "bm": False}


def algorithm_specs():
    return pd.DataFrame(
        [
            {"algorithm": "lachesis", "display_name": "Lachesis", "sweep_parameter": "dr", "labeler": label_lachesis},
            {"algorithm": "sequential", "display_name": "Sequential", "sweep_parameter": "dr", "labeler": label_sequential},
            {"algorithm": "seqscan", "display_name": "SeqScan", "sweep_parameter": "dt", "labeler": label_seqscan},
            {"algorithm": "st_dbscan", "display_name": "ST-DBSCAN", "sweep_parameter": "dt", "labeler": label_st_dbscan},
            {"algorithm": "dbstop", "display_name": "DBSTOP", "sweep_parameter": "dt", "labeler": label_dbstop},
        ]
    ).set_index("algorithm")


def add_metadata(frame, algorithm, key, params):
    frame = frame.copy()
    frame["algorithm"] = algorithm
    frame["key"] = key
    for col, value in params.items():
        frame[col] = value
    return frame


def compute_metrics(stops_df, truth_df, algorithm, key, params):
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
        metrics["algorithm"] = algorithm
        metrics["key"] = key
        metrics.update(params)
        rows.append(metrics)
    return pd.DataFrame(rows)


def run_algorithm(spec, sparse_df, diaries_df, poi_subset, sweep_values, output_dir):
    labels_frames = []
    stops_frames = []
    metrics_frames = []
    algorithm = spec.name
    algorithm_dir = output_dir / algorithm
    algorithm_dir.mkdir(parents=True, exist_ok=True)

    for i, sweep_value in enumerate(sweep_values, start=1):
        labelled_frames = []
        params = None
        for _, user_sparse in sparse_df.groupby("user_id", sort=False):
            user_sparse = user_sparse.copy()
            labels, params = spec.labeler(user_sparse, sweep_value)
            user_labelled = user_sparse.drop(columns=["datetime"], errors="ignore").copy()
            user_labelled["cluster"] = labels
            labelled_frames.append(user_labelled)
        labelled = pd.concat(labelled_frames, ignore_index=True)
        key_parts = [f"{col}-{params[col]}" for col in sorted(params)]
        key = f"{i:03d}__{'__'.join(key_parts)}"

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
        labels_frames.append(add_metadata(labelled, algorithm, key, params))
        stops_frames.append(add_metadata(stops, algorithm, key, params))
        metrics_frames.append(compute_metrics(stops, diaries_df, algorithm, key, params))

    labels_df = pd.concat(labels_frames, ignore_index=True)
    stops_df = pd.concat(stops_frames, ignore_index=True)
    metrics_df = pd.concat(metrics_frames, ignore_index=True)

    labels_df.to_csv(algorithm_dir / "labels.csv", index=False)
    stops_df.to_csv(algorithm_dir / "stops.csv", index=False)
    metrics_df.to_csv(algorithm_dir / "metrics.csv", index=False)
    return {
        "display_name": spec.display_name,
        "sweep_parameter": spec.sweep_parameter,
        "labels": f"{algorithm}/labels.csv",
        "stops": f"{algorithm}/stops.csv",
        "metrics": f"{algorithm}/metrics.csv",
    }


def write_manifest(output_dir, config_key, files, users, sweep_values):
    manifest = {
        "config_key": config_key,
        "format": "stop-detection-dashboard-csv-cache-v1",
        "algorithms": list(files.keys()),
        "users": users.astype(str).tolist(),
        "sweep_values": [float(value) for value in sweep_values],
        "parameter_columns": PARAM_COLUMN_MAP,
        "shared_files": {
            "scene": "scene.json",
            "routes": "routes.json",
            "trajectory": "trajectory.csv",
            "diary": "diary.csv",
        },
        "files": files,
    }
    with open(output_dir / "manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)


def main():
    args = parse_args()
    output_dir = Path(args.output_dir)
    config = read_config(args.config_key)
    specs = algorithm_specs().loc[args.algorithms]
    sweep_values = np.linspace(args.sweep_min, args.sweep_max, args.sweep_points)

    sparse_df, diaries_df, poi_subset, buildings_df, users = load_inputs(config, args.max_users)
    if args.scene_only:
        output_dir.mkdir(parents=True, exist_ok=True)
        write_scene_json(output_dir, sparse_df, diaries_df, buildings_df, args.config_key)
        write_routes_json(output_dir, diaries_df, config["city_file"], args.config_key)
        return

    clean_output_dir(output_dir)
    write_shared_csvs(output_dir, sparse_df, diaries_df)
    write_scene_json(output_dir, sparse_df, diaries_df, buildings_df, args.config_key)
    write_routes_json(output_dir, diaries_df, config["city_file"], args.config_key)

    files = {}
    for _, spec in specs.iterrows():
        files[spec.name] = run_algorithm(spec, sparse_df, diaries_df, poi_subset, sweep_values, output_dir)
    write_manifest(output_dir, args.config_key, files, users, sweep_values)


if __name__ == "__main__":
    main()
