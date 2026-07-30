import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys

from generate_algorithm_csv_cache import DEFAULT_ALGORITHMS
from generate_algorithm_csv_cache import REPO_ROOT
from generate_algorithm_csv_cache import generate_cache
from generate_gt_trajectories import generate_trajectories


CONFIG_DIR = Path(__file__).resolve().parent
SCENARIOS = [
    ("2_stops", REPO_ROOT / "cached_results" / "two-stop-cache", "two-stop"),
    ("low_ha", REPO_ROOT / "cached_results" / "four-stop-cache" / "low_ha", "four-stop-low-ha"),
    ("high_ha", REPO_ROOT / "cached_results" / "four-stop-cache" / "high_ha", "four-stop-high-ha"),
    ("commute_return", REPO_ROOT / "cached_results" / "commute-return-cache", "commute-return"),
]
PUBLIC_CACHE_DIR = REPO_ROOT / "dashboard" / "public" / "cached-results" / "stop-detection-cache"


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
    for config_key, _, _ in SCENARIOS:
        subprocess.run([sys.executable, str(CONFIG_DIR / "generate_configs.py"), config_key], check=True)

    if not args.skip_trajectories:
        generate_trajectories([config_key for config_key, _, _ in SCENARIOS])

    for config_key, output_dir, public_name in SCENARIOS:
        generate_cache(
            config_key,
            output_dir,
            args.algorithms,
            args.max_users,
            args.scene_only,
            args.workers,
        )
        public_dir = PUBLIC_CACHE_DIR / public_name
        if public_dir.exists():
            shutil.rmtree(public_dir)
        shutil.copytree(output_dir, public_dir)


if __name__ == "__main__":
    main()
