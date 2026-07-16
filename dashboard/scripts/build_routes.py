#!/usr/bin/env python3
"""Generate centerline street routes between Garden City buildings and cache them.

Uses nomad's City street graph (City.get_shortest_path) for the street-cell
sequence, then draws straight segments through each street cell center.

Run from the repository root:

    python dashboard/scripts/build_routes.py

The output JSON is consumed by app/api/algorithm-compare/route.ts (RoutesCache) and
keyed by "<from_id>-><to_id>". By default this rebuilds the two-stop route cache;
pass --scene and --out for the four-stop cache roots.
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
DEFAULT_SCENES = [
    REPO_ROOT / "cached_results" / "stop-detection-cache" / "scene.json",
]
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


def _street_center_lookup(city):
    centers = city.streets_gdf.loc[:, ["id", "geometry"]].copy()
    centers["point"] = centers.geometry.centroid
    frame = pd.DataFrame({
        "id": centers["id"],
        "x": centers["point"].map(lambda point: point.x),
        "y": centers["point"].map(lambda point: point.y),
    })
    merc = city.to_mercator(frame.copy())
    return {
        row.id: _round_point(row.x, row.y)
        for row in merc.itertuples(index=False)
    }


def _street_centers(cells, centers):
    return [centers[f"s-x{cx}-y{cy}"] for cx, cy in cells]


def _street_records(city):
    """city: City. Returns street polygon records in Web Mercator."""
    street_coords = city.streets_gdf.loc[:, ["id", "geometry"]].copy()
    street_coords["coords"] = street_coords.geometry.apply(lambda geom: list(geom.exterior.coords))
    exploded = street_coords.loc[:, ["id", "coords"]].explode("coords")
    merc = city.to_mercator(pd.DataFrame(exploded["coords"].tolist(), columns=["x", "y"]))
    exploded = exploded.assign(coord=[_round_point(row.x, row.y) for row in merc.itertuples(index=False)])
    return (
        exploded.groupby("id", sort=False)["coord"]
        .apply(list)
        .rename("coords")
        .reset_index()
        .to_dict("records")
    )


def _scene_payload(scene_paths):
    location_ids = set()
    buildings = None
    for scene_path in scene_paths:
        scene = json.loads(Path(scene_path).read_text(encoding="utf-8"))
        location_ids.update(
            row["location"]
            for row in scene["truth"]
            if row.get("location")
        )
        if buildings is None:
            buildings = scene["buildings"]

    points = [
        point
        for building in buildings
        for ring in building["rings"]
        for point in ring
    ]
    bounds = [
        min(point[0] for point in points),
        min(point[1] for point in points),
        max(point[0] for point in points),
        max(point[1] for point in points),
    ]
    return sorted(location_ids), buildings, bounds


def build_routes(city_path, scene_paths, out_path):
    city = City.from_geopackage(str(city_path))
    city.compute_shortest_paths()
    buildings = city.buildings_gdf.set_index("id")
    street_centers = _street_center_lookup(city)

    building_ids, scene_buildings, bounds = _scene_payload(scene_paths)
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
            centerline = _street_centers(blocks, street_centers)
            path = _dedupe([door_xy[from_id], *centerline, door_xy[to_id]])
            routes.append(
                {
                    "id": f"{from_id}->{to_id}",
                    "from": from_id,
                    "to": to_id,
                    "from_type": str(buildings.loc[from_id, "building_type"]),
                    "to_type": str(buildings.loc[to_id, "building_type"]),
                    "blocks": [[cx, cy] for cx, cy in blocks],
                    "path": path,
                }
            )

    payload = {
        "crs": "EPSG:3857",
        "source": "Garden City street-center routes via nomad City.get_shortest_path",
        "bounds": bounds,
        "streets": _street_records(city),
        "buildings": scene_buildings,
        "doors": doors,
        "routes": routes,
    }
    out_path = Path(out_path)
    out_path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    return building_ids, len(routes)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--city", type=Path, default=DEFAULT_CITY)
    parser.add_argument("--scene", dest="scenes", action="append", type=Path, default=None)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    building_ids, route_count = build_routes(args.city, args.scenes or DEFAULT_SCENES, args.out)
    print(f"Buildings: {building_ids}")
    print(f"Wrote {route_count} routes to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
