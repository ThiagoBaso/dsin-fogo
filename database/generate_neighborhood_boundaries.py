"""Build fictional demo sectors whose internal borders follow OSM streets.

The project has no official neighborhood polygons. This generator groups
street-bounded blocks into the synthetic neighborhoods from seed.sql. The
outside edge remains an approximate convex hull and must not be treated as an
official boundary either.
"""
from __future__ import annotations

import json
import heapq
import math
import random
import re
from pathlib import Path

import networkx as nx
from shapely import transform as transform_geometry, wkt
from shapely.geometry import LineString, MultiPoint, Point, mapping
from shapely.ops import polygonize, unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / "database" / "seed.sql"
GRAPH = ROOT / "database" / "marilia.graphml"
OUTPUT = ROOT / "front" / "src" / "data" / "bairros-demo.json"

CENTER_LAT = -22.217
CENTER_LON = -49.950
MAX_DELTA_DEGREES = 0.07
COS_LAT = math.cos(math.radians(CENTER_LAT))


def section(sql: str, table: str) -> str:
    start = sql.index(f"INSERT INTO `{table}`")
    end = sql.find("INSERT INTO `", start + len(f"INSERT INTO `{table}`"))
    return sql[start:] if end < 0 else sql[start:end]


def read_neighborhoods(sql: str) -> list[tuple[int, str]]:
    rows = re.findall(r"\((\d+),\s*\d+,\s*'((?:[^']|'')*)'\)", section(sql, "bairros"))
    return [(int(identifier), name.replace("''", "'")) for identifier, name in rows]


def read_locations(sql: str) -> list[tuple[float, float]]:
    rows = re.findall(
        r"\(\d+,\s*\d+,\s*NULL,\s*'[^']*',\s*'[^']*',\s*NULL,\s*'[^']*',\s*(-?[\d.]+),\s*(-?[\d.]+)\)",
        section(sql, "localizacoes"),
    )
    return [
        ((float(lon) - CENTER_LON) * COS_LAT, float(lat) - CENTER_LAT)
        for lat, lon in rows
        if abs(float(lat) - CENTER_LAT) <= MAX_DELTA_DEGREES
        and abs(float(lon) - CENTER_LON) <= MAX_DELTA_DEGREES
    ]


def create_sites(hull, amount: int) -> list[tuple[float, float]]:
    min_x, min_y, max_x, max_y = hull.bounds
    columns = math.ceil(math.sqrt(amount * (max_x - min_x) / (max_y - min_y)))
    rows = math.ceil(amount / columns)
    dx, dy = (max_x - min_x) / columns, (max_y - min_y) / rows
    rng = random.Random(20261022)
    sites = []

    for row in range(rows):
        for column in range(columns):
            if len(sites) == amount:
                break
            candidate = (
                min_x + (column + 0.5 + rng.uniform(-0.24, 0.24)) * dx,
                min_y + (row + 0.5 + rng.uniform(-0.24, 0.24)) * dy,
            )
            if not hull.contains(Point(*candidate)):
                for _ in range(2000):
                    candidate = (rng.uniform(min_x, max_x), rng.uniform(min_y, max_y))
                    if hull.contains(Point(*candidate)):
                        break
                else:
                    raise RuntimeError("Could not place a demo sector inside the generated map area")
            sites.append(candidate)
    return sites


def local_xy(lon: float, lat: float) -> tuple[float, float]:
    return (lon - CENTER_LON) * COS_LAT, lat - CENTER_LAT


def local_to_geo(coordinates):
    coordinates = coordinates.copy()
    coordinates[:, 0] = CENTER_LON + coordinates[:, 0] / COS_LAT
    coordinates[:, 1] = CENTER_LAT + coordinates[:, 1]
    return coordinates


def line_parts(geometry):
    if geometry.geom_type == "LineString":
        yield geometry
    elif hasattr(geometry, "geoms"):
        for part in geometry.geoms:
            yield from line_parts(part)


def road_lines(graph, area):
    lines = []
    seen = set()
    for start, end, _key, attributes in graph.edges(keys=True, data=True):
        first, last = graph.nodes[start], graph.nodes[end]
        geom = attributes.get("geometry")
        try:
            original = wkt.loads(geom) if isinstance(geom, str) else None
        except Exception:
            original = None
        if original is None:
            original = LineString([
                (float(first["x"]), float(first["y"])),
                (float(last["x"]), float(last["y"])),
            ])

        coordinates = [local_xy(lon, lat) for lon, lat in original.coords]
        local_line = LineString(coordinates).intersection(area)
        for part in line_parts(local_line):
            if part.length < 1e-7:
                continue
            key = part.normalize().wkb
            if key not in seen:
                seen.add(key)
                lines.append(part)
    return lines


def load_graph():
    if GRAPH.exists():
        return nx.read_graphml(GRAPH)

    # Reuse the project's existing OSMnx downloader and cache behavior.
    from generate_routes import load_graph as load_osm_graph

    return load_osm_graph(GRAPH)


def group_blocks_contiguously(blocks, sites):
    """Grow 40 connected street-block regions from deterministic seed points."""
    centers = [block.representative_point() for block in blocks]
    seeds = []
    unused = set(range(len(blocks)))
    for x, y in sites:
        seed = min(unused, key=lambda index: (centers[index].x - x) ** 2 + (centers[index].y - y) ** 2)
        seeds.append(seed)
        unused.remove(seed)

    adjacency = [[] for _ in blocks]
    tree = STRtree(blocks)
    for index, block in enumerate(blocks):
        for candidate in tree.query(block):
            neighbor = int(candidate)
            if neighbor <= index:
                continue
            shared_street_length = block.boundary.intersection(blocks[neighbor].boundary).length
            if shared_street_length > 1e-9:
                distance = centers[index].distance(centers[neighbor])
                adjacency[index].append((neighbor, distance))
                adjacency[neighbor].append((index, distance))

    labels = [None] * len(blocks)
    best_distance = [math.inf] * len(blocks)
    frontier = []
    for sector, seed in enumerate(seeds):
        best_distance[seed] = 0
        heapq.heappush(frontier, (0, sector, seed))

    while frontier:
        distance, sector, block_index = heapq.heappop(frontier)
        if labels[block_index] is not None:
            continue
        labels[block_index] = sector
        for neighbor, edge_distance in adjacency[block_index]:
            candidate_distance = distance + edge_distance
            if labels[neighbor] is None and candidate_distance < best_distance[neighbor]:
                best_distance[neighbor] = candidate_distance
                heapq.heappush(frontier, (candidate_distance, sector, neighbor))

    if any(label is None for label in labels):
        raise RuntimeError("The street blocks are disconnected; could not form contiguous demo sectors")

    grouped = [[] for _ in sites]
    for block, sector in zip(blocks, labels):
        grouped[sector].append(block)
    return grouped


def generate() -> None:
    sql = SEED.read_text(encoding="utf-8")
    neighborhoods = read_neighborhoods(sql)
    locations = read_locations(sql)
    if not neighborhoods or len(locations) < 3:
        raise RuntimeError("The seed needs demo neighborhood names and central locations")

    hull = MultiPoint(locations).convex_hull
    sites = create_sites(hull, len(neighborhoods))
    graph = load_graph()
    roads = road_lines(graph, hull)
    if not roads:
        raise RuntimeError("No OSM streets intersect the central demo area")

    # Closing the outer edge lets polygonize create bounded street blocks.
    linework = unary_union(roads + [hull.boundary])
    blocks = [
        polygon for polygon in polygonize(linework)
        if hull.covers(polygon.representative_point()) and polygon.area > 1e-9
    ]
    if not blocks:
        raise RuntimeError("Street network did not produce any bounded blocks")

    assigned = group_blocks_contiguously(blocks, sites)

    features = []
    for (identifier, name), sector_blocks in zip(neighborhoods, assigned):
        if not sector_blocks:
            raise RuntimeError(f"No street blocks were assigned to demo sector {identifier}")
        dissolved = unary_union(sector_blocks)
        geographic = transform_geometry(dissolved, local_to_geo)
        features.append({
            "type": "Feature",
            "properties": {
                "id": identifier,
                "nome": name,
                "limite": "ficticio",
                "aviso": "Divisórias internas seguem ruas do OpenStreetMap; setores e limite externo são aproximados e não oficiais.",
            },
            "geometry": mapping(geographic),
        })

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps({
            "type": "FeatureCollection",
            "name": "setores_demo_ficticios",
            "description": "Limites fictícios de demonstração. Quarteirões delimitados por ruas OSM foram agrupados em setores; o limite externo é um fecho aproximado.",
            "features": features,
        }, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(f"Generated {len(features)} street-following demo sectors from {len(blocks)} blocks")


if __name__ == "__main__":
    generate()
