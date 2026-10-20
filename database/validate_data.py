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

    required = {"equipamentos": 500, "agentes": 100, "localizacoes": 300, "viagens": 180,
                "posicoes_equipamento": 21600, "manutencoes": 800, "ocorrencias": 1000, "alertas": 250}
    for table, minimum in required.items():
        check(f"{table} >= {minimum}", len(tables.get(table, [])) >= minimum, str(len(tables.get(table, []))))
    eq = {r["id_equipamento"]: r for r in tables["equipamentos"]}
    types = {r["id_tipo"]: r for r in tables["tipos_equipamento"]}
    mobile = {eid for eid, row in eq.items() if types[row["id_tipo"]]["mobilidade"] == "movel"}
    trips = {r["id_viagem"]: r for r in tables["viagens"]}
    positions_by_trip = defaultdict(list)
    for row in tables["posicoes_equipamento"]:
        if row["id_viagem"] is not None: positions_by_trip[row["id_viagem"]].append(row)
    check("60 equipamentos móveis", len(mobile) == 60, str(len(mobile)))
    check("180 viagens em equipamentos móveis", len(trips) == 180 and all(r["id_equipamento"] in mobile for r in trips.values()), str(len(trips)))
    check("120+ posições por viagem", len(positions_by_trip) == 180 and all(len(v) >= 120 for v in positions_by_trip.values()),
          f"{len(positions_by_trip)} viagens; mínimo {min(map(len, positions_by_trip.values()), default=0)}")

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
        if any(b <= a for a,b in zip(times, times[1:])) or times[0] != datetime.strptime(trip["inicio_em"], "%Y-%m-%d %H:%M:%S") or times[-1] != datetime.strptime(trip["fim_em"], "%Y-%m-%d %H:%M:%S"):
            chronology_ok = False; break
    check("ordem cronológica e início/fim GPS", chronology_ok, "conferido em todas as viagens")

    graph = ox.load_graphml(graph_path)
    projected = ox.project_graph(graph)
    inv = Transformer.from_crs(graph.graph["crs"], projected.graph["crs"], always_xy=True)
    coords = [(r["longitude"], r["latitude"]) for r in tables["posicoes_equipamento"] if r["id_viagem"] is not None]
    road_samples = []
    for rows in positions_by_trip.values():
        rows.sort(key=lambda r: r["id_posicao"])
        xy = [inv.transform(r["longitude"], r["latitude"]) for r in rows]
        road_samples.extend(xy)
        # Leaflet draws straight segments between saved positions: sample each chord too.
        for (x1,y1),(x2,y2) in zip(xy,xy[1:]):
            for fraction in (.25, .5, .75):
                road_samples.append((x1 + (x2-x1)*fraction, y1 + (y2-y1)*fraction))
    xs, ys = zip(*road_samples)
    edges = ox.distance.nearest_edges(projected, X=list(xs), Y=list(ys))
    max_dist = 0.0
    for (x,y), (u,v,key) in zip(zip(xs,ys), edges):
        edge = projected.edges[u,v,key]
        geom = edge.get("geometry") or LineString([(projected.nodes[u]["x"], projected.nodes[u]["y"]), (projected.nodes[v]["x"], projected.nodes[v]["y"])])
        max_dist = max(max_dist, Point(x,y).distance(geom))
    check("posições e segmentos Polyline acompanham OSM (<= 3 m)", max_dist <= 3.0, f"distância máxima {max_dist:.3f} m")
    min_lat = min(lat for _,lat in coords); max_lat = max(lat for _,lat in coords)
    min_lon = min(lon for lon,_ in coords); max_lon = max(lon for lon,_ in coords)
    edge_bounds = []
    for u,v,key,data in graph.edges(keys=True, data=True):
        geom = data.get("geometry")
        edge_bounds.append(geom.bounds if geom is not None else (graph.nodes[u]["x"], graph.nodes[u]["y"], graph.nodes[v]["x"], graph.nodes[v]["y"]))
    check("coordenadas GPS dentro dos limites das vias OSM", min_lat >= min(b[1] for b in edge_bounds) - 1e-6 and max_lat <= max(b[3] for b in edge_bounds) + 1e-6 and min_lon >= min(b[0] for b in edge_bounds) - 1e-6 and max_lon <= max(b[2] for b in edge_bounds) + 1e-6,
          f"lat {min_lat:.5f}..{max_lat:.5f}, lon {min_lon:.5f}..{max_lon:.5f}")
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

    check("equipamentos", "SELECT COUNT(*) FROM equipamentos", lambda n: n >= 500, ">= 500")
    check("agentes", "SELECT COUNT(*) FROM agentes", lambda n: n >= 100, ">= 100")
    check("localizacoes", "SELECT COUNT(*) FROM localizacoes", lambda n: n >= 300, ">= 300")
    check("equipamentos móveis", "SELECT COUNT(*) FROM equipamentos e JOIN tipos_equipamento t USING(id_tipo) WHERE t.mobilidade='movel'", lambda n: n >= 60, ">= 60")
    check("viagens", "SELECT COUNT(*) FROM viagens", lambda n: n >= 180, ">= 180")
    check("posições GPS", "SELECT COUNT(*) FROM posicoes_equipamento WHERE id_viagem IS NOT NULL", lambda n: n >= 21600, ">= 21600")
    check("manutenções", "SELECT COUNT(*) FROM manutencoes", lambda n: n >= 800, ">= 800")
    check("ocorrências", "SELECT COUNT(*) FROM ocorrencias", lambda n: n >= 1000, ">= 1000")
    check("alertas", "SELECT COUNT(*) FROM alertas", lambda n: n >= 250, ">= 250")
    check("viagens com ao menos 120 posições", "SELECT COUNT(*) FROM (SELECT id_viagem FROM posicoes_equipamento WHERE id_viagem IS NOT NULL GROUP BY id_viagem HAVING COUNT(*) >= 120) q", lambda n: n >= 180, ">= 180 viagens")
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
