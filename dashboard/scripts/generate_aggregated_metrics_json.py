#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

import pandas as pd


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_DIR = REPO_ROOT / "dashboard" / "public" / "echarts-prototype"
CACHE_SCENARIOS = [
    ("two-stop", REPO_ROOT / "cached_results" / "two-stop-cache"),
    ("four-stop-low-ha", REPO_ROOT / "cached_results" / "four-stop-cache" / "low_ha"),
    ("four-stop-high-ha", REPO_ROOT / "cached_results" / "four-stop-cache" / "high_ha"),
    ("commute-return", REPO_ROOT / "cached_results" / "commute-return-cache"),
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


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate ECharts aggregated metrics parquet files from the parquet cache."
    )
    parser.add_argument("--cache-dir")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    return parser.parse_args()


def load_manifest(cache_dir):
    with open(cache_dir / "manifest.json", "r", encoding="utf-8") as f:
        return json.load(f)


def load_configs(cache_dir, file_spec):
    with open(cache_dir / file_spec["configs"], "r", encoding="utf-8") as f:
        rows = json.load(f)["configs"]
    return pd.DataFrame([
        {"config_id": row["config_id"], "key": row["key"], **row["params"]}
        for row in rows
    ])


def output_name(algorithm):
    return f"{algorithm}_results.parquet"


def load_metrics(cache_dir, file_spec, configs):
    metrics = pd.read_parquet(cache_dir / file_spec["metrics"])
    merged = metrics.merge(configs.loc[:, ["config_id", "key"]], on="config_id", how="left")
    merged["algorithm"] = file_spec["display_name"]
    return merged


def ordered_columns(metrics, parameter_names):
    base = [column for column in BASE_COLUMNS if column in metrics.columns]
    params = [column for column in parameter_names if column in metrics.columns]
    return base + params


def write_algorithm_results(cache_dir, output_dir, algorithm_key, file_spec):
    configs = load_configs(cache_dir, file_spec)
    parameter_names = [column for column in configs if column not in {"config_id", "key"}]
    metrics = load_metrics(cache_dir, file_spec, configs)
    metrics = metrics.loc[:, ordered_columns(metrics, parameter_names)].sort_values(["key", "user_id"])
    output_path = output_dir / output_name(algorithm_key)
    metrics.to_parquet(output_path, engine="pyarrow", compression="zstd", index=False)
    return output_path, len(metrics), len(configs)


def main():
    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    for stale_output in output_dir.glob("*_results.parquet"):
        stale_output.unlink()

    rows = []
    cache_scenarios = (
        [(None, Path(args.cache_dir))]
        if args.cache_dir
        else CACHE_SCENARIOS
    )
    for scenario, cache_dir in cache_scenarios:
        scenario_output_dir = output_dir / scenario if scenario else output_dir
        scenario_output_dir.mkdir(parents=True, exist_ok=True)
        manifest = load_manifest(cache_dir)
        for algorithm_key in manifest["algorithm_keys"]:
            output_path, records, n_configs = write_algorithm_results(
                cache_dir,
                scenario_output_dir,
                algorithm_key,
                manifest["algorithms"][algorithm_key],
            )
            rows.append({"scenario": scenario, "algorithm": algorithm_key, "records": records, "configs": n_configs, "path": str(output_path)})

    print(pd.DataFrame(rows).to_string(index=False))


if __name__ == "__main__":
    main()
