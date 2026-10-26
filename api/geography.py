"""IBGE 2022 census-sector geometry and spatial occurrence assignment."""
from __future__ import annotations

import json
from collections import Counter, deque
from functools import lru_cache
from pathlib import Path

from shapely.geometry import Point, mapping, shape
from shapely.ops import unary_union
from shapely.strtree import STRtree

SECTOR_GEOJSON_PATH = Path(__file__).resolve().parent / "data" / "setores-censitarios-marilia-2022.geojson"
PREDICTION_AREA_TARGET_SECTORS = 12
PREDICTION_AREA_MIN_SECTORS = 6


@lru_cache(maxsize=1)
def _load_geography() -> tuple[dict, list[dict], list, STRtree, dict[int, list[int]]]:
    geojson = json.loads(SECTOR_GEOJSON_PATH.read_text(encoding="utf-8"))
    features = geojson["features"]
    geometries = [shape(feature["geometry"]) for feature in features]
    area_ids = [int(feature["properties"]["id"]) for feature in features]
    tree = STRtree(geometries)
    neighbors: dict[int, set[int]] = {area_id: set() for area_id in area_ids}

    for index, geometry in enumerate(geometries):
        for candidate in tree.query(geometry):
            other_index = int(candidate)
            if other_index <= index:
                continue
            shared_border = geometry.boundary.intersection(geometries[other_index].boundary)
            if shared_border.length > 0:
                first_id = area_ids[index]
                second_id = area_ids[other_index]
                neighbors[first_id].add(second_id)
                neighbors[second_id].add(first_id)

    return (
        geojson,
        features,
        geometries,
        tree,
        {area_id: sorted(adjacent) for area_id, adjacent in neighbors.items()},
    )


def census_sector_geojson() -> dict:
    return _load_geography()[0]


def census_sector_areas() -> list[dict]:
    return [
        {
            "id": int(feature["properties"]["id"]),
            "nome": str(feature["properties"]["nome"]),
        }
        for feature in _load_geography()[1]
    ]


def census_sector_neighbors() -> dict[int, list[int]]:
    return _load_geography()[4]


def _connected_components(neighbors: dict[int, list[int]]) -> list[set[int]]:
    unseen = set(neighbors)
    components = []
    while unseen:
        start = min(unseen)
        unseen.remove(start)
        component = {start}
        pending = deque([start])
        while pending:
            current = pending.popleft()
            for neighbor in neighbors[current]:
                if neighbor in unseen:
                    unseen.remove(neighbor)
                    component.add(neighbor)
                    pending.append(neighbor)
        components.append(component)
    return components


def _partition_component(component: set[int], neighbors: dict[int, list[int]]) -> list[set[int]]:
    unassigned = set(component)
    groups = []
    while unassigned:
        start = min(unassigned)
        pending = deque([start])
        queued = {start}
        group = set()
        while pending and len(group) < PREDICTION_AREA_TARGET_SECTORS:
            current = pending.popleft()
            if current not in unassigned:
                continue
            unassigned.remove(current)
            group.add(current)
            for neighbor in neighbors[current]:
                if neighbor in unassigned and neighbor not in queued:
                    pending.append(neighbor)
                    queued.add(neighbor)
        groups.append(group)

    while True:
        small_group = next((group for group in sorted(groups, key=lambda item: (len(item), min(item)))
                            if len(group) < PREDICTION_AREA_MIN_SECTORS), None)
        if small_group is None:
            break
        adjacent_groups = []
        for candidate in groups:
            if candidate is small_group:
                continue
            shared_edges = sum(
                1
                for sector_id in small_group
                for neighbor in neighbors[sector_id]
                if neighbor in candidate
            )
            if shared_edges:
                adjacent_groups.append((shared_edges, -len(candidate), min(candidate), candidate))
        if not adjacent_groups:
            break
        target = max(adjacent_groups, key=lambda item: (item[0], item[1], -item[2]))[3]
        target.update(small_group)
        groups.remove(small_group)

    return groups


@lru_cache(maxsize=1)
def _load_prediction_geography() -> tuple[dict, list[dict], dict[int, int], dict[int, list[int]]]:
    _geojson, features, geometries, _tree, sector_neighbors = _load_geography()
    sector_feature_by_id = {
        int(feature["properties"]["id"]): feature
        for feature in features
    }
    geometry_by_sector = {
        int(feature["properties"]["id"]): geometry
        for feature, geometry in zip(features, geometries)
    }
    clusters = [
        group
        for component in _connected_components(sector_neighbors)
        for group in _partition_component(component, sector_neighbors)
    ]
    clusters.sort(key=min)

    group_by_sector: dict[int, int] = {}
    areas = []
    grouped_features = []
    for index, sector_ids in enumerate(clusters, start=1):
        group_id = index
        group_by_sector.update({sector_id: group_id for sector_id in sector_ids})
        district_counts = Counter(
            str(sector_feature_by_id[sector_id]["properties"]["distrito"])
            for sector_id in sector_ids
        )
        district_names = [name for name, _count in district_counts.most_common()]
        district_label = " / ".join(district_names[:2])
        name = f"Área {index:02d} · {district_label}" if district_label else f"Área {index:02d}"
        area = {
            "id": group_id,
            "nome": name,
            "quantidade_setores": len(sector_ids),
            "distritos": district_names,
        }
        areas.append(area)
        merged_geometry = unary_union([geometry_by_sector[sector_id] for sector_id in sorted(sector_ids)])
        grouped_features.append({
            "type": "Feature",
            "properties": {
                "id": group_id,
                "nome": name,
                "quantidade_setores": len(sector_ids),
                "distritos": district_names,
            },
            "geometry": mapping(merged_geometry),
        })

    area_neighbors: dict[int, set[int]] = {area["id"]: set() for area in areas}
    for sector_id, adjacent_ids in sector_neighbors.items():
        group_id = group_by_sector[sector_id]
        for adjacent_id in adjacent_ids:
            adjacent_group_id = group_by_sector[adjacent_id]
            if adjacent_group_id != group_id:
                area_neighbors[group_id].add(adjacent_group_id)

    return (
        {"type": "FeatureCollection", "features": grouped_features},
        areas,
        group_by_sector,
        {group_id: sorted(adjacent) for group_id, adjacent in area_neighbors.items()},
    )


def prediction_area_geojson() -> dict:
    return _load_prediction_geography()[0]


def prediction_areas() -> list[dict]:
    return _load_prediction_geography()[1]


def prediction_area_neighbors() -> dict[int, list[int]]:
    return _load_prediction_geography()[3]


def census_sector_id_at(longitude: float, latitude: float) -> int | None:
    _geojson, features, geometries, tree, _neighbors = _load_geography()
    point = Point(float(longitude), float(latitude))
    candidate_indices = sorted(int(index) for index in tree.query(point))
    for index in candidate_indices:
        if geometries[index].covers(point):
            return int(features[index]["properties"]["id"])

    # Road-snapped demo points can land a few meters across a census boundary.
    nearest_indices = tree.query_nearest(point, max_distance=0.00025)
    if len(nearest_indices):
        return int(features[min(int(index) for index in nearest_indices)]["properties"]["id"])
    return None


def assign_occurrences_to_prediction_areas(occurrences: list[dict]) -> tuple[list[dict], int]:
    group_by_sector = _load_prediction_geography()[2]
    mapped = []
    unmatched_count = 0
    for occurrence in occurrences:
        longitude = occurrence.get("longitude")
        latitude = occurrence.get("latitude")
        if longitude is None or latitude is None:
            unmatched_count += 1
            continue
        sector_id = census_sector_id_at(longitude, latitude)
        if sector_id is None or sector_id not in group_by_sector:
            unmatched_count += 1
            continue
        mapped.append({**occurrence, "sector_id": sector_id, "area_id": group_by_sector[sector_id]})
    return mapped, unmatched_count
