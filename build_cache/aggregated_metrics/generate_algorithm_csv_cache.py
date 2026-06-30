import argparse
from itertools import product
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
import nomad.stop_detection.grid_based as GRIDBASED
import nomad.stop_detection.hdbscan as HDBSCAN
import nomad.stop_detection.lachesis as LACHESIS
import nomad.stop_detection.sequential as SEQUENTIAL
import nomad.stop_detection.utils as STOP_UTILS
import nomad.visit_attribution.visit_attribution as visits
from nomad.stop_detection.validation import compute_stop_detection_metrics


CONFIG_DIR = Path(__file__).resolve().parent
REPO_ROOT = CONFIG_DIR.parents[1]
NOMAD_DATA_DIR = Path(data_folder.__file__).parent
DEFAULT_OUTPUT_DIR = REPO_ROOT / "cached_results" / "stop-detection-cache"
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
DELTA_ROAM_VALUES = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]
DIST_THRESH_VALUES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50]
DUR_MIN_VALUES = [5, 10]
TIME_THRESH_VALUES = [60, 240]
DT_MAX_VALUES = [60, 120]
MIN_PTS_VALUES = [2, 3]
CELL_SIZE_VALUES = [25, 50, 100, 250, 500]
MIN_TIME_VALUES = [5, 10]
PARAM_COLUMN_MAP = {
    "algorithm_id": "key",
    "cell_size": "cs",
    "dist_thresh": "dt",
    "delta_roam": "dr",
    "dt_max": "dmx",
    "dur_min": "dmn",
    "time_thresh": "tt",
    "min_pts": "mp",
    "min_time": "mt",
    "min_cluster_size": "mcs",
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


def write_scene_json(output_dir, sparse_df, diaries_df, buildings_df, config_key):
    bounds = [
        float(sparse_df.x.min()),
        float(sparse_df.y.min()),
        float(sparse_df.x.max()),
        float(sparse_df.y.max()),
    ]
    buildings = buildings_df.loc[:, ["id", "building_type", "geometry"]].copy()
    buildings["rings"] = buildings.geometry.apply(geometry_rings)
    buildings["type"] = buildings["building_type"].map(frontend_building_type)
    scene = {
        "crs": "EPSG:3857",
        "source": f"Garden City {config_key} generated by generate_algorithm_csv_cache.py",
        "bounds": bounds,
        "users": sparse_df.user_id.drop_duplicates().astype(str).tolist(),
        "buildings": json_records(buildings.loc[:, ["id", "type", "rings"]]),
        "pings": json_records(
            sparse_df.loc[:, ["user_id", "x", "y", "timestamp"]].sort_values(["user_id", "timestamp"])
        ),
        "truth": json_records(
            diaries_df.loc[:, ["user_id", "location", "timestamp", "duration", "x", "y"]]
            .sort_values(["user_id", "timestamp"])
        ),
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


def param_grid(**values):
    keys = list(values)
    return [dict(zip(keys, row)) for row in product(*(values[key] for key in keys))]


def label_lachesis(sparse_df, params):
    labels = LACHESIS.lachesis_labels(
        sparse_df,
        dt_max=params["dmx"],
        delta_roam=params["dr"],
        dur_min=params["dmn"],
        x="x",
        y="y",
        timestamp="timestamp",
    )
    return labels


def label_sequential_centroid(sparse_df, params):
    labels = SEQUENTIAL.detect_stops_labels(
        sparse_df,
        delta_roam=params["dr"],
        dt_max=params["dmx"],
        dur_min=params["dmn"],
        method="centroid",
        x="x",
        y="y",
        timestamp="timestamp",
    )
    return labels


def label_sequential_first(sparse_df, params):
    labels = SEQUENTIAL.detect_stops_labels(
        sparse_df,
        delta_roam=params["dr"],
        dt_max=params["dmx"],
        dur_min=params["dmn"],
        method="sliding",
        x="x",
        y="y",
        timestamp="timestamp",
    )
    return labels


def label_gridbased(sparse_df, params):
    grid_df = sparse_df.copy()
    grid_df["location_id"] = (
        "g-"
        + np.floor(grid_df["x"] / params["cs"]).astype(int).astype(str)
        + "-"
        + np.floor(grid_df["y"] / params["cs"]).astype(int).astype(str)
    )
    labels = GRIDBASED.grid_based_labels(
        grid_df,
        time_thresh=params["mt"],
        min_cluster_size=2,
        dur_min=params["mt"],
        traj_cols={"user_id": "user_id", "timestamp": "timestamp", "location_id": "location_id"},
    )
    return labels


def label_seqscan(sparse_df, params):
    labels = DENSITY_BASED.seqscan_labels(
        sparse_df,
        dist_thresh=params["dt"],
        time_thresh=params["tt"],
        min_pts=params["mp"],
        dur_min=params["dmn"],
        back_merge=False,
        x="x",
        y="y",
        timestamp="timestamp",
    )
    return labels


def label_st_dbscan(sparse_df, params):
    labels = TADBSCAN.ta_dbscan_labels(
        sparse_df,
        dist_thresh=params["dt"],
        time_thresh=params["tt"],
        min_pts=params["mp"],
        remove_overlaps=params["ro"],
        x="x",
        y="y",
        timestamp="timestamp",
    )
    return labels


def label_dbstop(sparse_df, params):
    labels = DBSTOP.dbstop_labels(
        sparse_df,
        dist_thresh=params["dt"],
        time_thresh=params["tt"],
        min_pts=params["mp"],
        dur_min=params["dmn"],
        back_merge=False,
        x="x",
        y="y",
        timestamp="timestamp",
    )
    return labels


def label_hdbscan(sparse_df, params):
    labels = HDBSCAN.hdbscan_labels(
        sparse_df,
        dist_thresh=params["dt"],
        time_thresh=params["tt"],
        min_pts=params["mp"],
        min_cluster_size=1,
        dur_min=params["dmn"],
        x="x",
        y="y",
        timestamp="timestamp",
    )
    return labels


def algorithm_specs():
    density_params = param_grid(
        dt=DIST_THRESH_VALUES,
        tt=TIME_THRESH_VALUES,
        mp=MIN_PTS_VALUES,
        dmn=DUR_MIN_VALUES,
    )
    return pd.DataFrame(
        [
            {
                "algorithm": "lachesis",
                "display_name": "Lachesis",
                "parameter_columns": ["dr", "dmx", "dmn"],
                "labeler": label_lachesis,
                "param_grid": param_grid(dr=DELTA_ROAM_VALUES, dmx=DT_MAX_VALUES, dmn=DUR_MIN_VALUES),
            },
            {
                "algorithm": "sequential_centroid",
                "display_name": "Sequential (centroid-anchored)",
                "parameter_columns": ["dr", "dmx", "dmn", "m"],
                "labeler": label_sequential_centroid,
                "param_grid": [
                    {**params, "m": "centroid"}
                    for params in param_grid(dr=DELTA_ROAM_VALUES, dmx=DT_MAX_VALUES, dmn=DUR_MIN_VALUES)
                ],
            },
            {
                "algorithm": "sequential_first",
                "display_name": "Sequential (first-anchored)",
                "parameter_columns": ["dr", "dmx", "dmn", "m"],
                "labeler": label_sequential_first,
                "param_grid": [
                    {**params, "m": "sliding"}
                    for params in param_grid(dr=DELTA_ROAM_VALUES, dmx=DT_MAX_VALUES, dmn=DUR_MIN_VALUES)
                ],
            },
            {
                "algorithm": "gridbased",
                "display_name": "Grid-Based",
                "parameter_columns": ["cs", "mt", "mcs"],
                "labeler": label_gridbased,
                "param_grid": [
                    {**params, "mcs": 2}
                    for params in param_grid(cs=CELL_SIZE_VALUES, mt=MIN_TIME_VALUES)
                ],
            },
            {
                "algorithm": "st_dbscan",
                "display_name": "ST-DBSCAN",
                "parameter_columns": ["dt", "tt", "mp", "ro"],
                "labeler": label_st_dbscan,
                "param_grid": [
                    {**params, "ro": True}
                    for params in param_grid(dt=DIST_THRESH_VALUES, tt=TIME_THRESH_VALUES, mp=MIN_PTS_VALUES)
                ],
            },
            {
                "algorithm": "dbstop",
                "display_name": "DBSTOP",
                "parameter_columns": ["dt", "tt", "mp", "dmn", "bm"],
                "labeler": label_dbstop,
                "param_grid": [{**params, "bm": False} for params in density_params],
            },
            {
                "algorithm": "seqscan",
                "display_name": "SeqScan",
                "parameter_columns": ["dt", "tt", "mp", "dmn", "bm"],
                "labeler": label_seqscan,
                "param_grid": [{**params, "bm": False} for params in density_params],
            },
            {
                "algorithm": "hdbscan",
                "display_name": "HDBSCAN",
                "parameter_columns": ["dt", "tt", "mp", "dmn", "mcs"],
                "labeler": label_hdbscan,
                "param_grid": [{**params, "mcs": 1} for params in density_params],
            },
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


def config_key(index, params):
    key_parts = [f"{col}-{params[col]}" for col in sorted(params)]
    return f"{index:03d}__{'__'.join(key_parts)}"


def run_algorithm(spec, sparse_df, diaries_df, poi_subset, output_dir):
    labels_frames = []
    stops_frames = []
    metrics_frames = []
    cached_configs = []
    algorithm = spec.name
    algorithm_dir = output_dir / algorithm
    algorithm_dir.mkdir(parents=True, exist_ok=True)

    for i, params in enumerate(spec.param_grid, start=1):
        labelled_frames = []
        for _, user_sparse in sparse_df.groupby("user_id", sort=False):
            user_sparse = user_sparse.copy()
            labels = spec.labeler(user_sparse, params)
            user_labelled = user_sparse.drop(columns=["datetime"], errors="ignore").copy()
            user_labelled["cluster"] = labels
            labelled_frames.append(user_labelled)
        labelled = pd.concat(labelled_frames, ignore_index=True)
        key = config_key(i, params)
        cached_configs.append({"key": key, "params": params.copy()})

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
        "parameter_columns": spec.parameter_columns,
        "labels": f"{algorithm}/labels.csv",
        "stops": f"{algorithm}/stops.csv",
        "metrics": f"{algorithm}/metrics.csv",
        "configs": cached_configs,
    }


def write_manifest(output_dir, config_key, files, users):
    manifest = {
        "config_key": config_key,
        "format": "stop-detection-dashboard-csv-cache-v1",
        "algorithms": list(files.keys()),
        "users": users.astype(str).tolist(),
        "parameter_columns": PARAM_COLUMN_MAP,
        "shared_files": {
            "scene": "scene.json",
            "trajectory": "trajectory.csv",
            "diary": "diary.csv",
        },
        "files": files,
    }
    with open(output_dir / "manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2, allow_nan=False, default=json_value)


def main():
    args = parse_args()
    output_dir = Path(args.output_dir)
    config = read_config(args.config_key)
    specs = algorithm_specs().loc[args.algorithms]

    sparse_df, diaries_df, poi_subset, buildings_df, users = load_inputs(config, args.max_users)
    if args.scene_only:
        output_dir.mkdir(parents=True, exist_ok=True)
        write_scene_json(output_dir, sparse_df, diaries_df, buildings_df, args.config_key)
        return

    clean_output_dir(output_dir)
    write_shared_csvs(output_dir, sparse_df, diaries_df)
    write_scene_json(output_dir, sparse_df, diaries_df, buildings_df, args.config_key)

    files = {}
    for _, spec in specs.iterrows():
        files[spec.name] = run_algorithm(spec, sparse_df, diaries_df, poi_subset, output_dir)
    write_manifest(output_dir, args.config_key, files, users)


if __name__ == "__main__":
    main()
