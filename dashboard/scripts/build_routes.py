#!/usr/bin/env python3
"""Generate real street shortest paths between Garden City buildings and cache them.

Uses nomad's City street graph (City.get_shortest_path) so the dashboard demo can
draw true street-following routes between stops instead of synthetic L-shaped paths.

Run from the repository root:

    python dashboard/scripts/build_routes.py

The output JSON is consumed by app/api/algorithm-compare/route.ts (RoutesCache) and
keyed by "<from_id>-><to_id>". Building pairs are taken from the cached scene truth
so we only compute routes the demo can actually use.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd
import nomad.data as data_folder
from nomad.city_gen import City

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CITY = Path(data_folder.__file__).parent / "garden-city.gpkg"
DEFAULT_SCENE = REPO_ROOT / "cached_results" / "stop-detection-cache" / "scene.json"
DEFAULT_OUT = REPO_ROOT / "cached_results" / "stop-detection-cache" / "routes.json"


def _round_point(x, y):
    return [round(float(x), 3), round(float(y), 3)]


def _dedupe(points):
    """Drop consecutive duplicate points so the polyline stays clean."""
    out = []
    for point in points:
        if not out or out[-1] != point:
            out.append(point)
    return out


def _to_mercator(city, cells):
    """cells: list of (x, y) block cells. Returns list of [merc_x, merc_y]."""
    frame = pd.DataFrame(cells, columns=["x", "y"])
    merc = city.to_mercator(frame.copy())
    return [_round_point(row.x, row.y) for row in merc.itertuples(index=False)]


def build_routes(city_path, scene_path, out_path):
    city = City.from_geopackage(str(city_path))
    city.compute_shortest_paths(callable_only=True)
    buildings = city.buildings_gdf.set_index("id")

    scene = json.loads(Path(scene_path).read_text(encoding="utf-8"))
    building_ids = sorted(
        {str(stop["location"]) for stop in scene["truth"] if stop.get("location")}
    )
    building_ids = [bid for bid in building_ids if bid in buildings.index]

    # Door metadata + a quick mercator lookup for each building's door point.
    door_frame = pd.DataFrame(
        [
            {
                "id": bid,
                "x": float(buildings.loc[bid, "door_point"][0]),
                "y": float(buildings.loc[bid, "door_point"][1]),
            }
            for bid in building_ids
        ]
    )
    door_merc = city.to_mercator(door_frame.copy())
    door_xy = {
        row.id: _round_point(row.x, row.y)
        for row in door_merc.itertuples(index=False)
    }

    doors = [
        {
            "id": bid,
            "type": str(buildings.loc[bid, "building_type"]),
            "door_cell_x": int(buildings.loc[bid, "door_cell_x"]),
            "door_cell_y": int(buildings.loc[bid, "door_cell_y"]),
            "x": door_xy[bid][0],
            "y": door_xy[bid][1],
        }
        for bid in building_ids
    ]

    routes = []
    for from_id in building_ids:
        for to_id in building_ids:
            if from_id == to_id:
                continue
            start = (
                int(buildings.loc[from_id, "door_cell_x"]),
                int(buildings.loc[from_id, "door_cell_y"]),
            )
            end = (
                int(buildings.loc[to_id, "door_cell_x"]),
                int(buildings.loc[to_id, "door_cell_y"]),
            )
            blocks = [(int(cx), int(cy)) for cx, cy in city.get_shortest_path(start, end)]
            # The first and last blocks are the door cells themselves; represent those
            # ends with the real door points and only convert the intervening street
            # cells, so the polyline runs door -> streets -> door without backtracking.
            # Street cells are centered (+0.5) so the line runs mid-street between
            # buildings rather than along cell corners.
            centers = [(cx + 0.5, cy + 0.5) for cx, cy in blocks[1:-1]]
            middle = _to_mercator(city, centers) if centers else []
            path = _dedupe([door_xy[from_id], *middle, door_xy[to_id]])
            routes.append(
                {
                    "from": from_id,
                    "to": to_id,
                    "blocks": [[cx, cy] for cx, cy in blocks],
                    "path": path,
                }
            )

    payload = {
        "crs": "EPSG:3857",
        "source": "Garden City shortest paths via nomad City.get_shortest_path",
        "doors": doors,
        "routes": routes,
    }
    out_path = Path(out_path)
    out_path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    return building_ids, len(routes)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--city", type=Path, default=DEFAULT_CITY)
    parser.add_argument("--scene", type=Path, default=DEFAULT_SCENE)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    building_ids, route_count = build_routes(args.city, args.scene, args.out)
    print(f"Buildings: {building_ids}")
    print(f"Wrote {route_count} routes to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
