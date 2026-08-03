import argparse
from concurrent.futures import ProcessPoolExecutor
from itertools import product
import json
import os
from pathlib import Path
import shutil

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
from nomad.stop_detection.validation import compute_stop_detection_metrics

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
PARAM_COLUMN_MAP = {
    "algorithm_id": "key",
    "cell_size": "cell_size",
    "dist_thresh": "dist_thresh",
    "delta_roam": "delta_roam",
    "dt_max": "dt_max",
    "dur_min": "dur_min",
    "time_thresh": "time_thresh",
    "min_pts": "min_pts",
    "min_time": "min_time",
    "min_cluster_size": "min_cluster_size",
    "back_merge": "back_merge",
    "remove_overlaps": "remove_overlaps",
    "method": "method",
}
PARAM_DISPLAY_NAMES = {
    "dr": "delta_roam",
    "dt": "dist_thresh",
    "dmx": "dt_max",
    "dmn": "dur_min",
    "tt": "time_thresh",
    "mp": "min_pts",
    "cs": "cell_size",
    "mt": "min_time",
    "mcs": "min_cluster_size",
    "bm": "back_merge",
    "ro": "remove_overlaps",
    "m": "method",
}
CORE_POINT_COLUMNS = [
    "user_id",
    "timestamp",
    "role",
    "source_timestamp",
    "core_timestamp",
    "cluster",
    "config_id",
]
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


def clean_output_dir(output_dir):
    output_dir.mkdir(parents=True, exist_ok=True)
    for path in output_dir.iterdir():
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink()


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


def write_parquet_dataset(frame, path):
    write_single_parquet(compact_coordinates(frame), path / PARQUET_PART_FILE)


def write_single_parquet(frame, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_parquet(path, index=False, compression=PARQUET_COMPRESSION)


def write_shared_tables(output_dir, sparse_df, diaries_df):
    traj_cols = ["user_id", "timestamp", "x", "y"]
    diary_cols = ["timestamp", "duration", "user_id", "x", "y"]

    write_parquet_dataset(
        sparse_df.loc[:, traj_cols],
        output_dir / "trajectory",
    )
    write_parquet_dataset(
        diaries_df.loc[:, diary_cols].sort_values(["user_id", "timestamp"]),
        output_dir / "diary",
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


def write_scene_json(output_dir, sparse_df, diaries_df, buildings_df, config_key):
    scene_pings = compact_coordinates(sparse_df.loc[:, ["user_id", "x", "y", "timestamp"]])
    scene_truth = compact_coordinates(
        diaries_df.loc[:, ["user_id", "location", "timestamp", "duration", "x", "y"]]
    )
    bounds = [
        int(scene_pings.x.min()),
        int(scene_pings.y.min()),
        int(scene_pings.x.max()),
        int(scene_pings.y.max()),
    ]
    buildings = buildings_df.loc[:, ["id", "building_type", "geometry"]].copy()
    buildings["rings"] = buildings.geometry.apply(geometry_rings)
    buildings["type"] = buildings["building_type"].map(frontend_building_type)
    scene = {
        "crs": "EPSG:3857",
        "source": f"Garden City {config_key} generated by generate_algorithm_cache.py",
        "bounds": bounds,
        "users": sparse_df.user_id.drop_duplicates().astype(str).tolist(),
        "buildings": json_records(buildings.loc[:, ["id", "type", "rings"]]),
        "pings": json_records(
            scene_pings
        ),
        "truth": json_records(
            scene_truth.sort_values(["user_id", "timestamp"])
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


def label_lachesis(sparse_df, params, key):
    return SEQUENTIAL.lachesis_labels(
        sparse_df,
        dt_max=params["dmx"],
        delta_roam=params["dr"],
        dur_min=params["dmn"],
        config_key=key,
        traj_cols=TRAJ_COLS,
    )


def label_sequential_centroid(sparse_df, params, key):
    return SEQUENTIAL.detect_stops_labels(
        sparse_df,
        delta_roam=params["dr"],
        dt_max=params["dmx"],
        dur_min=params["dmn"],
        method="centroid",
        return_anchor_points=True,
        config_key=key,
        traj_cols=TRAJ_COLS,
    )


def label_sequential_first(sparse_df, params, key):
    return SEQUENTIAL.detect_stops_labels(
        sparse_df,
        delta_roam=params["dr"],
        dt_max=params["dmx"],
        dur_min=params["dmn"],
        method="sliding",
        return_anchor_points=True,
        config_key=key,
        traj_cols=TRAJ_COLS,
    )


def label_gridbased(sparse_df, params, key):
    grid_df = sparse_df.copy()
    grid_df["location_id"] = (
        "g-"
        + np.floor(grid_df["x"] / params["cs"]).astype(int).astype(str)
        + "-"
        + np.floor(grid_df["y"] / params["cs"]).astype(int).astype(str)
    )
    return SEQUENTIAL.grid_based_labels(
        grid_df,
        time_thresh=params["mt"],
        min_cluster_size=2,
        dur_min=params["mt"],
        traj_cols={**TRAJ_COLS, "location_id": "location_id"},
    )


def label_seqscan(sparse_df, params, key):
    return DENSITY.seqscan_labels(
        sparse_df,
        dist_thresh=params["dt"],
        time_thresh=params["tt"],
        min_pts=params["mp"],
        dur_min=params["dmn"],
        back_merge=False,
        return_core_points=True,
        config_key=key,
        traj_cols=TRAJ_COLS,
    )


def label_st_dbscan(sparse_df, params, key):
    return DENSITY.ta_dbscan_labels(
        sparse_df,
        dist_thresh=params["dt"],
        time_thresh=params["tt"],
        min_pts=params["mp"],
        remove_overlaps=params["ro"],
        return_core_points=True,
        config_key=key,
        traj_cols=TRAJ_COLS,
    )


def label_dbstop(sparse_df, params, key):
    return DENSITY.dbstop_labels(
        sparse_df,
        dist_thresh=params["dt"],
        time_thresh=params["tt"],
        min_pts=params["mp"],
        dur_min=params["dmn"],
        back_merge=False,
        return_core_points=True,
        config_key=key,
        traj_cols=TRAJ_COLS,
    )


def label_hdbscan(sparse_df, params, key):
    return DENSITY.hdbscan_labels(
        sparse_df,
        dist_thresh=params["dt"],
        time_thresh=params["tt"],
        min_pts=params["mp"],
        min_cluster_size=1,
        dur_min=params["dmn"],
        return_core_points=True,
        config_key=key,
        traj_cols=TRAJ_COLS,
    )


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
                "family": "lachesis",
                "display_name": "Lachesis",
                "parameter_columns": full_parameter_columns(["dr", "dmx", "dmn"]),
                "labeler": label_lachesis,
                "param_grid": param_grid(dr=DELTA_ROAM_VALUES, dmx=DT_MAX_VALUES, dmn=DUR_MIN_VALUES),
                "core_points": False,
            },
            {
                "algorithm": "sequential_centroid",
                "family": "sequential",
                "display_name": "Sequential (centroid-anchored)",
                "parameter_columns": full_parameter_columns(["dr", "dmx", "dmn", "m"]),
                "labeler": label_sequential_centroid,
                "param_grid": [
                    {**params, "m": "centroid"}
                    for params in param_grid(dr=DELTA_ROAM_VALUES, dmx=DT_MAX_VALUES, dmn=DUR_MIN_VALUES)
                ],
            },
            {
                "algorithm": "sequential_first",
                "family": "sequential",
                "display_name": "Sequential (first-anchored)",
                "parameter_columns": full_parameter_columns(["dr", "dmx", "dmn", "m"]),
                "labeler": label_sequential_first,
                "param_grid": [
                    {**params, "m": "sliding"}
                    for params in param_grid(dr=DELTA_ROAM_VALUES, dmx=DT_MAX_VALUES, dmn=DUR_MIN_VALUES)
                ],
            },
            {
                "algorithm": "gridbased",
                "family": "gridbased",
                "display_name": "Grid-Based",
                "parameter_columns": full_parameter_columns(["cs", "mt", "mcs"]),
                "labeler": label_gridbased,
                "param_grid": [
                    {**params, "mcs": 2}
                    for params in param_grid(cs=CELL_SIZE_VALUES, mt=MIN_TIME_VALUES)
                ],
                "core_points": False,
            },
            {
                "algorithm": "st_dbscan",
                "family": "st_dbscan",
                "display_name": "ST-DBSCAN",
                "parameter_columns": full_parameter_columns(["dt", "tt", "mp", "ro"]),
                "labeler": label_st_dbscan,
                "param_grid": [
                    {**params, "ro": True}
                    for params in param_grid(dt=DIST_THRESH_VALUES, tt=TIME_THRESH_VALUES, mp=MIN_PTS_VALUES)
                ],
            },
            {
                "algorithm": "dbstop",
                "family": "dbstop",
                "display_name": "DBSTOP",
                "parameter_columns": full_parameter_columns(["dt", "tt", "mp", "dmn", "bm"]),
                "labeler": label_dbstop,
                "param_grid": [{**params, "bm": False} for params in density_params],
            },
            {
                "algorithm": "seqscan",
                "family": "seqscan",
                "display_name": "SeqScan",
                "parameter_columns": full_parameter_columns(["dt", "tt", "mp", "dmn", "bm"]),
                "labeler": label_seqscan,
                "param_grid": [{**params, "bm": False} for params in density_params],
            },
            {
                "algorithm": "hdbscan",
                "family": "hdbscan",
                "display_name": "HDBSCAN",
                "parameter_columns": full_parameter_columns(["dt", "tt", "mp", "dmn", "mcs"]),
                "labeler": label_hdbscan,
                "param_grid": [{**params, "mcs": 1} for params in density_params],
            },
        ]
    ).set_index("algorithm")


def add_metadata(frame, config_id):
    frame = frame.copy()
    frame["config_id"] = config_id
    return frame


def compact_core_points(frame):
    frame = frame.copy()
    if "core_timestamp" not in frame:
        frame["core_timestamp"] = frame["timestamp"]
    frame = frame.loc[:, CORE_POINT_COLUMNS].copy()
    frame["user_id"] = frame["user_id"].astype("category")
    frame["role"] = frame["role"].astype("int8")
    frame["timestamp"] = frame["timestamp"].astype("int64")
    frame["source_timestamp"] = frame["source_timestamp"].astype("Int64")
    frame["core_timestamp"] = frame["core_timestamp"].astype("Int64")
    frame["cluster"] = frame["cluster"].astype("int16")
    frame["config_id"] = frame["config_id"].astype("uint16")
    return frame


def split_label_result(result):
    if isinstance(result, tuple):
        labels, core_points = result
        core_points = core_points.rename(columns={
            "start_timestamp": "source_timestamp",
            "label": "cluster",
        })
        return labels, core_points.drop(columns=["config_key"])
    raise RuntimeError(
        "Installed NOMAD did not return core plotting data. "
        "Install NOMAD from the cores_refactor branch before regenerating the cache."
    )


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


def initialize_worker(spec, sparse_df, diaries_df, poi_subset):
    global JOB_CONTEXT
    JOB_CONTEXT = spec, sparse_df, diaries_df, poi_subset


def run_config_job(job):
    params, config_id, key = job
    spec, sparse_df, diaries_df, poi_subset = JOB_CONTEXT
    algorithm = spec["algorithm"]
    labelled_frames = []
    core_points_frames = []

    for _, user_sparse in sparse_df.groupby("user_id", sort=False):
        user_sparse = user_sparse.copy()
        result = spec["labeler"](user_sparse, params, key)
        if spec.get("core_points", True):
            labels, core_points = split_label_result(result)
        else:
            labels = result
            core_points = pd.DataFrame(columns=CORE_POINT_COLUMNS)
        user_labelled = user_sparse.drop(columns=["datetime"], errors="ignore").copy()
        user_labelled["cluster"] = labels
        labelled_frames.append(user_labelled)
        if not core_points.empty:
            core_points_frames.append(compact_core_points(add_metadata(core_points, config_id)))

    labelled = pd.concat(labelled_frames, ignore_index=True)
    config_frame = pd.DataFrame(
        [{
            "algorithm": algorithm,
            "family": spec["family"],
            "display_name": spec["display_name"],
            "config_id": config_id,
            "key": key,
            "label_column": key,
            **full_param_names(params),
        }]
    )

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
    labels = (
        labelled.loc[:, ["user_id", "timestamp", "cluster"]]
        .sort_values(["user_id", "timestamp"])
        .rename(columns={"cluster": key})
        .reset_index(drop=True)
    )
    return {
        "config_id": config_id,
        "labels": labels.iloc[:, 2].astype(np.int16).rename(key),
        "stops": add_metadata(stops, config_id),
        "metrics": compute_metrics(stops, diaries_df, key, config_id),
        "config": config_frame,
        "core_points": pd.concat(core_points_frames, ignore_index=True) if core_points_frames else pd.DataFrame(columns=CORE_POINT_COLUMNS),
    }


def config_key(algorithm, index, params):
    key_parts = [f"{col}-{format_key_value(params[col])}" for col in sorted(params)]
    return f"{algorithm}__{index:03d}__{'__'.join(key_parts)}"


def format_key_value(value):
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def full_param_names(params):
    return {PARAM_DISPLAY_NAMES[col]: value for col, value in params.items()}


def full_parameter_columns(columns):
    return [PARAM_DISPLAY_NAMES[col] for col in columns]


def run_jobs(jobs, spec, sparse_df, diaries_df, poi_subset, workers):
    if workers == 1:
        initialize_worker(spec, sparse_df, diaries_df, poi_subset)
        yield from map(run_config_job, jobs)
        return

    chunksize = max(1, len(jobs) // (workers * 4))
    with ProcessPoolExecutor(
        max_workers=workers,
        initializer=initialize_worker,
        initargs=(spec, sparse_df, diaries_df, poi_subset),
    ) as executor:
        yield from executor.map(run_config_job, jobs, chunksize=chunksize)


def run_algorithm(spec, sparse_df, diaries_df, poi_subset, output_dir, workers):
    labels_frames = []
    stops_frames = []
    metrics_frames = []
    config_frames = []
    core_points_frames = []
    algorithm = spec.name
    algorithm_dir = output_dir / algorithm
    algorithm_dir.mkdir(parents=True, exist_ok=True)
    spec_data = spec.to_dict()
    spec_data["algorithm"] = algorithm
    jobs = [
        (
            params,
            i,
            config_key(algorithm, i, params),
        )
        for i, params in enumerate(spec.param_grid, start=1)
    ]

    for result in run_jobs(jobs, spec_data, sparse_df, diaries_df, poi_subset, workers):
        labels_frames.append(result["labels"])
        stops_frames.append(result["stops"])
        metrics_frames.append(result["metrics"])
        config_frames.append(result["config"])
        if not result["core_points"].empty:
            core_points_frames.append(result["core_points"])

    labels_index = sparse_df.loc[:, ["user_id", "timestamp"]]
    labels_df = pd.concat(
        [labels_index] + labels_frames,
        axis=1,
    )
    nonempty_stops = [frame for frame in stops_frames if not frame.empty]
    stops_df = pd.concat(nonempty_stops, ignore_index=True) if nonempty_stops else pd.DataFrame(
        columns=["user_id", "cluster", "timestamp", "duration", "x", "y", "location", "config_id"]
    )
    metrics_df = pd.concat(metrics_frames, ignore_index=True).drop(columns=["algorithm"], errors="ignore")
    configs_df = pd.concat(config_frames, ignore_index=True)
    core_points_df = pd.concat(core_points_frames, ignore_index=True) if core_points_frames else pd.DataFrame(columns=CORE_POINT_COLUMNS)

    labels_df.to_parquet(
        algorithm_dir / "labels.parquet",
        index=False,
        compression=PARQUET_COMPRESSION,
    )
    stops_out = compact_coordinates(stops_df.loc[:, ["user_id", "cluster", "timestamp", "duration", "x", "y", "config_id"]])
    write_single_parquet(
        stops_out,
        algorithm_dir / "stops.parquet",
    )
    has_core_points = spec.get("core_points", True)
    if has_core_points:
        write_single_parquet(core_points_df.loc[:, CORE_POINT_COLUMNS], algorithm_dir / "core_points.parquet")
    metrics_df.to_parquet(
        algorithm_dir / "metrics.parquet",
        index=False,
        compression=PARQUET_COMPRESSION,
    )
    manifest_entry = {
        "display_name": spec.display_name,
        "parameter_columns": spec.parameter_columns,
        "labels": f"{algorithm}/labels.parquet",
        "labels_layout": "wide_by_config",
        "label_join_key": ["user_id", "timestamp"],
        "stops": f"{algorithm}/stops.parquet",
        "metrics": f"{algorithm}/metrics.parquet",
    }
    if has_core_points:
        manifest_entry.update({
            "core_points": f"{algorithm}/core_points.parquet",
        })
    return manifest_entry, configs_df


def write_configs_json(output_dir, configs_df):
    records = json_records(configs_df.sort_values(["algorithm", "config_id"]))
    by_algorithm = {
        algorithm: {
            "display_name": group.display_name.iloc[0],
            "family": group.family.iloc[0],
            "configs": json_records(
                group.drop(columns=["display_name", "family", "algorithm"]).sort_values("config_id")
            ),
        }
        for algorithm, group in configs_df.groupby("algorithm", sort=False)
    }
    payload = {
        "configs": records,
        "algorithms": by_algorithm,
    }
    with open(output_dir / "configs.json", "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2, allow_nan=False, default=json_value)


def write_manifest(output_dir, config_key, files, users):
    manifest = {
        "config_key": config_key,
        "format": "stop-detection-dashboard-parquet-cache-v3",
        "coordinate_precision": COORDINATE_PRECISION,
        "coordinate_dtype": COORDINATE_DTYPE,
        "algorithm_keys": list(files.keys()),
        "algorithms": files,
        "users": users.astype(str).tolist(),
        "parameter_columns": PARAM_COLUMN_MAP,
        "shared_files": {
            "scene": "scene.json",
            "routes": "routes.json",
            "trajectory": f"trajectory/{PARQUET_PART_FILE}",
            "trajectory_dataset": "trajectory",
            "diary": f"diary/{PARQUET_PART_FILE}",
            "diary_dataset": "diary",
            "configs": "configs.json",
        },
    }
    with open(output_dir / "manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2, allow_nan=False, default=json_value)


def generate_cache(config_key, output_dir, algorithms, max_users=None, scene_only=False, workers=1):
    config = read_config(config_key)
    specs = algorithm_specs().loc[algorithms]

    sparse_df, diaries_df, poi_subset, buildings_df, users = load_inputs(config, max_users)
    if scene_only:
        output_dir.mkdir(parents=True, exist_ok=True)
        write_scene_json(output_dir, sparse_df, diaries_df, buildings_df, config_key)
        write_routes_json(output_dir, diaries_df, config["city_file"], config_key)
        return

    clean_output_dir(output_dir)
    write_shared_tables(output_dir, sparse_df, diaries_df)
    write_scene_json(output_dir, sparse_df, diaries_df, buildings_df, config_key)
    write_routes_json(output_dir, diaries_df, config["city_file"], config_key)

    files = {}
    config_frames = []
    for _, spec in specs.iterrows():
        algorithm_files, algorithm_configs = run_algorithm(spec, sparse_df, diaries_df, poi_subset, output_dir, workers)
        files[spec.name] = algorithm_files
        config_frames.append(algorithm_configs)
    write_configs_json(output_dir, pd.concat(config_frames, ignore_index=True))
    write_manifest(output_dir, config_key, files, users)


def main():
    args = parse_args()
    generate_cache(args.config_key, Path(args.output_dir), args.algorithms, args.max_users, args.scene_only, args.workers)


if __name__ == "__main__":
    main()
