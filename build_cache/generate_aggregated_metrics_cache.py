#!/usr/bin/env python3
import argparse
import json
import shutil
from pathlib import Path

import pandas as pd


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CACHE_DIR = REPO_ROOT / "dashboard" / "public" / "cached-results" / "stop-detection-cache"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "dashboard" / "public" / "cached-results" / "aggregated-metrics"
SCENARIOS = [
    ("two-stop", "Two stops"),
    ("four-stop-low-ha", "Four stops · low home attachment"),
    ("four-stop-high-ha", "Four stops · high home attachment"),
    ("commute-return", "Commute and return"),
]
BASE_COLUMNS = [
    "precision",
    "recall",
    "f1",
    "user_id",
    "algorithm",
    "key",
    "missed_fraction",
    "merged_fraction",
    "split_fraction",
]
ALGORITHM_PROFILES = {
    "lachesis": {
        "dashboard_id": "lachesis",
        "display_name": "Lachesis",
        "defaults": {"delta_roam": 25, "dt_max": 60, "dur_min": 5},
    },
    "sequential_centroid": {
        "dashboard_id": "sequential-centroid",
        "display_name": "Sequential (Centroid)",
        "defaults": {"delta_roam": 25, "dt_max": 60, "dur_min": 5, "method": "centroid"},
    },
    "sequential_first": {
        "dashboard_id": "sequential-first",
        "display_name": "Sequential (First)",
        "defaults": {"delta_roam": 25, "dt_max": 60, "dur_min": 5, "method": "sliding"},
    },
    "gridbased": {
        "dashboard_id": "gridbased",
        "display_name": "Grid-Based",
        "defaults": {"cell_size": 100, "min_time": 5, "min_cluster_size": 2},
    },
    "st_dbscan": {
        "dashboard_id": "dbscan",
        "display_name": "ST-DBSCAN",
        "defaults": {"dist_thresh": 50, "time_thresh": 60, "min_pts": 3, "remove_overlaps": True},
    },
    "dbstop": {
        "dashboard_id": "dbstop",
        "display_name": "DBSTOP",
        "defaults": {"dist_thresh": 10, "time_thresh": 60, "min_pts": 3, "dur_min": 5, "back_merge": False},
    },
    "seqscan": {
        "dashboard_id": "seqscan",
        "display_name": "SeqScan",
        "defaults": {"dist_thresh": 10, "time_thresh": 60, "min_pts": 3, "dur_min": 5, "back_merge": False},
    },
    "hdbscan": {
        "dashboard_id": "hdbscan",
        "display_name": "HDBSCAN",
        "defaults": {"dist_thresh": 10, "time_thresh": 60, "min_pts": 3, "dur_min": 5, "min_cluster_size": 1},
    },
}


def parse_args():
    parser = argparse.ArgumentParser(description="Generate scenario-aware aggregated metrics cache files.")
    parser.add_argument("--cache-dir", default=str(DEFAULT_CACHE_DIR))
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    return parser.parse_args()


def load_json(path):
    with open(path, "r", encoding="utf-8") as file:
        return json.load(file)


def json_value(value):
    if pd.isna(value):
        return None
    if hasattr(value, "item"):
        return value.item()
    return value


def parameter_values(configs, parameter_columns):
    values = {}
    for column in parameter_columns:
        values[column] = [json_value(value) for value in configs[column].drop_duplicates().sort_values().tolist()]
    return values


def merge_metrics(metrics_path, configs, algorithm, parameter_columns):
    metrics = pd.read_parquet(metrics_path)
    algorithm_configs = configs.loc[
        configs["algorithm"] == algorithm,
        ["config_id", "key"] + parameter_columns,
    ]
    merged = metrics.merge(algorithm_configs, on="config_id", how="left", validate="many_to_one")
    if merged["key"].isna().any():
        raise ValueError(f"{metrics_path} contains metrics without a matching configuration")
    return merged


def validate_defaults(algorithm, defaults, values):
    for name, value in defaults.items():
        if value not in values[name]:
            raise ValueError(f"{algorithm} default {name}={value!r} is not present in the cache")


def validate_sweeps(algorithm, configs, parameter_columns, defaults):
    for parameter in parameter_columns:
        values = configs[parameter].dropna().drop_duplicates()
        if not pd.api.types.is_numeric_dtype(values) or len(values) < 2:
            continue
        fixed = {name: value for name, value in defaults.items() if name != parameter}
        selected = configs.loc[(configs[list(fixed)] == pd.Series(fixed)).all(axis=1)]
        if selected["config_id"].nunique() != len(values):
            raise ValueError(f"{algorithm} defaults do not define one configuration per {parameter} value")


def write_scenario(cache_dir, output_dir, scenario, scenario_label, root_manifest):
    scenario_dir = cache_dir / scenario
    manifest = load_json(scenario_dir / "manifest.json")
    configs = pd.DataFrame(load_json(scenario_dir / manifest["shared_files"]["configs"])["configs"])
    scenario_output_dir = output_dir / scenario
    scenario_output_dir.mkdir(parents=True, exist_ok=True)
    algorithms = {}

    for algorithm in root_manifest["algorithm_keys"]:
        file_spec = manifest["algorithms"][algorithm]
        parameter_columns = file_spec["parameter_columns"]
        profile = ALGORITHM_PROFILES[algorithm]
        algorithm_configs = configs.loc[configs["algorithm"] == algorithm]
        values = parameter_values(algorithm_configs, parameter_columns)
        validate_defaults(algorithm, profile["defaults"], values)
        validate_sweeps(algorithm, algorithm_configs, parameter_columns, profile["defaults"])
        metrics = merge_metrics(scenario_dir / file_spec["metrics"], configs, algorithm, parameter_columns)
        metrics["algorithm"] = profile["display_name"]
        columns = [column for column in BASE_COLUMNS if column in metrics] + parameter_columns
        output_path = scenario_output_dir / f"{algorithm}.parquet"
        metrics.loc[:, columns].sort_values(["key", "user_id"]).to_parquet(
            output_path,
            engine="pyarrow",
            compression="zstd",
            index=False,
        )
        algorithms[algorithm] = {
            "path": f"{scenario}/{algorithm}.parquet",
            "records": len(metrics),
            "configs": len(algorithm_configs),
            "users": metrics["user_id"].nunique(),
            "parameter_values": values,
        }

    return {
        "id": scenario,
        "label": scenario_label,
        "users": len(manifest["users"]),
        "algorithms": algorithms,
    }


def write_manifest(output_dir, scenario_entries, root_manifest):
    algorithms = {}
    reference_scenario = scenario_entries[0]
    for algorithm in root_manifest["algorithm_keys"]:
        file_spec = root_manifest["algorithms"][algorithm]
        profile = ALGORITHM_PROFILES[algorithm]
        values = reference_scenario["algorithms"][algorithm]["parameter_values"]
        algorithms[algorithm] = {
            "dashboard_id": profile["dashboard_id"],
            "display_name": profile["display_name"],
            "parameters": file_spec["parameter_columns"],
            "sweep_parameters": [
                parameter
                for parameter in file_spec["parameter_columns"]
                if len(values[parameter]) > 1
                and all(isinstance(value, (int, float)) and not isinstance(value, bool) for value in values[parameter])
            ],
            "defaults": profile["defaults"],
        }
    payload = {
        "version": 1,
        "source_cache": "cached-results/stop-detection-cache",
        "metrics": ["precision", "recall", "f1", "missed_fraction", "merged_fraction", "split_fraction"],
        "defaults": {
            "mode": "single",
            "left_algorithm": "lachesis",
            "right_algorithm": "sequential_centroid",
        },
        "algorithms": algorithms,
        "scenarios": scenario_entries,
    }
    with open(output_dir / "manifest.json", "w", encoding="utf-8") as file:
        json.dump(payload, file, indent=2)
        file.write("\n")


def main():
    args = parse_args()
    cache_dir = Path(args.cache_dir)
    output_dir = Path(args.output_dir)
    root_manifest = load_json(cache_dir / SCENARIOS[0][0] / "manifest.json")

    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True)

    scenario_entries = []
    for scenario, label in SCENARIOS:
        scenario_entries.append(write_scenario(cache_dir, output_dir, scenario, label, root_manifest))
    write_manifest(output_dir, scenario_entries, root_manifest)

    rows = [
        {
            "scenario": scenario["id"],
            "algorithm": algorithm,
            "records": data["records"],
            "configs": data["configs"],
        }
        for scenario in scenario_entries
        for algorithm, data in scenario["algorithms"].items()
    ]
    print(pd.DataFrame(rows).to_string(index=False))


if __name__ == "__main__":
    main()
