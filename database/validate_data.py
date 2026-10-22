"""Validate the populated F.O.G.O. demo database using MYSQL_* environment settings."""
from __future__ import annotations

import argparse
import os
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

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
                "posicoes_equipamento": 28800, "manutencoes": 800, "ocorrencias": 1000, "alertas": 250}
    for table, minimum in required.items():
        check(f"{table} >= {minimum}", len(tables.get(table, [])) >= minimum, str(len(tables.get(table, []))))
    eq = {r["id_equipamento"]: r for r in tables["equipamentos"]}
    types = {r["id_tipo"]: r for r in tables["tipos_equipamento"]}
    mobile = {eid for eid, row in eq.items() if types[row["id_tipo"]]["mobilidade"] == "movel"}
    trips = {r["id_viagem"]: r for r in tables["viagens"]}
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
    occurrences_per_equipment = defaultdict(int)
    for occurrence in tables.get("ocorrencias", []):
        if occurrence["id_equipamento"] in service_ids:
            occurrences_per_equipment[occurrence["id_equipamento"]] += 1
    check("ao menos 3 ocorrencias por equipamento desses tipos",
          all(occurrences_per_equipment[eid] >= 3 for eid in service_ids),
          f"{sum(occurrences_per_equipment[eid] >= 3 for eid in service_ids)}/{len(service_ids)} equipamentos completos")
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
                 ("agentes","id_localizacao_base","localizacoes"),("ocorrencias","id_localizacao","localizacoes"),
                 ("ocorrencias","id_orgao","orgaos"),("ocorrencias","id_equipamento","equipamentos"),
                 ("alertas","id_equipamento","equipamentos"),("alertas","id_agente","agentes"),
                 ("alertas","id_ocorrencia","ocorrencias"),("alertas","id_regiao","regioes")]
    broken = [(t, col) for t,col,parent in relations for r in tables.get(t, []) if r.get(col) is not None and r[col] not in ids[parent]]
    check("relações FK", not broken, f"{len(broken)} referências inválidas")
    mismatch = [(r["id_equipamento"], r["id_atributo"]) for r in tables["valores_atributo"]
                if eq[r["id_equipamento"]]["id_tipo"] != next(a["id_tipo"] for a in tables["atributos_tipo"] if a["id_atributo"] == r["id_atributo"])]
    check("atributos compatíveis com tipo", not mismatch, f"{len(mismatch)} incompatíveis")

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
    check("ocorrências", "SELECT COUNT(*) FROM ocorrencias", lambda n: n >= 1000, ">= 1000")
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
