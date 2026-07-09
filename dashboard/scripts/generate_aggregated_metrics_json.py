#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

import pandas as pd


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CACHE_DIR = REPO_ROOT / "cached_results" / "stop-detection-cache"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "dashboard" / "public" / "echarts-prototype"
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


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate ECharts aggregated metrics parquet files from the parquet cache."
    )
    parser.add_argument("--cache-dir", default=str(DEFAULT_CACHE_DIR))
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    return parser.parse_args()


def load_manifest(cache_dir):
    with open(cache_dir / "manifest.json", "r", encoding="utf-8") as f:
        return json.load(f)


def output_name(algorithm):
    return f"{algorithm}_results.parquet"


def abbrev_to_parameter(manifest):
    # manifest maps parameter -> abbreviated cache column; invert it and drop the
    # non-sweep algorithm identifier so only real parameters get renamed.
    return {
        abbrev: parameter
        for parameter, abbrev in manifest["parameter_columns"].items()
        if parameter != "algorithm_id"
    }


def load_metrics(cache_dir, file_spec, abbrev_map):
    # metrics.parquet holds per-(user, config) scores keyed by config_id; the swept
    # parameters and human-readable key live in configs.parquet, so join on config_id.
    metrics = pd.read_parquet(cache_dir / file_spec["metrics"])
    configs = pd.read_parquet(cache_dir / file_spec["configs"])
    merged = metrics.merge(configs, on="config_id", how="left").rename(columns=abbrev_map)
    merged["algorithm"] = file_spec["display_name"]
    return merged


def ordered_columns(metrics, parameter_names):
    base = [column for column in BASE_COLUMNS if column in metrics.columns]
    params = [column for column in parameter_names if column in metrics.columns]
    return base + params


def write_algorithm_results(cache_dir, output_dir, algorithm, file_spec, abbrev_map):
    metrics = load_metrics(cache_dir, file_spec, abbrev_map)
    parameter_names = [abbrev_map[abbrev] for abbrev in file_spec["parameter_columns"] if abbrev in abbrev_map]
    metrics = metrics.loc[:, ordered_columns(metrics, parameter_names)].sort_values(["key", "user_id"])
    output_path = output_dir / output_name(algorithm)
    metrics.to_parquet(output_path, engine="pyarrow", compression="zstd", index=False)
    return output_path, len(metrics), metrics["key"].nunique()


def main():
    args = parse_args()
    cache_dir = Path(args.cache_dir)
    output_dir = Path(args.output_dir)
    manifest = load_manifest(cache_dir)
    abbrev_map = abbrev_to_parameter(manifest)

    output_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    for algorithm in manifest["algorithms"]:
        output_path, records, configs = write_algorithm_results(
            cache_dir,
            output_dir,
            algorithm,
            manifest["files"][algorithm],
            abbrev_map,
        )
        rows.append({"algorithm": algorithm, "records": records, "configs": configs, "path": str(output_path)})

    print(pd.DataFrame(rows).to_string(index=False))


if __name__ == "__main__":
    main()
