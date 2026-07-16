import argparse
import os
from pathlib import Path

from generate_algorithm_csv_cache import DEFAULT_ALGORITHMS
from generate_algorithm_csv_cache import REPO_ROOT
from generate_algorithm_csv_cache import generate_cache


DEFAULT_CONFIG_KEYS = ["low_ha", "high_ha"]
DEFAULT_OUTPUT_DIR = REPO_ROOT / "cached_results" / "four-stop-cache"


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate frontend-ready stop-detection caches for the four-stop trajectories."
    )
    parser.add_argument("--config-keys", nargs="+", default=DEFAULT_CONFIG_KEYS)
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--algorithms", nargs="+", default=DEFAULT_ALGORITHMS)
    parser.add_argument("--max-users", type=int, default=None)
    parser.add_argument("--scene-only", action="store_true")
    parser.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    return parser.parse_args()


def main():
    args = parse_args()
    output_root = Path(args.output_dir)

    for config_key in args.config_keys:
        generate_cache(
            config_key,
            output_root / config_key,
            args.algorithms,
            args.max_users,
            args.scene_only,
            args.workers,
        )


if __name__ == "__main__":
    main()
