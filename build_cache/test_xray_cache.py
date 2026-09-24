"""Regression checks for the v4-to-v5 cache migration."""

import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

import pyarrow as pa
import pyarrow.parquet as pq

from migrate_xray_cache import migrate_cache
from xray_schema import CACHE_FORMAT, XRAY_SCHEMAS


class XrayCacheTests(unittest.TestCase):
    def test_migration_preserves_values_and_row_groups(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            algorithms = {}
            originals = {}
            for algorithm, declaration in XRAY_SCHEMAS.items():
                columns = {
                    "user_id": ["a", "b"],
                    "config_id": [1, 1],
                    "cluster": [[0, 0, -1], [-1, -1, -1]],
                }
                if "core" in declaration["fields"]:
                    columns["core"] = [[0, -1, -1], [-1, -1, -1]]
                if declaration["fields"]:
                    columns["aux_time"] = [[None, 100, None], [None, None, None]]
                table = pa.table(columns)
                originals[algorithm] = table
                path = root / f"{algorithm}.parquet"
                pq.write_table(table, path, row_group_size=1, compression="zstd")
                algorithms[algorithm] = {"result_kind": "legacy", "results": path.name}
            manifest_path = root / "manifest.json"
            manifest_path.write_text(json.dumps({
                "format": "stop-detection-dashboard-parquet-cache-v4",
                "algorithms": algorithms,
            }))

            migrate_cache(root)
            manifest = json.loads(manifest_path.read_text())
            self.assertEqual(manifest["format"], CACHE_FORMAT)
            for algorithm, entry in manifest["algorithms"].items():
                self.assertEqual(entry["xray"], XRAY_SCHEMAS[algorithm])
                self.assertNotIn("result_kind", entry)
                result = pq.ParquetFile(root / entry["results"])
                self.assertEqual(result.num_row_groups, 2)
                expected = originals[algorithm]
                actual = result.read()
                self.assertEqual(actual["cluster"], expected["cluster"])
                for field in entry["xray"]["fields"]:
                    old_field = "aux_time" if field.endswith("_time") else field
                    self.assertEqual(actual[f"xray_{field}"], expected[old_field])
            # A second run does not rewrite v5 caches.
            before = manifest_path.read_bytes()
            migrate_cache(root)
            self.assertEqual(manifest_path.read_bytes(), before)

    def test_missing_results_require_explicit_manifest_only_mode(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "manifest.json"
            original = json.dumps({
                "format": "stop-detection-dashboard-parquet-cache-v4",
                "algorithms": {"lachesis": {"result_kind": "anchor", "results": "missing.parquet"}},
            })
            path.write_text(original)
            with self.assertRaises(FileNotFoundError):
                migrate_cache(root)
            self.assertEqual(path.read_text(), original)
            migrate_cache(root, manifest_only=True)
            self.assertEqual(json.loads(path.read_text())["format"], CACHE_FORMAT)


if __name__ == "__main__":
    unittest.main()
