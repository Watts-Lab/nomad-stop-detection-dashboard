"""Migrate cache v4 to v5 without rerunning stop detection (requires PyArrow)."""

import argparse
import json
from pathlib import Path
from tempfile import TemporaryDirectory

import pyarrow.parquet as pq

from xray_schema import CACHE_FORMAT, XRAY_SCHEMAS


def migrate_cache(cache_dir, manifest_only=False):
    """Migrate one cache directory; manifest_only is for source metadata copies."""
    manifest_path = cache_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    if manifest["format"] == CACHE_FORMAT:
        return
    if manifest["format"] != "stop-detection-dashboard-parquet-cache-v4":
        raise ValueError(f"Unsupported cache format in {manifest_path}")

    # Stage and verify every result before replacing files; publish the manifest last.
    with TemporaryDirectory(prefix=".xray-v5-", dir=cache_dir) as staging:
        replacements = []
        for algorithm, entry in manifest["algorithms"].items():
            declaration = XRAY_SCHEMAS[algorithm]
            renames = {
                "aux_time" if field.endswith("_time") else field: f"xray_{field}"
                for field in declaration["fields"]
            }
            path = cache_dir / entry["results"]
            if path.exists() and renames:
                original = pq.ParquetFile(path)
                names = original.schema_arrow.names
                if not renames.keys() <= set(names):
                    raise ValueError(f"Missing required X-ray columns in {path}")
                metadata = dict(original.schema_arrow.metadata or {})
                if b"pandas" in metadata:
                    pandas_metadata = json.loads(metadata[b"pandas"])
                    for column in pandas_metadata["columns"]:
                        for key in ("name", "field_name"):
                            column[key] = renames.get(column[key], column[key])
                    metadata[b"pandas"] = json.dumps(pandas_metadata).encode()
                staged = Path(staging) / f"{algorithm}.parquet"
                schema = original.schema_arrow
                renamed_schema = schema.empty_table().rename_columns(
                    [renames.get(name, name) for name in names]
                ).replace_schema_metadata(metadata).schema
                compression = original.metadata.row_group(0).column(0).compression.lower()
                with pq.ParquetWriter(staged, renamed_schema, compression=compression) as writer:
                    for index in range(original.num_row_groups):
                        table = original.read_row_group(index).rename_columns(renamed_schema.names)
                        writer.write_table(table.replace_schema_metadata(metadata), row_group_size=table.num_rows)
                converted = pq.ParquetFile(staged)
                if converted.num_row_groups != original.num_row_groups:
                    raise ValueError(f"Row-group count changed in {path}")
                for index in range(original.num_row_groups):
                    expected = original.read_row_group(index).rename_columns(renamed_schema.names)
                    if not expected.equals(converted.read_row_group(index), check_metadata=False):
                        raise ValueError(f"Result values changed in {path}, row group {index}")
                replacements.append((staged, path))
            elif not path.exists() and not manifest_only:
                raise FileNotFoundError(path)
            entry.pop("result_kind")
            entry["xray"] = declaration

        manifest["format"] = CACHE_FORMAT
        staged_manifest = Path(staging) / "manifest.json"
        staged_manifest.write_text(json.dumps(manifest, indent=2) + "\n")
        for staged, path in replacements:
            staged.replace(path)
        staged_manifest.replace(manifest_path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cache_dirs", nargs="+", type=Path)
    parser.add_argument("--manifest-only", action="store_true", help="Allow source copies with missing result files.")
    args = parser.parse_args()
    for cache_dir in args.cache_dirs:
        migrate_cache(cache_dir, args.manifest_only)
        print(f"{cache_dir}: {CACHE_FORMAT}")


if __name__ == "__main__":
    main()
