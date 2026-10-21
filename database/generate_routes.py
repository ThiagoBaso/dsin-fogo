"""OSM-backed route utilities. The city graph is cached locally as GraphML."""
from __future__ import annotations

import logging
import math
import argparse
from pathlib import Path

import networkx as nx
import osmnx as ox
from shapely.geometry import LineString

LOG = logging.getLogger(__name__)
GRAPH_PATH = Path(__file__).with_name("marilia.graphml")
_TRANSFORMERS = {}


def _projected_line(graph: nx.MultiDiGraph, coords: list[tuple[float, float]]):
    """Project route coordinates without making a second copy of the full OSM graph."""
    from pyproj import Transformer

    source_crs = str(graph.graph["crs"])
    if source_crs not in _TRANSFORMERS:
        # Marilia is in UTM zone 22 south; this local projection suits this dataset.
        _TRANSFORMERS[source_crs] = (
            Transformer.from_crs(source_crs, "EPSG:32722", always_xy=True),
            Transformer.from_crs("EPSG:32722", source_crs, always_xy=True),
        )
    forward, inverse = _TRANSFORMERS[source_crs]
    return LineString([forward.transform(lon, lat) for lon, lat in coords]), inverse


def load_graph(path: Path = GRAPH_PATH) -> nx.MultiDiGraph:
    """Load cached Marília drive graph or download and cache it once."""
    if path.exists():
        LOG.info("Loading cached road graph: %s", path)
        return ox.load_graphml(path)
    LOG.info("Downloading OSM drive network for Marília, SP")
    try:
        graph = ox.graph_from_place("Marília, São Paulo, Brazil", network_type="drive", simplify=True)
        ox.save_graphml(graph, path)
    except Exception as exc:
        raise RuntimeError(
            "Could not obtain the Marília OpenStreetMap road network. Check internet/Overpass access; "
            "no straight-line or invented routes were generated."
        ) from exc
    return graph


def _edge_coordinates(graph: nx.MultiDiGraph, u: int, v: int, key: int) -> list[tuple[float, float]]:
    edge = graph.edges[u, v, key]
    geom = edge.get("geometry")
    if geom is not None:
        coords = [(float(x), float(y)) for x, y in geom.coords]
        if coords and math.hypot(coords[0][0] - graph.nodes[u]["x"], coords[0][1] - graph.nodes[u]["y"]) > 0.0001:
            coords.reverse()
        return coords
    return [(float(graph.nodes[u]["x"]), float(graph.nodes[u]["y"])),
            (float(graph.nodes[v]["x"]), float(graph.nodes[v]["y"]))]


def route_points(graph: nx.MultiDiGraph, count: int, rng, max_spacing_m: float = 10.0) -> tuple[list[tuple[float, float]], float]:
    """Choose a directed path and sample its full road geometry at no more than max_spacing_m."""
    nodes = list(graph.nodes)
    if len(nodes) < 2:
        raise ValueError("Road graph has fewer than two nodes")
    for _ in range(30):
        start, end = rng.sample(nodes, 2)
        try:
            path = nx.shortest_path(graph, start, end, weight="length")
            if len(path) >= 2:
                break
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            continue
    else:
        raise RuntimeError("Could not find a connected directed road route")

    coords: list[tuple[float, float]] = []
    distance_m = 0.0
    for u, v in zip(path, path[1:]):
        options = graph.get_edge_data(u, v)
        key, edge = min(options.items(), key=lambda item: float(item[1].get("length", 0)))
        segment = _edge_coordinates(graph, u, v, key)
        if coords and segment and coords[-1] == segment[0]:
            segment = segment[1:]
        coords.extend(segment)
        distance_m += float(edge.get("length", 0))
    if len(coords) < 2:
        raise RuntimeError("Road route has no usable geometry")

    # Work in a local metric projection so interpolation spacing follows road distance.
    projected_line, inverse = _projected_line(graph, coords)
    if projected_line.length <= 0:
        raise RuntimeError("Road route geometry has zero length")
    sample_count = min(600, max(count, math.ceil(projected_line.length / max_spacing_m) + 1))
    samples = [projected_line.interpolate(projected_line.length * i / (sample_count - 1)) for i in range(sample_count)]
    # Invert the local projection to WGS84.
    points = [inverse.transform(point.x, point.y) for point in samples]
    return [(float(lon), float(lat)) for lon, lat in points], distance_m


def route_between_points(
    graph: nx.MultiDiGraph,
    origin: tuple[float, float],
    destination: tuple[float, float],
    count: int = 120,
    max_spacing_m: float = 10.0,
) -> tuple[list[tuple[float, float]], float]:
    """Route between (longitude, latitude) endpoints along the road network."""
    def nearest_node(point: tuple[float, float]):
        # A local equirectangular distance avoids OSMnx's optional sklearn dependency.
        cos_lat = math.cos(math.radians(point[1]))
        return min(
            graph.nodes,
            key=lambda node: ((float(graph.nodes[node]["x"]) - point[0]) * cos_lat) ** 2
                             + (float(graph.nodes[node]["y"]) - point[1]) ** 2,
        )

    origin_node = nearest_node(origin)
    destination_node = nearest_node(destination)
    road_graph = graph.to_undirected(as_view=True)
    try:
        path = nx.shortest_path(road_graph, origin_node, destination_node, weight="length")
    except (nx.NetworkXNoPath, nx.NodeNotFound) as exc:
        raise RuntimeError("Could not connect the vehicle base to its latest GPS position") from exc

    origin_xy = (float(graph.nodes[origin_node]["x"]), float(graph.nodes[origin_node]["y"]))
    destination_xy = (float(graph.nodes[destination_node]["x"]), float(graph.nodes[destination_node]["y"]))
    coords: list[tuple[float, float]] = [origin]
    if origin != origin_xy:
        coords.append(origin_xy)

    distance_m = 0.0
    for u, v in zip(path, path[1:]):
        options = graph.get_edge_data(u, v)
        reverse = options is None
        if reverse:
            options = graph.get_edge_data(v, u)
        if not options:
            raise RuntimeError("Road route references an edge without usable geometry")
        key, edge = min(options.items(), key=lambda item: float(item[1].get("length", 0)))
        segment = _edge_coordinates(graph, v, u, key) if reverse else _edge_coordinates(graph, u, v, key)
        if reverse:
            segment.reverse()
        if coords and segment and coords[-1] == segment[0]:
            segment = segment[1:]
        coords.extend(segment)
        distance_m += float(edge.get("length", 0))

    if coords[-1] != destination_xy:
        coords.append(destination_xy)
    if coords[-1] != destination:
        coords.append(destination)
    if len(coords) < 2:
        raise RuntimeError("Road route has no usable geometry")

    def connector_distance(a: tuple[float, float], b: tuple[float, float]) -> float:
        lon1, lat1, lon2, lat2 = map(math.radians, (*a, *b))
        dlat, dlon = lat2 - lat1, lon2 - lon1
        h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
        return 2 * 6_371_000 * math.asin(math.sqrt(h))

    distance_m += connector_distance(origin, origin_xy) + connector_distance(destination_xy, destination)
    projected_line, inverse = _projected_line(graph, coords)
    if projected_line.length <= 0:
        raise RuntimeError("Road route geometry has zero length")

    sample_count = min(600, max(count, math.ceil(projected_line.length / max_spacing_m) + 1))
    samples = [projected_line.interpolate(projected_line.length * i / (sample_count - 1)) for i in range(sample_count)]
    points = [inverse.transform(point.x, point.y) for point in samples]
    return [(float(lon), float(lat)) for lon, lat in points], distance_m
