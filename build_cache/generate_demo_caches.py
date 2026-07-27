import argparse
import os
from pathlib import Path
import subprocess
import sys

from four_stop_trajectories import generate_trajectories as generate_four_stop_trajectories
from generate_algorithm_csv_cache import DEFAULT_ALGORITHMS
from generate_algorithm_csv_cache import REPO_ROOT
from generate_algorithm_csv_cache import generate_cache
from two_stop_trajectories import generate_trajectories as generate_two_stop_trajectories


CONFIG_DIR = Path(__file__).resolve().parent
SCENARIOS = [
    ("2_stops", REPO_ROOT / "cached_results" / "stop-detection-cache"),
    ("low_ha", REPO_ROOT / "cached_results" / "four-stop-cache" / "low_ha"),
    ("high_ha", REPO_ROOT / "cached_results" / "four-stop-cache" / "high_ha"),
]


def parse_args():
    parser = argparse.ArgumentParser(description="Generate all demo stop-detection caches.")
    parser.add_argument("--algorithms", nargs="+", default=DEFAULT_ALGORITHMS)
    parser.add_argument("--max-users", type=int, default=None)
    parser.add_argument("--scene-only", action="store_true")
    parser.add_argument("--skip-trajectories", action="store_true")
    parser.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    return parser.parse_args()


def main():
    args = parse_args()
    for config_key, _ in SCENARIOS:
        subprocess.run([sys.executable, str(CONFIG_DIR / "generate_configs.py"), config_key], check=True)

    if not args.skip_trajectories:
        generate_two_stop_trajectories(["2_stops"])
        generate_four_stop_trajectories(["low_ha", "high_ha"])

    for config_key, output_dir in SCENARIOS:
        generate_cache(
            config_key,
            output_dir,
            args.algorithms,
            args.max_users,
            args.scene_only,
            args.workers,
        )


if __name__ == "__main__":
    main()
