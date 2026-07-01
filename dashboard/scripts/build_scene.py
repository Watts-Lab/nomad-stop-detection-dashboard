#!/usr/bin/env python3
"""Refresh cached algorithm-compare scene.json with full Garden City buildings.

Run from the repository root:

    python dashboard/scripts/build_scene.py

Optional overrides:

    python dashboard/scripts/build_scene.py \\
        --buildings /path/to/garden-city-buildings-mercator.parquet \\
        --scene cached_results/algorithm-compare/scene.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import geopandas as gpd
import nomad.data as data_folder

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SCENE = REPO_ROOT / "cached_results" / "algorithm-compare" / "scene.json"
DEFAULT_BUILDINGS = Path(data_folder.__file__).parent / "garden-city-buildings-mercator.parquet"


def _ring_coords(geometry):
    """geometry: shapely geometry. Returns list of exterior rings."""
    if geometry.geom_type == "Polygon":
        geometries = [geometry]
    elif geometry.geom_type == "MultiPolygon":
        geometries = list(geometry.geoms)
    else:
        return []

    rings = []
    for polygon in geometries:
        rings.append(
            [[round(float(x), 3), round(float(y), 3)] for x, y in polygon.exterior.coords]
        )
    return rings


def _buildings_from_city(city):
    """city: GeoDataFrame. Returns list of scene building records."""
    records = []
    for _, row in city.iterrows():
        rings = _ring_coords(row.geometry)
        if not rings:
            continue
        records.append(
            {
                "id": str(row["id"]),
                "type": str(row.get("building_type", "building")),
                "rings": rings,
            }
        )
    return records


def _scene_bounds(city, pings):
    """city: GeoDataFrame. pings: list of dict with x, y keys."""
    x0, y0, x1, y1 = city.total_bounds
    if not pings:
        return [float(x0), float(y0), float(x1), float(y1)]

    xs = [float(ping["x"]) for ping in pings]
    ys = [float(ping["y"]) for ping in pings]
    return [
        min(min(xs), float(x0)),
        min(min(ys), float(y0)),
        max(max(xs), float(x1)),
        max(max(ys), float(y1)),
    ]


def refresh_scene(scene_path, buildings_path):
    """scene_path: Path. buildings_path: Path. Updates scene.json buildings and bounds."""
    scene_path = Path(scene_path)
    buildings_path = Path(buildings_path)

    if not scene_path.exists():
        raise FileNotFoundError(f"Scene file not found: {scene_path}")
    if not buildings_path.exists():
        raise FileNotFoundError(f"Buildings file not found: {buildings_path}")

    scene = json.loads(scene_path.read_text(encoding="utf-8"))
    city = gpd.read_parquet(buildings_path)
    buildings = _buildings_from_city(city)
    pings = scene.get("pings", [])

    scene["crs"] = scene.get("crs", "EPSG:3857")
    scene["buildings"] = buildings
    scene["bounds"] = _scene_bounds(city, pings)

    scene_path.write_text(json.dumps(scene, separators=(",", ":")), encoding="utf-8")
    return len(buildings), scene["bounds"]


def main():
    parser = argparse.ArgumentParser(description="Refresh scene.json with full Garden City buildings.")
    parser.add_argument("--scene", type=Path, default=DEFAULT_SCENE)
    parser.add_argument("--buildings", type=Path, default=DEFAULT_BUILDINGS)
    args = parser.parse_args()

    try:
        building_count, bounds = refresh_scene(args.scene, args.buildings)
    except FileNotFoundError as err:
        print(err, file=sys.stderr)
        return 1

    print(f"Wrote {building_count} buildings to {args.scene}")
    print(f"bounds: {bounds}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
