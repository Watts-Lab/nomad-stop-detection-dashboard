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


def load_configs(cache_dir, manifest):
    # configs.json holds every algorithm's swept parameters (full names, already
    # matching metrics/labels column names) plus the human-readable key, keyed by
    # config_id so it can be joined onto each algorithm's metrics.parquet.
    with open(cache_dir / manifest["shared_files"]["configs"], "r", encoding="utf-8") as f:
        payload = json.load(f)
    return pd.DataFrame(payload["configs"])


def output_name(algorithm):
    return f"{algorithm}_results.parquet"


def load_metrics(cache_dir, file_spec, algorithm_key, configs):
    metrics = pd.read_parquet(cache_dir / file_spec["metrics"])
    algo_configs = configs.loc[configs["algorithm"] == algorithm_key, ["config_id", "key"] + file_spec["parameter_columns"]]
    merged = metrics.merge(algo_configs, on="config_id", how="left")
    merged["algorithm"] = file_spec["display_name"]
    return merged


def ordered_columns(metrics, parameter_names):
    base = [column for column in BASE_COLUMNS if column in metrics.columns]
    params = [column for column in parameter_names if column in metrics.columns]
    return base + params


def write_algorithm_results(cache_dir, output_dir, algorithm_key, file_spec, configs):
    metrics = load_metrics(cache_dir, file_spec, algorithm_key, configs)
    metrics = metrics.loc[:, ordered_columns(metrics, file_spec["parameter_columns"])].sort_values(["key", "user_id"])
    output_path = output_dir / output_name(algorithm_key)
    metrics.to_parquet(output_path, engine="pyarrow", compression="zstd", index=False)
    return output_path, len(metrics), metrics["key"].nunique()


def main():
    args = parse_args()
    cache_dir = Path(args.cache_dir)
    output_dir = Path(args.output_dir)
    manifest = load_manifest(cache_dir)
    configs = load_configs(cache_dir, manifest)

    output_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    for algorithm_key in manifest["algorithm_keys"]:
        output_path, records, n_configs = write_algorithm_results(
            cache_dir,
            output_dir,
            algorithm_key,
            manifest["algorithms"][algorithm_key],
            configs,
        )
        rows.append({"algorithm": algorithm_key, "records": records, "configs": n_configs, "path": str(output_path)})

    print(pd.DataFrame(rows).to_string(index=False))


if __name__ == "__main__":
    main()
