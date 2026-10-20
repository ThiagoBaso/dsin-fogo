"""OSM-backed route utilities. The city graph is cached locally as GraphML."""
from __future__ import annotations

import logging
import math
from pathlib import Path

import networkx as nx
import osmnx as ox
from shapely.geometry import LineString

LOG = logging.getLogger(__name__)
GRAPH_PATH = Path(__file__).with_name("marilia.graphml")
_PROJECTED_GRAPH = None
_PROJECTED_CRS = None


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
    line = LineString(coords)
    global _PROJECTED_GRAPH, _PROJECTED_CRS
    if _PROJECTED_GRAPH is None or _PROJECTED_CRS != graph.graph.get("crs"):
        _PROJECTED_GRAPH = ox.project_graph(graph)
        _PROJECTED_CRS = graph.graph.get("crs")
    projected_graph = _PROJECTED_GRAPH
    projected_line, _ = ox.projection.project_geometry(line, crs=graph.graph["crs"], to_crs=projected_graph.graph["crs"])
    if projected_line.length <= 0:
        raise RuntimeError("Road route geometry has zero length")
    sample_count = max(count, math.ceil(projected_line.length / max_spacing_m) + 1)
    samples = [projected_line.interpolate(projected_line.length * i / (sample_count - 1)) for i in range(sample_count)]
    # Invert the local projection to WGS84.
    from pyproj import Transformer
    inverse = Transformer.from_crs(projected_graph.graph["crs"], graph.graph["crs"], always_xy=True)
    points = [inverse.transform(point.x, point.y) for point in samples]
    return [(float(lon), float(lat)) for lon, lat in points], distance_m
