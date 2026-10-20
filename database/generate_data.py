"""Generate a reproducible, OSM-based SQL demo dataset for the F.O.G.O. schema."""
from __future__ import annotations

import argparse
import logging
import math
import random
from datetime import datetime, timedelta
from pathlib import Path

from generate_routes import load_graph, route_points

HERE = Path(__file__).resolve().parent
LOG = logging.getLogger("fogo.generate")
NOW = datetime(2026, 10, 20, 12, 0, 0)


def q(value):
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, datetime):
        value = value.strftime("%Y-%m-%d %H:%M:%S")
    return "'" + str(value).replace("\\", "\\\\").replace("'", "\\'").replace("\x00", "") + "'"


def insert(table, columns, rows, batch=500):
    if not rows:
        return ""
    head = f"INSERT INTO `{table}` ({', '.join(f'`{c}`' for c in columns)}) VALUES\n"
    statements = []
    for offset in range(0, len(rows), batch):
        values = ["(" + ", ".join(q(v) for v in row) + ")" for row in rows[offset:offset + batch]]
        statements.append(head + ",\n".join(values) + ";")
    return "\n".join(statements) + "\n"


def generate(seed: int, out: Path, graph_path: Path, without_routes: bool = False):
    rng = random.Random(seed)
    graph = load_graph(graph_path)
    nodes = list(graph.nodes)
    if not nodes:
        raise RuntimeError("OSM road graph is empty")

    sql = ["-- Generated synthetic demo data. Seed: %d\nUSE fogo;\nSTART TRANSACTION;\n" % seed]
    counts = {}
    def add(table, cols, rows):
        counts[table] = len(rows)
        sql.append(insert(table, cols, rows))

    regions = ["Norte", "Sul", "Leste", "Oeste", "Centro", "Nordeste", "Noroeste", "Sudeste", "Sudoeste", "Industrial"]
    add("orgaos", ["id_orgao", "nome", "sigla", "esfera"], [
        (1, "Secretaria Municipal de Mobilidade Urbana", "SMU", "municipal"),
        (2, "Guarda Municipal de Marília", "GMM", "municipal"),
        (3, "Polícia Militar", "PM", "estadual"),
        (4, "Fiscalização de Trânsito", "FISC", "municipal"),
    ])
    add("regioes", ["id_regiao", "nome", "descricao"], [(i + 1, n, "Região sintética de demonstração; não representa divisão oficial.") for i, n in enumerate(regions)])
    neighborhoods = [(i + 1, i % 10 + 1, f"Setor demonstrativo {i + 1:02d}") for i in range(40)]
    add("bairros", ["id_bairro", "id_regiao", "nome"], neighborhoods)

    # Locations are snapped to actual OSM road-network nodes and clearly marked as synthetic references.
    locations = []
    node_coords = []
    for i in range(350):
        node_id = rng.choice(nodes)
        node = graph.nodes[node_id]
        lon, lat = float(node["x"]), float(node["y"])
        node_coords.append((lon, lat))
        locations.append((i + 1, i % 40 + 1, None, "Marília", "SP", None,
                          f"Referência sintética {i + 1:03d}; coordenada de via OSM", round(lat, 7), round(lon, 7)))
    add("localizacoes", ["id_localizacao", "id_bairro", "cep", "cidade", "uf", "logradouro", "referencia", "latitude", "longitude"], locations)

    types = [
        ("Radar fixo", "fixo", "radar"), ("Radar móvel", "movel", "radar"), ("Câmera de monitoramento", "fixo", "camera"),
        ("Cancela automatizada", "fixo", "cancela"), ("Totem de estacionamento", "fixo", "parking"), ("Balança de caminhões", "fixo", "scale"),
        ("Patinete elétrico", "movel", "scooter"), ("Motocicleta", "movel", "motorcycle"), ("Viatura policial", "movel", "police"),
        ("Veículo da Guarda Municipal", "movel", "municipal"), ("Veículo de fiscalização", "movel", "car"),
    ]
    add("tipos_equipamento", ["id_tipo", "nome", "mobilidade", "icone_mapa"], [(i + 1, *t) for i, t in enumerate(types)])
    states = [(1, "operacional", True), (2, "indisponível", False), (3, "desativado", False), (4, "furtado", False), (5, "em manutenção", False)]
    add("situacoes_equipamento", ["id_situacao", "nome", "disponivel"], states)
    mobile_ids = [2, 7, 8, 9, 10, 11]
    equipment_rows = []
    type_order = [2, 7, 8, 9, 10, 11] * 10  # exactly 60 mobile units
    fixed_types = [1, 3, 4, 5, 6]
    type_order += [rng.choice(fixed_types) for _ in range(440)]
    rng.shuffle(type_order)
    equipment_type = {}
    for i, type_id in enumerate(type_order, 1):
        equipment_type[i] = type_id
        state = rng.choices([1, 2, 3, 4, 5], [78, 8, 4, 2, 8])[0]
        equipment_rows.append((i, type_id, rng.choices([1, 2, 3, 4], [35, 25, 20, 20])[0],
                               rng.randint(1, 350), state, f"DEMO-{i:05d}",
                               ["Intelbras", "Dahua", "Pumatronix", "Siemens", "DemoTech"][i % 5],
                               f"Modelo-{(i % 17) + 1:02d}", NOW - timedelta(days=rng.randint(30, 1300)),
                               NOW - timedelta(days=rng.randint(1, 1000)) if type_id not in mobile_ids else None))
    add("equipamentos", ["id_equipamento", "id_tipo", "id_orgao", "id_localizacao", "id_situacao", "numero_serie", "marca", "modelo", "cadastrado_em", "instalado_em"], equipment_rows)

    attr_defs = [(1, "limite_velocidade", "numero", "km/h"), (1, "modalidade", "texto", None),
                 (2, "limite_velocidade", "numero", "km/h"), (2, "modalidade", "texto", None),
                 (3, "resolucao", "texto", None), (3, "visao_noturna", "booleano", None),
                 (4, "largura_m", "numero", "m"), (5, "vagas_monitoradas", "numero", "vagas"),
                 (6, "capacidade_ton", "numero", "t"), (7, "autonomia_km", "numero", "km"),
                 (8, "cilindrada_cc", "numero", "cc"), (9, "tracao", "texto", None),
                 (10, "tracao", "texto", None), (11, "tracao", "texto", None)]
    add("atributos_tipo", ["id_atributo", "id_tipo", "nome", "tipo_valor", "unidade", "obrigatorio"], [(i + 1, *a, True) for i, a in enumerate(attr_defs)])
    attr_by_type = {}
    for i, a in enumerate(attr_defs, 1):
        attr_by_type.setdefault(a[0], []).append(i)
    values = []
    for equip_id, type_id in equipment_type.items():
        for attr_id in attr_by_type.get(type_id, []):
            definition = attr_defs[attr_id - 1]
            name, kind = definition[1], definition[2]
            if name == "limite_velocidade": value = (None, rng.choice([40, 50, 60, 80]), None)
            elif name == "modalidade": value = (rng.choice(["velocidade", "avanço de sinal", "faixa exclusiva"]), None, None)
            elif name == "resolucao": value = (rng.choice(["1080p", "4K", "5MP"]), None, None)
            elif kind == "booleano": value = (None, None, rng.choice([True, False]))
            elif kind == "numero": value = (None, rng.randint(5, 120), None)
            else: value = (rng.choice(["elétrica", "híbrida", "combustão"]), None, None)
            values.append((equip_id, attr_id, *value))
    add("valores_atributo", ["id_equipamento", "id_atributo", "valor_texto", "valor_numero", "valor_booleano"], values)

    histories = []
    history_id = 0
    for i, row in enumerate(equipment_rows, 1):
        created = row[8]
        first_change = created + (NOW - created) * rng.uniform(.25, .55)
        current_change = first_change + (NOW - first_change) * rng.uniform(.4, .85)
        prior_state = rng.choice([1, 2, 3, 5])
        history_id += 1
        histories.append((history_id, i, prior_state, created, first_change, "Estado anterior sintético"))
        history_id += 1
        histories.append((history_id, i, row[4], current_change, None, "Situação atual de demonstração"))
    add("historico_situacoes", ["id_historico", "id_equipamento", "id_situacao", "iniciado_em", "encerrado_em", "observacao"], histories)
    maintenance = []
    for i in range(800):
        equip = rng.randint(1, 500); opened = NOW - timedelta(days=rng.randint(0, 700)); status = rng.choices(["pendente", "agendada", "em_execucao", "concluida", "cancelada"], [15, 20, 8, 52, 5])[0]
        started = opened + timedelta(days=rng.randint(0, 20)) if status in ("em_execucao", "concluida") else None
        ended = started + timedelta(hours=rng.randint(1, 12)) if status == "concluida" else None
        maintenance.append((i + 1, equip, rng.choice(["preventiva", "corretiva"]), rng.choice(["imediata", "agendada"]), status, "Registro sintético de manutenção", opened, opened + timedelta(days=rng.randint(-15, 60)), started, ended))
    add("manutencoes", ["id_manutencao", "id_equipamento", "modalidade", "prioridade", "status", "descricao", "aberta_em", "prevista_para", "iniciada_em", "concluida_em"], maintenance)

    agents = [(i, rng.choice([1, 2, 3, 4]), rng.randint(1, 350), f"DEMO-AG-{i:04d}", f"Agente Demonstrativo {i:03d}", rng.choice(["agente de trânsito", "guarda municipal", "policial", "fiscal"]), i <= 94) for i in range(1, 101)]
    add("agentes", ["id_agente", "id_orgao", "id_localizacao_base", "matricula", "nome", "cargo", "ativo_cadastro"], agents)
    shifts = []
    for i in range(1, 101):
        start = NOW - timedelta(days=rng.randint(0, 30), hours=rng.randint(0, 8))
        shifts.append((i, i, rng.randint(1, 10), start, start + timedelta(hours=8), start, start + timedelta(hours=8), "encerrado"))
    add("turnos_agente", ["id_turno", "id_agente", "id_regiao", "inicio_previsto", "fim_previsto", "inicio_real", "fim_real", "status"], shifts)

    trip_rows, positions = [], []
    min_positions_per_trip = 0
    if not without_routes:
        mobile_equipment = [i for i, tid in equipment_type.items() if tid in mobile_ids]
        trip_id, pos_id = 0, 0
        for equip_id in mobile_equipment:
            vehicle_start = NOW - timedelta(days=rng.randint(35, 180))
            for trip_index in range(3):
                trip_id += 1
                points, distance = route_points(graph, 120, rng, max_spacing_m=10.0)
                min_positions_per_trip = min(min_positions_per_trip or len(points), len(points))
                # Three non-overlapping runs per unit, each at least a day apart.
                start = vehicle_start + timedelta(days=trip_index * 7, hours=rng.randint(0, 10))
                speed = rng.uniform(18, 42)
                duration_seconds = math.ceil(max(600, distance / (speed / 3.6), (len(points) - 1) * 2))
                end = start + timedelta(seconds=duration_seconds)
                trip_rows.append((trip_id, equip_id, start, end, round(distance, 2), "concluida"))
                for ix, (lon, lat) in enumerate(points):
                    pos_id += 1
                    at = start + timedelta(seconds=(duration_seconds * ix) // (len(points) - 1))
                    positions.append((pos_id, equip_id, trip_id, round(lat, 7), round(lon, 7), round(speed * rng.uniform(.75, 1.2), 2), at))
        if len(trip_rows) != 180 or len(positions) < 21600:
            raise AssertionError("Trip/position minimums were not met")
    add("viagens", ["id_viagem", "id_equipamento", "inicio_em", "fim_em", "distancia_m", "situacao"], trip_rows)
    add("posicoes_equipamento", ["id_posicao", "id_equipamento", "id_viagem", "latitude", "longitude", "velocidade_kmh", "registrado_em"], positions)

    occurrences = []
    for i in range(1, 1001):
        hour = rng.choices(range(24), [1,1,1,1,1,2,3,5,7,7,6,5,5,5,5,5,6,8,9,9,7,5,3,2])[0]
        day = rng.randint(0, 365)
        occurred = NOW - timedelta(days=day, hours=hour, minutes=rng.randint(0, 59))
        occurrences.append((i, rng.randint(1, 350), rng.randint(1, 4), rng.choice(list(equipment_type)), rng.choice(["trânsito", "falha de equipamento", "estacionamento", "segurança", "obstrução"]), rng.choices(["baixa", "media", "alta", "critica"], [35, 40, 20, 5])[0], rng.choice(["aberta", "em_atendimento", "resolvida", "cancelada"]), "Evento fictício para demonstração e análise.", occurred))
    add("ocorrencias", ["id_ocorrencia", "id_localizacao", "id_orgao", "id_equipamento", "tipo", "gravidade", "status", "descricao", "ocorrida_em"], occurrences)
    alerts = []
    for i in range(1, 251):
        targets = [None, None, None, None]
        target = rng.randrange(4)
        targets[target] = [rng.randint(1, 500), rng.randint(1, 100), rng.randint(1, 1000), rng.randint(1, 10)][target]
        created = NOW - timedelta(days=rng.randint(0, 180), hours=rng.randint(0, 23))
        resolved = created + timedelta(hours=rng.randint(1, 72)) if rng.random() < .65 else None
        alerts.append((i, *targets, rng.choice(["manutenção", "ocorrência", "risco regional", "agente"]), rng.choice(["baixa", "media", "alta", "critica"]), "Alerta sintético de demonstração.", created, resolved))
    add("alertas", ["id_alerta", "id_equipamento", "id_agente", "id_ocorrencia", "id_regiao", "categoria", "severidade", "mensagem", "criado_em", "resolvido_em"], alerts)
    forecasts = []
    for i in range(1, 11):
        risk = round(rng.uniform(5, 95), 2)
        level = "baixo" if risk < 25 else "medio" if risk < 50 else "alto" if risk < 75 else "critico"
        forecasts.append((i, i, NOW, NOW + timedelta(hours=24), risk, level, "padrão sintético horário/regional", NOW))
    add("previsoes_risco", ["id_previsao", "id_regiao", "janela_inicio", "janela_fim", "indice_risco", "nivel_risco", "metodo", "gerada_em"], forecasts)
    sql.append("COMMIT;\n")
    out.write_text("\n".join(sql), encoding="utf-8")
    summary = {**counts, "equipamentos_moveis": sum(equipment_type[i] in mobile_ids for i in equipment_type), "posicoes_min_por_viagem": min_positions_per_trip, "seed": seed}
    LOG.info("Wrote %s", out)
    for key, value in summary.items():
        LOG.info("%s: %s", key, value)
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=20261020)
    parser.add_argument("--out", type=Path, default=HERE / "seed.sql")
    parser.add_argument("--graph", type=Path, default=HERE / "marilia.graphml")
    parser.add_argument("--without-routes", action="store_true", help="Create other data only; still requires OSM for actual geolocations")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    generate(args.seed, args.out, args.graph, args.without_routes)


if __name__ == "__main__":
    main()
