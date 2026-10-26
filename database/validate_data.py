"""Validate the populated F.O.G.O. demo database using MYSQL_* environment settings."""
from __future__ import annotations

import argparse
import os
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from statistics import median

import mysql.connector


def _parse_value_list(text: str):
    """Read the VALUES tuples emitted by generate_data.py without executing SQL."""
    rows, i, n = [], 0, len(text)
    while i < n:
        while i < n and text[i] in " \r\n\t,": i += 1
        if i >= n or text[i] == ";": break
        if text[i] != "(": raise ValueError(f"Expected '(' in generated INSERT at offset {i}")
        i += 1; row = []
        while True:
            while i < n and text[i] in " \r\n\t": i += 1
            if i >= n: raise ValueError("Unexpected end of generated INSERT")
            if text[i] == "'":
                i += 1; value = []
                while i < n:
                    char = text[i]; i += 1
                    if char == "'": break
                    if char == "\\" and i < n:
                        escaped = text[i]; i += 1
                        value.append({"0": "\0", "n": "\n", "r": "\r", "t": "\t"}.get(escaped, escaped))
                    else: value.append(char)
                row.append("".join(value))
            else:
                start = i
                while i < n and text[i] not in ",)": i += 1
                raw = text[start:i].strip()
                if raw == "NULL": value = None
                elif re.fullmatch(r"-?\d+", raw): value = int(raw)
                elif re.fullmatch(r"-?(?:\d+\.\d*|\d*\.\d+)(?:[eE][+-]?\d+)?", raw): value = float(raw)
                else: raise ValueError(f"Unexpected SQL value {raw!r}")
                row.append(value)
            while i < n and text[i] in " \r\n\t": i += 1
            if i < n and text[i] == ",": i += 1; continue
            if i < n and text[i] == ")": i += 1; break
            raise ValueError(f"Expected ',' or ')' in generated INSERT at offset {i}: {text[max(0,i-12):i+12]!r}")
        rows.append(row)
    return rows


def _statements(sql: str):
    """Split SQL at semicolons outside quoted string literals."""
    start, i, quoted, escaped = 0, 0, False, False
    while i < len(sql):
        char = sql[i]
        if quoted:
            if escaped: escaped = False
            elif char == "\\": escaped = True
            elif char == "'": quoted = False
        elif char == "'": quoted = True
        elif char == ";":
            yield sql[start:i + 1]
            start = i + 1
        i += 1
    if sql[start:].strip(): yield sql[start:]


def validate_seed(seed_path: Path, graph_path: Path) -> int:
    """Validate generated records and route geometries offline, without a DB connection."""
    import networkx as nx
    import osmnx as ox
    from pyproj import Transformer
    from shapely.geometry import LineString, Point

    sql = seed_path.read_text(encoding="utf-8")
    tables = {}
    pattern = re.compile(r"INSERT INTO `([^`]+)` \(([^)]*)\) VALUES\s*(.*);", re.S)
    for statement in _statements(sql):
        match = pattern.fullmatch(statement.strip())
        if not match: continue
        table = match.group(1)
        columns = re.findall(r"`([^`]+)`", match.group(2))
        rows = _parse_value_list(match.group(3))
        tables.setdefault(table, []).extend(dict(zip(columns, row)) for row in rows)
        if any(len(row) != len(columns) for row in rows):
            raise ValueError(f"Column count mismatch in {table}")

    checks = []
    def check(label, ok, detail):
        checks.append((label, bool(ok), detail))

    required = {"equipamentos": 532, "agentes": 100, "localizacoes": 300, "viagens": 240,
                "posicoes_equipamento": 28800, "manutencoes": 800, "alertas": 250}
    for table, minimum in required.items():
        check(f"{table} >= {minimum}", len(tables.get(table, [])) >= minimum, str(len(tables.get(table, []))))
    occurrences = tables.get("ocorrencias", [])
    check("exatamente 10000 ocorrencias", len(occurrences) == 10000, str(len(occurrences)))
    occurrence_migration_path = seed_path.with_name("migrate_occurrences.sql")
    migration_occurrences = []
    if occurrence_migration_path.exists():
        migration_sql = occurrence_migration_path.read_text(encoding="utf-8").replace(
            "INSERT IGNORE INTO `ocorrencias`", "INSERT INTO `ocorrencias`"
        )
        for statement in _statements(migration_sql):
            match = pattern.fullmatch(statement.strip())
            if not match or match.group(1) != "ocorrencias":
                continue
            columns = re.findall(r"`([^`]+)`", match.group(2))
            rows = _parse_value_list(match.group(3))
            migration_occurrences.extend(dict(zip(columns, row)) for row in rows)
    expected_migration_occurrences = [row for row in occurrences if row["id_ocorrencia"] > 1000]
    expected_migration_occurrences = [
        {column: row[column] for column in migration_occurrences[0]} if migration_occurrences else row
        for row in expected_migration_occurrences
    ]
    check("migracao inclui ocorrencias historicas ausentes",
          migration_occurrences == expected_migration_occurrences and len(migration_occurrences) == 9000,
          f"{len(migration_occurrences)} registros na migracao; {len(expected_migration_occurrences)} esperados")
    resolution_migration_path = seed_path.with_name("migrate_occurrence_resolution.sql")
    migration_resolution_rows = []
    if resolution_migration_path.exists():
        resolution_sql = resolution_migration_path.read_text(encoding="utf-8")
        resolution_match = re.search(
            r"INSERT INTO migration_occurrence_resolution\s*\(([^)]*)\) VALUES\s*(.*?);",
            resolution_sql,
            re.S,
        )
        if resolution_match:
            columns = re.findall(r"`([^`]+)`", resolution_match.group(1))
            migration_resolution_rows = [
                dict(zip(columns, row)) for row in _parse_value_list(resolution_match.group(2))
            ]
    seed_occurrences_by_id = {row["id_ocorrencia"]: row for row in occurrences}
    resolution_migration_matches = (
        len(migration_resolution_rows) == len(occurrences)
        and {row["id_ocorrencia"] for row in migration_resolution_rows} == set(seed_occurrences_by_id)
        and all(
            row["id_ocorrencia"] in seed_occurrences_by_id
            and all(
                row[column] == seed_occurrences_by_id[row["id_ocorrencia"]][column]
                for column in ("id_localizacao", "id_orgao", "id_equipamento", "gravidade")
            )
            and 0 < row["duracao_segundos"] <= 14 * 24 * 60 * 60
            for row in migration_resolution_rows
        )
    )
    check("migracao de resolucao corresponde ao seed",
          resolution_migration_path.exists()
          and resolution_migration_matches,
          f"{len(migration_resolution_rows)} registros na migracao; {len(occurrences)} no seed")
    eq = {r["id_equipamento"]: r for r in tables["equipamentos"]}
    types = {r["id_tipo"]: r for r in tables["tipos_equipamento"]}
    situation_counts = defaultdict(int)
    for row in eq.values():
        if row["numero_serie"].startswith("DEMO-") and row["id_situacao"] in (6, 7):
            situation_counts[row["id_situacao"]] += 1
    check("8 equipamentos ainda nao instalados", situation_counts[6] == 8, str(situation_counts[6]))
    check("8 equipamentos com mau funcionamento", situation_counts[7] == 8, str(situation_counts[7]))
    check("equipamentos ainda nao instalados sem data de instalacao",
          all(row["instalado_em"] is None for row in eq.values() if row["id_situacao"] == 6),
          str(sum(row["id_situacao"] == 6 and row["instalado_em"] is not None for row in eq.values())))
    check("equipamentos com mau funcionamento instalados",
          all(row["instalado_em"] is not None for row in eq.values() if row["id_situacao"] == 7),
          str(sum(row["id_situacao"] == 7 and row["instalado_em"] is None for row in eq.values())))
    mobile = {eid for eid, row in eq.items() if types[row["id_tipo"]]["mobilidade"] == "movel"}
    trips = {r["id_viagem"]: r for r in tables["viagens"]}
    agents = {r["id_agente"]: r for r in tables.get("agentes", [])}
    shifts = tables.get("turnos_agente", [])
    allowed_vehicle_capacity = {2: 1, 8: 1, 9: 2, 10: 2, 11: 2}
    open_shifts = [row for row in shifts if row["status"] != "encerrado"]
    linked_agents_per_vehicle = defaultdict(int)
    shifts_valid = True
    for shift in open_shifts:
        vehicle_id = shift.get("id_equipamento")
        vehicle = eq.get(vehicle_id)
        if (shift["id_agente"] not in agents or vehicle is None
                or vehicle["id_tipo"] not in allowed_vehicle_capacity
                or vehicle["id_situacao"] != 1
                or shift["status"] not in ("em_atividade", "programado")):
            shifts_valid = False
            continue
        linked_agents_per_vehicle[vehicle_id] += 1
    capacity_valid = all(
        count <= allowed_vehicle_capacity[eq[vehicle_id]["id_tipo"]]
        for vehicle_id, count in linked_agents_per_vehicle.items()
    )
    check("60 non-ended shifts linked to operational vehicles",
          len(open_shifts) == 60 and shifts_valid,
          f"{len(open_shifts)} shifts; {sum(row['status'] == 'em_atividade' for row in open_shifts)} active; {sum(row['status'] == 'programado' for row in open_shifts)} scheduled")
    check("one generated shift per agent",
          len(shifts) == len(agents) and len({row["id_agente"] for row in shifts}) == len(shifts),
          f"{len(shifts)} shifts; {len({row['id_agente'] for row in shifts})} distinct agents")
    check("agent capacity per vehicle respected",
          capacity_valid and any(count == 2 for count in linked_agents_per_vehicle.values()),
          f"{len(linked_agents_per_vehicle)} occupied vehicles; max {max(linked_agents_per_vehicle.values(), default=0)} agents per vehicle")
    check("non-ended shifts use active agents",
          all(agents[row["id_agente"]]["ativo_cadastro"] == 1 for row in open_shifts if row["id_agente"] in agents),
          str(sum(agents[row["id_agente"]]["ativo_cadastro"] != 1 for row in open_shifts if row["id_agente"] in agents)))
    positions_by_trip = defaultdict(list)
    for row in tables["posicoes_equipamento"]:
        if row["id_viagem"] is not None: positions_by_trip[row["id_viagem"]].append(row)
    check("92 equipamentos moveis", len(mobile) == 92, str(len(mobile)))
    service_counts = {type_id: sum(1 for row in eq.values() if row["id_tipo"] == type_id) for type_id in (12, 13, 14, 15)}
    check("8 equipamentos por novo tipo", all(count == 8 for count in service_counts.values()), str(service_counts))
    service_ids = {eid for eid, row in eq.items() if row["id_tipo"] in (12, 13, 14, 15)}
    attrs_per_equipment = defaultdict(int)
    for value in tables.get("valores_atributo", []):
        if value["id_equipamento"] in service_ids:
            attrs_per_equipment[value["id_equipamento"]] += 1
    check("atributos especificos em todos os novos tipos", all(attrs_per_equipment[eid] >= 2 for eid in service_ids),
          f"{sum(attrs_per_equipment[eid] >= 2 for eid in service_ids)}/{len(service_ids)} equipamentos completos")
    attribute_definitions = {row["id_atributo"]: row for row in tables.get("atributos_tipo", [])}
    values_by_equipment = defaultdict(set)
    values_by_type_and_name = defaultdict(set)
    value_shape_ok = True
    for value in tables.get("valores_atributo", []):
        definition = attribute_definitions.get(value["id_atributo"])
        if definition is None:
            value_shape_ok = False
            continue
        values_by_equipment[value["id_equipamento"]].add(value["id_atributo"])
        text_value, number_value, boolean_value = value["valor_texto"], value["valor_numero"], value["valor_booleano"]
        value_shape_ok &= sum(item is not None for item in (text_value, number_value, boolean_value)) == 1
        if text_value is not None:
            value_shape_ok &= definition["tipo_valor"] == "texto"
            values_by_type_and_name[(definition["id_tipo"], definition["nome"])].add(text_value)
        elif number_value is not None:
            value_shape_ok &= definition["tipo_valor"] == "numero"
        elif boolean_value is not None:
            value_shape_ok &= definition["tipo_valor"] == "booleano"
    required_attributes = defaultdict(set)
    for definition in attribute_definitions.values():
        if definition["obrigatorio"]:
            required_attributes[definition["id_tipo"]].add(definition["id_atributo"])
    incomplete_required = [equipment_id for equipment_id, equipment in eq.items()
                           if not required_attributes[equipment["id_tipo"]].issubset(values_by_equipment[equipment_id])]
    check("atributos obrigatorios completos e valores no tipo correto", value_shape_ok and not incomplete_required,
          f"{len(incomplete_required)} equipamentos incompletos; {len(tables.get('valores_atributo', []))} valores conferidos")
    coverage_attribute_ids = {row["id_atributo"] for row in attribute_definitions.values()
                              if row["nome"] == "raio_cobertura_km"}
    coverage_values = {value["id_equipamento"]: value["valor_numero"]
                       for value in tables.get("valores_atributo", [])
                       if value["id_atributo"] in coverage_attribute_ids}
    coverage_ok = all(equipment_id in coverage_values and coverage_values[equipment_id] is not None
                      and coverage_values[equipment_id] > 0 for equipment_id in eq)
    check("raio estimado positivo em todos os equipamentos", coverage_ok,
          f"{len(coverage_values)}/{len(eq)} equipamentos com raio informado")
    mobile_vehicle_ids = {
        equipment_id for equipment_id, equipment in eq.items()
        if 7 <= equipment["id_tipo"] <= 15
    }
    mobile_coverage_ok = all(
        equipment_id in coverage_values and 0.10 <= coverage_values[equipment_id] <= 0.30
        for equipment_id in mobile_vehicle_ids
    )
    check("cobertura de veículos móveis entre 100 e 300 m", mobile_coverage_ok,
          f"{sum(equipment_id in coverage_values for equipment_id in mobile_vehicle_ids)}/{len(mobile_vehicle_ids)} veículos com raio válido")
    vehicle_agent_ids = {
        shift["id_agente"] for shift in tables.get("turnos_agente", [])
        if shift.get("id_equipamento") is not None
        and shift.get("status") in ("em_atividade", "programado")
    }
    agent_radius_ok = all(
        agent.get("raio_atuacao_km") is not None
        and (0.10 <= agent["raio_atuacao_km"] <= 0.30
             if agent["id_agente"] in vehicle_agent_ids
             else 0.02 <= agent["raio_atuacao_km"] <= 0.06)
        for agent in tables.get("agentes", [])
    )
    check("área estimada válida para todos os agentes", agent_radius_ok,
          f"{sum(agent.get('raio_atuacao_km') is not None for agent in tables.get('agentes', []))}/{len(tables.get('agentes', []))} agentes com raio informado; {len(vehicle_agent_ids)} em veículos (100–300 m), demais em base (20–60 m)")
    radar_modalities = {"velocidade", "avanço de sinal", "faixa exclusiva", "conversão proibida", "retorno proibido"}
    modality_coverage_ok = all(radar_modalities.issubset(values_by_type_and_name[(type_id, "modalidade")])
                              for type_id in (1, 2))
    check("cinco modalidades de fiscalização em radares fixos e móveis", modality_coverage_ok,
          f"fixo={len(values_by_type_and_name[(1, 'modalidade')])}; móvel={len(values_by_type_and_name[(2, 'modalidade')])}")
    image_types = values_by_type_and_name[(3, "tipo_imagem")]
    check("câmeras coloridas e preto e branco representadas", {"colorida", "preto e branco"}.issubset(image_types),
          ", ".join(sorted(image_types)))
    occurrences_per_equipment = defaultdict(int)
    for occurrence in tables.get("ocorrencias", []):
        if occurrence["id_equipamento"] in service_ids:
            occurrences_per_equipment[occurrence["id_equipamento"]] += 1
    check("ao menos 3 ocorrencias por equipamento desses tipos",
          all(occurrences_per_equipment[eid] >= 3 for eid in service_ids),
          f"{sum(occurrences_per_equipment[eid] >= 3 for eid in service_ids)}/{len(service_ids)} equipamentos completos")
    occurrence_dates = [datetime.fromisoformat(row["ocorrida_em"]) for row in occurrences]
    check("periodo de ocorrencias desde 2024",
          bool(occurrence_dates) and min(occurrence_dates) == datetime(2024, 1, 1)
          and max(occurrence_dates) <= datetime.now(),
          f"{min(occurrence_dates) if occurrence_dates else 'sem datas'} a {max(occurrence_dates) if occurrence_dates else 'sem datas'}")
    current_occurrences = [row for row in occurrences if row["status"] in ("aberta", "em_atendimento")]
    check("500 ocorrencias abertas ou em atendimento",
          len(current_occurrences) == 500
          and sum(row["status"] == "aberta" for row in current_occurrences) == 250
          and sum(row["status"] == "em_atendimento" for row in current_occurrences) == 250,
          f"{len(current_occurrences)} ativas; {sum(row['status'] == 'aberta' for row in current_occurrences)} abertas; {sum(row['status'] == 'em_atendimento' for row in current_occurrences)} em atendimento")
    occurrence_locations = {row["id_localizacao"]: row for row in tables["localizacoes"]}
    incidents_per_location = defaultdict(int)
    severity_by_grid = defaultdict(list)
    resolution_hours_by_grid = defaultdict(list)
    resolution_timestamps_valid = True
    severity_score = {"baixa": 1, "media": 2, "alta": 3, "critica": 4}
    for occurrence in occurrences:
        incidents_per_location[occurrence["id_localizacao"]] += 1
        place = occurrence_locations[occurrence["id_localizacao"]]
        cell = (round(place["latitude"], 2), round(place["longitude"], 2))
        severity_by_grid[cell].append(severity_score[occurrence["gravidade"]])
        resolution = occurrence.get("resolvida_em")
        if occurrence["status"] == "resolvida":
            if resolution is None:
                resolution_timestamps_valid = False
                continue
            occurred_at = datetime.fromisoformat(occurrence["ocorrida_em"])
            resolved_at = datetime.fromisoformat(resolution)
            if resolved_at <= occurred_at or resolved_at > datetime.now():
                resolution_timestamps_valid = False
                continue
            resolution_hours_by_grid[cell].append((resolved_at - occurred_at).total_seconds() / 3600)
        elif resolution is not None:
            resolution_timestamps_valid = False
    check("datas de resolucao coerentes com o status",
          resolution_timestamps_valid,
          f"{sum(len(values) for values in resolution_hours_by_grid.values())} ocorrencias resolvidas com data; demais sem data")
    regional_medians = [median(hours) for hours in resolution_hours_by_grid.values() if len(hours) >= 40]
    resolution_spread = max(regional_medians, default=0) / min(regional_medians, default=1)
    check("tempos de resolucao variam entre areas",
          len(regional_medians) >= 3 and resolution_spread >= 1.5,
          f"{len(regional_medians)} areas com 40+ casos; mediana max/min {resolution_spread:.2f}x")
    top_location_count = max(1, len(incidents_per_location) // 10)
    top_location_share = sum(sorted(incidents_per_location.values(), reverse=True)[:top_location_count]) / max(1, len(occurrences))
    check("concentracao geografica de ocorrencias",
          top_location_share >= 0.35,
          f"top {top_location_count} locais concentram {top_location_share:.1%} dos registros")
    populated_grid_scores = [
        sum(scores) / len(scores) for scores in severity_by_grid.values() if len(scores) >= 100
    ]
    severity_spread = max(populated_grid_scores, default=0) - min(populated_grid_scores, default=0)
    check("gravidade varia entre areas geograficas",
          len(populated_grid_scores) >= 3 and severity_spread >= 0.45,
          f"{len(populated_grid_scores)} areas com 100+ eventos; amplitude media {severity_spread:.2f}/3")
    trips_per_equipment = defaultdict(int)
    for trip in trips.values():
        if trip["id_equipamento"] in service_ids:
            trips_per_equipment[trip["id_equipamento"]] += 1
    check("historico de viagens para todos os equipamentos desses tipos",
          all(trips_per_equipment[eid] >= 4 for eid in service_ids),
          f"{sum(trips_per_equipment[eid] >= 4 for eid in service_ids)}/{len(service_ids)} equipamentos completos")
    new_service_locations = [row["id_localizacao"] for eid, row in eq.items() if eid >= 501 and row["id_tipo"] in (12, 13, 14, 15)]
    check("localizacoes variadas nos 32 cadastros adicionados",
          len(new_service_locations) == 32 and len(set(new_service_locations)) == 32,
          f"{len(set(new_service_locations))}/{len(new_service_locations)} localizacoes distintas")
    check("viagens vinculadas a equipamentos móveis", len(trips) >= 240 and all(r["id_equipamento"] in mobile for r in trips.values()), str(len(trips)))
    check("120+ posições por viagem", len(positions_by_trip) == len(trips) and all(len(v) >= 120 for v in positions_by_trip.values()),
          f"{len(positions_by_trip)} viagens; mínimo {min(map(len, positions_by_trip.values()), default=0)}")

    active_trips = [trip for trip in trips.values() if trip["situacao"] == "em_andamento"]
    check("ao menos 60 viagens ativas", len(active_trips) >= 60 and all(trip["fim_em"] is None for trip in active_trips), str(len(active_trips)))
    location_by_id = {row["id_localizacao"]: row for row in tables["localizacoes"]}
    equipment_by_id = {row["id_equipamento"]: row for row in tables["equipamentos"]}
    completed_by_equipment = {}
    for trip in trips.values():
        if trip["situacao"] == "concluida":
            prior = completed_by_equipment.get(trip["id_equipamento"])
            if prior is None or trip["id_viagem"] > prior["id_viagem"]:
                completed_by_equipment[trip["id_equipamento"]] = trip
    endpoints_ok = True
    for trip in active_trips:
        equip_id = trip["id_equipamento"]
        base = location_by_id[equipment_by_id[equip_id]["id_localizacao"]]
        route = sorted(positions_by_trip[trip["id_viagem"]], key=lambda row: row["id_posicao"])
        historic = positions_by_trip[completed_by_equipment[equip_id]["id_viagem"]]
        target = historic[-1]
        endpoints_ok &= (route[0]["latitude"], route[0]["longitude"]) == (round(base["latitude"], 7), round(base["longitude"], 7))
        endpoints_ok &= (route[-1]["latitude"], route[-1]["longitude"]) == (target["latitude"], target["longitude"])
    check("active route endpoints match registered base and latest GPS", endpoints_ok, str(len(active_trips)))

    # Explicit primary-key sets for FK checks.
    pk = {"orgaos":"id_orgao", "regioes":"id_regiao", "bairros":"id_bairro", "localizacoes":"id_localizacao",
          "tipos_equipamento":"id_tipo", "situacoes_equipamento":"id_situacao", "equipamentos":"id_equipamento",
          "atributos_tipo":"id_atributo", "agentes":"id_agente", "turnos_agente":"id_turno", "viagens":"id_viagem",
          "ocorrencias":"id_ocorrencia", "alertas":"id_alerta"}
    ids = {t: {r[k] for r in tables.get(t, [])} for t, k in pk.items()}
    relations = [("bairros","id_regiao","regioes"),("localizacoes","id_bairro","bairros"),
                 ("equipamentos","id_tipo","tipos_equipamento"),("equipamentos","id_orgao","orgaos"),
                 ("equipamentos","id_localizacao","localizacoes"),("equipamentos","id_situacao","situacoes_equipamento"),
                 ("viagens","id_equipamento","equipamentos"),("posicoes_equipamento","id_equipamento","equipamentos"),
                 ("posicoes_equipamento","id_viagem","viagens"),("agentes","id_orgao","orgaos"),
                 ("agentes","id_localizacao_base","localizacoes"),("turnos_agente","id_agente","agentes"),
                 ("turnos_agente","id_equipamento","equipamentos"),("turnos_agente","id_regiao","regioes"),
                 ("ocorrencias","id_localizacao","localizacoes"),
                 ("ocorrencias","id_orgao","orgaos"),("ocorrencias","id_equipamento","equipamentos"),
                 ("alertas","id_equipamento","equipamentos"),("alertas","id_agente","agentes"),
                 ("alertas","id_ocorrencia","ocorrencias"),("alertas","id_regiao","regioes")]
    broken = [(t, col) for t,col,parent in relations for r in tables.get(t, []) if r.get(col) is not None and r[col] not in ids[parent]]
    check("relações FK", not broken, f"{len(broken)} referências inválidas")
    mismatch = [(r["id_equipamento"], r["id_atributo"]) for r in tables["valores_atributo"]
                if eq[r["id_equipamento"]]["id_tipo"] != next(a["id_tipo"] for a in tables["atributos_tipo"] if a["id_atributo"] == r["id_atributo"])]
    check("atributos compatíveis com tipo", not mismatch, f"{len(mismatch)} incompatíveis")
    migration_path = seed_path.with_name("migrate_equipment_attributes.sql")
    migration_definitions = {}
    migration_values = {}
    if migration_path.exists():
        migration_sql = migration_path.read_text(encoding="utf-8")
        migration_pattern = re.compile(r"INSERT INTO `?([^`\s(]+)`? \(([^)]*)\) VALUES\s*(.*);", re.S)
        for statement in _statements(migration_sql):
            match = migration_pattern.fullmatch(statement.strip())
            if not match:
                continue
            table = match.group(1)
            if table not in ("migration_attribute_definitions", "migration_attribute_values"):
                continue
            columns = re.findall(r"`([^`]+)`", match.group(2))
            for row in _parse_value_list(match.group(3)):
                parsed = dict(zip(columns, row))
                if table == "migration_attribute_definitions":
                    migration_definitions[(parsed["id_tipo"], parsed["nome"])] = (
                        parsed["tipo_valor"], parsed["unidade"], parsed["obrigatorio"])
                else:
                    key = (parsed["id_equipamento"], parsed["id_tipo"], parsed["nome"])
                    migration_values[key] = (parsed["valor_texto"], parsed["valor_numero"], parsed["valor_booleano"])
    seed_definitions = {
        (definition["id_tipo"], definition["nome"]): (
            definition["tipo_valor"], definition["unidade"], definition["obrigatorio"])
        for definition in attribute_definitions.values()
    }
    seed_values_by_name = {}
    for value in tables.get("valores_atributo", []):
        definition = attribute_definitions.get(value["id_atributo"])
        if definition is not None:
            key = (value["id_equipamento"], definition["id_tipo"], definition["nome"])
            seed_values_by_name[key] = (value["valor_texto"], value["valor_numero"], value["valor_booleano"])
    check("catálogo de atributos da migração igual ao seed",
          migration_path.exists() and migration_definitions == seed_definitions,
          f"{len(migration_definitions)} definições na migração; {len(seed_definitions)} no seed")
    check("valores da migração iguais ao seed",
          migration_path.exists() and migration_values == seed_values_by_name,
          f"{len(migration_values)} valores na migração; {len(seed_values_by_name)} no seed")

    agent_migration_path = seed_path.with_name("migrate_agent_vehicle_shifts.sql")
    agent_migration_assignments = {}
    if agent_migration_path.exists():
        agent_migration_sql = agent_migration_path.read_text(encoding="utf-8")
        assignment_match = re.search(
            r"INSERT INTO migration_agent_vehicle_assignments \(([^)]*)\) VALUES\s*(.*?);",
            agent_migration_sql,
            re.S,
        )
        if assignment_match:
            columns = re.findall(r"`([^`]+)`", assignment_match.group(1))
            if not columns:
                columns = [column.strip() for column in assignment_match.group(1).split(",")]
            for row in _parse_value_list(assignment_match.group(2)):
                parsed = dict(zip(columns, row))
                agent_migration_assignments[parsed["id_agente"]] = (
                    parsed["id_equipamento"], parsed["id_regiao"], parsed["status"])
    seed_agent_assignments = {
        row["id_agente"]: (row["id_equipamento"], row["id_regiao"], row["status"])
        for row in shifts if row["status"] != "encerrado"
    }
    check("agent shift migration matches seed",
          agent_migration_path.exists() and agent_migration_assignments == seed_agent_assignments,
          f"{len(agent_migration_assignments)} migration assignments; {len(seed_agent_assignments)} in seed")

    chronology_ok = True
    for trip_id, rows in positions_by_trip.items():
        rows.sort(key=lambda r: r["id_posicao"])
        times = [datetime.strptime(r["registrado_em"], "%Y-%m-%d %H:%M:%S") for r in rows]
        trip = trips[trip_id]
        if any(b <= a for a,b in zip(times, times[1:])) or times[0] != datetime.strptime(trip["inicio_em"], "%Y-%m-%d %H:%M:%S") or (trip["situacao"] == "em_andamento" and trip["fim_em"] is not None) or (trip["situacao"] != "em_andamento" and trip["fim_em"] is None) or (trip["fim_em"] is not None and times[-1] != datetime.strptime(trip["fim_em"], "%Y-%m-%d %H:%M:%S")):
            chronology_ok = False; break
    check("ordem cronológica e início/fim GPS", chronology_ok, "conferido em todas as viagens")

    graph = ox.load_graphml(graph_path)
    coords = [(r["longitude"], r["latitude"]) for r in tables["posicoes_equipamento"] if r["id_viagem"] is not None]
    min_lat = min(lat for _, lat in coords); max_lat = max(lat for _, lat in coords)
    min_lon = min(lon for lon, _ in coords); max_lon = max(lon for lon, _ in coords)
    edge_bounds = []
    for u, v, key, data in graph.edges(keys=True, data=True):
        geom = data.get("geometry")
        edge_bounds.append(geom.bounds if geom is not None else (graph.nodes[u]["x"], graph.nodes[u]["y"], graph.nodes[v]["x"], graph.nodes[v]["y"]))
    bounds_ok = min_lat >= min(b[1] for b in edge_bounds) - 1e-6 and max_lat <= max(b[3] for b in edge_bounds) + 1e-6 and min_lon >= min(b[0] for b in edge_bounds) - 1e-6 and max_lon <= max(b[2] for b in edge_bounds) + 1e-6
    check("GPS positions fall within the OSM graph bounds", bounds_ok, f"lat {min_lat:.5f}..{max_lat:.5f}, lon {min_lon:.5f}..{max_lon:.5f}")
    for label, ok, detail in checks:
        print(f"{'PASS' if ok else 'FAIL'} {label}: {detail}")
    return 0 if all(ok for _, ok, _ in checks) else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed-sql", type=Path, help="Validate generated SQL and routes offline without a MySQL connection")
    parser.add_argument("--graph", type=Path, default=Path(__file__).with_name("marilia.graphml"))
    args = parser.parse_args()
    if args.seed_sql:
        return validate_seed(args.seed_sql, args.graph)
    if not os.getenv("MYSQL_USER"):
        print("Defina MYSQL_USER e as demais variáveis MYSQL_* antes de executar a validação.", file=sys.stderr)
        return 2
    connection = mysql.connector.connect(
        host=os.getenv("MYSQL_HOST", "127.0.0.1"),
        port=int(os.getenv("MYSQL_PORT", "3306")),
        user=os.environ["MYSQL_USER"],
        password=os.getenv("MYSQL_PASSWORD", ""),
        database=os.getenv("MYSQL_DATABASE", "fogo"),
    )
    cursor = connection.cursor()
    checks = []

    def check(label, query, predicate, expected):
        cursor.execute(query)
        result = cursor.fetchone()[0]
        ok = predicate(result)
        checks.append((label, ok, result, expected))

    check("equipamentos", "SELECT COUNT(*) FROM equipamentos", lambda n: n >= 532, ">= 532")
    check("agentes", "SELECT COUNT(*) FROM agentes", lambda n: n >= 100, ">= 100")
    check("localizacoes", "SELECT COUNT(*) FROM localizacoes", lambda n: n >= 300, ">= 300")
    check("equipamentos móveis", "SELECT COUNT(*) FROM equipamentos e JOIN tipos_equipamento t USING(id_tipo) WHERE t.mobilidade='movel'", lambda n: n >= 92, ">= 92")
    for type_id, label in ((12, "táxi"), (13, "mototáxi"), (14, "transporte escolar"), (15, "fiscalização autônoma")):
        check(f"equipamentos {label}", f"SELECT COUNT(*) FROM equipamentos WHERE id_tipo={type_id}", lambda n: n >= 8, ">= 8")
    check("atributos nos 32 equipamentos dos novos tipos", "SELECT COUNT(*) FROM equipamentos e WHERE e.id_tipo IN (12,13,14,15) AND (SELECT COUNT(*) FROM valores_atributo v WHERE v.id_equipamento=e.id_equipamento) >= 2", lambda n: n >= 32, ">= 32")
    check("ocorrencias nos 32 equipamentos dos novos tipos", "SELECT COUNT(*) FROM equipamentos e WHERE e.id_tipo IN (12,13,14,15) AND (SELECT COUNT(*) FROM ocorrencias o WHERE o.id_equipamento=e.id_equipamento) >= 3", lambda n: n >= 32, ">= 32")
    check("viagens nos 32 equipamentos dos novos tipos", "SELECT COUNT(*) FROM equipamentos e WHERE e.id_tipo IN (12,13,14,15) AND (SELECT COUNT(*) FROM viagens v WHERE v.id_equipamento=e.id_equipamento) >= 4", lambda n: n >= 32, ">= 32")
    check("rotas completas nos 32 equipamentos dos novos tipos", "SELECT COUNT(*) FROM equipamentos e WHERE e.id_tipo IN (12,13,14,15) AND (SELECT COUNT(*) FROM viagens v WHERE v.id_equipamento=e.id_equipamento AND (SELECT COUNT(*) FROM posicoes_equipamento p WHERE p.id_viagem=v.id_viagem) >= 120) >= 4", lambda n: n >= 32, ">= 32")
    check("bases distintas nos novos tipos", "SELECT COUNT(DISTINCT id_localizacao) FROM equipamentos WHERE id_tipo IN (12,13,14,15)", lambda n: n >= 32, ">= 32")
    check("viagens", "SELECT COUNT(*) FROM viagens", lambda n: n >= 240, ">= 240")
    check("viagens ativas", "SELECT COUNT(*) FROM viagens WHERE situacao='em_andamento' AND fim_em IS NULL", lambda n: n >= 60, ">= 60")
    check("posições GPS", "SELECT COUNT(*) FROM posicoes_equipamento WHERE id_viagem IS NOT NULL", lambda n: n >= 28800, ">= 28800")
    check("manutenções", "SELECT COUNT(*) FROM manutencoes", lambda n: n >= 800, ">= 800")
    check("ocorrências", "SELECT COUNT(*) FROM ocorrencias", lambda n: n >= 10000, ">= 10000")
    check("datas de resolução coerentes", "SELECT COUNT(*) FROM ocorrencias WHERE resolvida_em IS NOT NULL AND (status <> 'resolvida' OR resolvida_em <= ocorrida_em OR resolvida_em > NOW())", lambda n: n == 0, "0 inconsistentes")
    check("resoluções demonstrativas preenchidas", "SELECT COUNT(*) FROM ocorrencias WHERE id_ocorrencia <= 10000 AND descricao LIKE 'Evento fict%' AND status='resolvida' AND resolvida_em IS NULL", lambda n: n == 0, "0 sem data")
    cursor.execute("""
        WITH durations AS (
          SELECT ROUND(l.latitude,2) AS lat, ROUND(l.longitude,2) AS lon,
                 TIMESTAMPDIFF(SECOND,o.ocorrida_em,o.resolvida_em)/3600 AS hours
          FROM ocorrencias o JOIN localizacoes l ON l.id_localizacao=o.id_localizacao
          WHERE o.status='resolvida' AND o.resolvida_em IS NOT NULL
        ), ranked AS (
          SELECT lat,lon,hours,ROW_NUMBER() OVER (PARTITION BY lat,lon ORDER BY hours) AS rn,
                 COUNT(*) OVER (PARTITION BY lat,lon) AS n
          FROM durations
        ), medians AS (
          SELECT lat,lon,AVG(hours) AS median_hours FROM ranked
          WHERE rn IN (FLOOR((n+1)/2),FLOOR((n+2)/2))
          GROUP BY lat,lon HAVING MAX(n)>=40
        )
        SELECT COUNT(*), MAX(median_hours)/MIN(median_hours) FROM medians
    """)
    area_count, response_time_spread = cursor.fetchone()
    response_time_spread = response_time_spread or 0
    checks.append(("tempos de resolução variam entre áreas",
                   area_count >= 3 and response_time_spread >= 1.5,
                   f"{area_count} áreas; relação lenta/rápida {response_time_spread:.2f}x",
                   ">= 3 áreas e >= 1.5x"))
    check("alertas", "SELECT COUNT(*) FROM alertas", lambda n: n >= 250, ">= 250")
    check("viagens com ao menos 120 posições", "SELECT COUNT(*) FROM (SELECT id_viagem FROM posicoes_equipamento WHERE id_viagem IS NOT NULL GROUP BY id_viagem HAVING COUNT(*) >= 120) q", lambda n: n >= 240, ">= 240 viagens")
    import osmnx as ox
    road_graph = ox.load_graphml(args.graph)
    edge_bounds = []
    for u,v,key,data in road_graph.edges(keys=True, data=True):
        geom = data.get("geometry")
        edge_bounds.append(geom.bounds if geom is not None else (road_graph.nodes[u]["x"], road_graph.nodes[u]["y"], road_graph.nodes[v]["x"], road_graph.nodes[v]["y"]))
    min_lon = min(b[0] for b in edge_bounds); min_lat = min(b[1] for b in edge_bounds)
    max_lon = max(b[2] for b in edge_bounds); max_lat = max(b[3] for b in edge_bounds)
    cursor.execute("SELECT COUNT(*) FROM localizacoes WHERE latitude NOT BETWEEN %s AND %s OR longitude NOT BETWEEN %s AND %s", (min_lat, max_lat, min_lon, max_lon))
    outside = cursor.fetchone()[0]
    checks.append(("coordenadas locais dentro dos limites do grafo OSM", outside == 0, outside, "0 fora da área"))
    check("posições fora de ordem cronológica", "SELECT COUNT(*) FROM (SELECT registrado_em, LAG(registrado_em) OVER (PARTITION BY id_viagem ORDER BY id_posicao) AS anterior FROM posicoes_equipamento WHERE id_viagem IS NOT NULL) p WHERE anterior > registrado_em", lambda n: n == 0, "0")
    check("referências órfãs", "SELECT SUM(n) FROM (SELECT COUNT(*) n FROM equipamentos e LEFT JOIN tipos_equipamento t USING(id_tipo) WHERE t.id_tipo IS NULL UNION ALL SELECT COUNT(*) FROM equipamentos e LEFT JOIN orgaos o USING(id_orgao) WHERE o.id_orgao IS NULL UNION ALL SELECT COUNT(*) FROM equipamentos e LEFT JOIN localizacoes l USING(id_localizacao) WHERE e.id_localizacao IS NOT NULL AND l.id_localizacao IS NULL UNION ALL SELECT COUNT(*) FROM equipamentos e LEFT JOIN situacoes_equipamento s USING(id_situacao) WHERE s.id_situacao IS NULL UNION ALL SELECT COUNT(*) FROM posicoes_equipamento p LEFT JOIN viagens v USING(id_viagem) WHERE p.id_viagem IS NOT NULL AND v.id_viagem IS NULL UNION ALL SELECT COUNT(*) FROM viagens v LEFT JOIN equipamentos e USING(id_equipamento) WHERE e.id_equipamento IS NULL) refs", lambda n: (n or 0) == 0, "0")
    check("atributos incompatíveis com tipo de equipamento", "SELECT COUNT(*) FROM valores_atributo v JOIN equipamentos e USING(id_equipamento) JOIN atributos_tipo a USING(id_atributo) WHERE e.id_tipo <> a.id_tipo", lambda n: n == 0, "0")
    check("atributos obrigatórios sem valor", "SELECT COUNT(*) FROM equipamentos e JOIN atributos_tipo a ON a.id_tipo=e.id_tipo AND a.obrigatorio=1 LEFT JOIN valores_atributo v ON v.id_equipamento=e.id_equipamento AND v.id_atributo=a.id_atributo WHERE v.id_equipamento IS NULL", lambda n: n == 0, "0")
    check("modalidades de radares cobrem retorno proibido", "SELECT COUNT(DISTINCT v.valor_texto) FROM valores_atributo v JOIN atributos_tipo a USING(id_atributo) WHERE a.id_tipo IN (1,2) AND a.nome='modalidade'", lambda n: n >= 5, ">= 5")
    check("câmeras com os dois tipos de imagem", "SELECT COUNT(DISTINCT v.valor_texto) FROM valores_atributo v JOIN atributos_tipo a USING(id_atributo) WHERE a.id_tipo=3 AND a.nome='tipo_imagem'", lambda n: n >= 2, ">= 2")

    for label, ok, actual, expected in checks:
        print(f"{'PASS' if ok else 'FAIL'} {label}: {actual} (esperado {expected})")
    cursor.close()
    connection.close()
    return 0 if all(ok for _, ok, _, _ in checks) else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except mysql.connector.Error as exc:
        print(f"Não foi possível validar o MySQL: {exc}", file=sys.stderr)
        raise SystemExit(2)
