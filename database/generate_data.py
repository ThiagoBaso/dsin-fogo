"""Generate a reproducible, OSM-based SQL demo dataset for the F.O.G.O. schema."""
from __future__ import annotations

import argparse
import logging
import math
import random
from datetime import datetime, timedelta
from pathlib import Path

from generate_routes import load_graph, route_between_points, route_points

HERE = Path(__file__).resolve().parent
LOG = logging.getLogger("fogo.generate")
NOW = datetime.now().replace(microsecond=0)


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


def migration_sql(active_trips, active_positions):
    parts = ["""-- Idempotent upgrade for persistent demo volumes, generated from the active-trip seed rows.
DROP PROCEDURE IF EXISTS migrate_active_trip_schema;
DELIMITER //
CREATE PROCEDURE migrate_active_trip_schema()
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'viagens' AND constraint_name = 'chk_viagem_periodo') THEN
    ALTER TABLE viagens DROP CHECK chk_viagem_periodo;
  END IF;
  ALTER TABLE viagens MODIFY COLUMN fim_em DATETIME NULL, MODIFY COLUMN situacao ENUM('em_andamento','concluida','interrompida') NOT NULL DEFAULT 'concluida';
  ALTER TABLE viagens ADD CONSTRAINT chk_viagem_periodo CHECK ((situacao = 'em_andamento' AND fim_em IS NULL) OR (situacao <> 'em_andamento' AND fim_em IS NOT NULL AND fim_em > inicio_em));
  IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'viagens' AND index_name = 'ix_viagem_equip_situacao_inicio') THEN
    ALTER TABLE viagens ADD KEY ix_viagem_equip_situacao_inicio (id_equipamento, situacao, inicio_em);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'posicoes_equipamento' AND index_name = 'uq_pos_viagem_tempo') THEN
    ALTER TABLE posicoes_equipamento ADD UNIQUE KEY uq_pos_viagem_tempo (id_viagem, registrado_em);
  END IF;
END//
DELIMITER ;
CALL migrate_active_trip_schema();
DROP PROCEDURE migrate_active_trip_schema;
START TRANSACTION;
""",
        insert("viagens", ["id_viagem", "id_equipamento", "inicio_em", "fim_em", "distancia_m", "situacao"], active_trips)
        .replace("INSERT INTO `viagens`", "INSERT IGNORE INTO `viagens`"),
        """CREATE TEMPORARY TABLE migration_active_positions (
  id_viagem INT UNSIGNED NOT NULL,
  id_equipamento INT UNSIGNED NOT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  velocidade_kmh DECIMAL(6,2),
  registrado_em DATETIME NOT NULL
) ENGINE=InnoDB;
""",
        insert("migration_active_positions", ["id_viagem", "id_equipamento", "latitude", "longitude", "velocidade_kmh", "registrado_em"], active_positions)
        .replace("INSERT INTO `migration_active_positions`", "INSERT INTO migration_active_positions"),
        """INSERT IGNORE INTO posicoes_equipamento (id_equipamento, id_viagem, latitude, longitude, velocidade_kmh, registrado_em)
SELECT src.id_equipamento, src.id_viagem, src.latitude, src.longitude, src.velocidade_kmh, src.registrado_em
FROM migration_active_positions src
;
COMMIT;
"""]
    return "\n".join(parts)


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
        locations.append((i + 1, i % 40 + 1, f"00000{i + 1:03d}", "Marília", "SP", f"Rua Demonstrativa {i + 1:03d}",
                          f"Referência sintética {i + 1:03d}; coordenada de via OSM", round(lat, 7), round(lon, 7)))
    add("localizacoes", ["id_localizacao", "id_bairro", "cep", "cidade", "uf", "logradouro", "referencia", "latitude", "longitude"], locations)
    # Route helpers use OSM order (longitude, latitude); SQL stores (latitude, longitude).
    location_coords = {row[0]: (row[8], row[7]) for row in locations}

    types = [
        ("Radar fixo", "fixo", "radar"), ("Radar móvel", "movel", "radar"), ("Câmera de monitoramento", "fixo", "camera"),
        ("Cancela automatizada", "fixo", "cancela"), ("Totem de estacionamento", "fixo", "parking"), ("Balança de caminhões", "fixo", "scale"),
        ("Patinete elétrico", "movel", "scooter"), ("Motocicleta", "movel", "motorcycle"), ("Viatura policial", "movel", "police"),
        ("Veículo da Guarda Municipal", "movel", "municipal"), ("Veículo de fiscalização", "movel", "car"),
        ("Táxi", "movel", "car"), ("Mototáxi", "movel", "motorcycle"), ("Transporte escolar", "movel", "car"),
        ("Veículo autônomo de fiscalização de estacionamento", "movel", "car"),
    ]
    add("tipos_equipamento", ["id_tipo", "nome", "mobilidade", "icone_mapa"], [(i + 1, *t) for i, t in enumerate(types)])
    states = [(1, "operacional", True), (2, "indispon\u00edvel", False), (3, "desativado", False), (4, "furtado", False), (5, "em manuten\u00e7\u00e3o", False), (6, "ainda n\u00e3o instalado", False), (7, "mau funcionamento", False)]
    add("situacoes_equipamento", ["id_situacao", "nome", "disponivel"], states)
    mobile_ids = [2, 7, 8, 9, 10, 11, 12, 13, 14, 15]
    equipment_rows = []
    type_order = [2, 7, 8, 9, 10, 11] * 10  # 60 original mobile units
    fixed_types = [1, 3, 4, 5, 6]
    type_order += [rng.choice(fixed_types) for _ in range(440)]
    rng.shuffle(type_order)
    # Add eight complete mobile units for each newly represented service.
    type_order += [new_type for new_type in (12, 13, 14, 15) for _ in range(8)]
    fixed_asset_ids = [equipment_id for equipment_id, type_id in enumerate(type_order, 1) if type_id in fixed_types]
    not_installed_ids = set(fixed_asset_ids[:8])
    malfunction_ids = set(fixed_asset_ids[8:16])
    equipment_type = {}
    for i, type_id in enumerate(type_order, 1):
        equipment_type[i] = type_id
        state = rng.choices([1, 2, 3, 4, 5], [78, 8, 4, 2, 8])[0]
        if i in not_installed_ids:
            state = 6
        elif i in malfunction_ids:
            state = 7
        org_id = rng.choices([1, 2, 3, 4], [35, 25, 20, 20])[0]
        location_id = rng.randint(1, 350)
        if i >= 501:
            location_id = i - 500
        equipment_rows.append((i, type_id, org_id, location_id, state, f"DEMO-{i:05d}",
                               ["Intelbras", "Dahua", "Pumatronix", "Siemens", "DemoTech"][i % 5],
                               f"Modelo-{(i % 17) + 1:02d}", NOW - timedelta(days=rng.randint(30, 1300)),
                               NOW - timedelta(days=rng.randint(1, 1000)) if type_id not in mobile_ids and state != 6 else None))
    add("equipamentos", ["id_equipamento", "id_tipo", "id_orgao", "id_localizacao", "id_situacao", "numero_serie", "marca", "modelo", "cadastrado_em", "instalado_em"], equipment_rows)

    attr_defs = [(1, "limite_velocidade", "numero", "km/h"), (1, "modalidade", "texto", None),
                 (2, "limite_velocidade", "numero", "km/h"), (2, "modalidade", "texto", None),
                 (3, "resolucao", "texto", None), (3, "visao_noturna", "booleano", None),
                 (4, "largura_m", "numero", "m"), (5, "vagas_monitoradas", "numero", "vagas"),
                 (6, "capacidade_ton", "numero", "t"), (7, "autonomia_km", "numero", "km"),
                 (8, "cilindrada_cc", "numero", "cc"), (9, "tracao", "texto", None),
                 (10, "tracao", "texto", None), (11, "tracao", "texto", None),
                 (12, "categoria_servico", "texto", None), (12, "capacidade_passageiros", "numero", "pessoas"),
                 (13, "cilindrada_cc", "numero", "cc"), (13, "capacete_disponivel", "booleano", None),
                 (14, "capacidade_alunos", "numero", "pessoas"), (14, "acessibilidade", "booleano", None),
                 (15, "leitura_placas", "booleano", None), (15, "autonomia_km", "numero", "km")]
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
            elif name == "modalidade":
                modalidade = rng.choice(["velocidade", "avanço de sinal", "faixa exclusiva"])
                primeiro_radar = next(i for i, tipo in equipment_type.items() if tipo in (1, 2))
                value = ("retorno proibido" if equip_id == primeiro_radar else modalidade, None, None)
            elif name == "categoria_servico": value = (rng.choice(["convencional", "executivo", "acessÃ­vel"]), None, None)
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
    active_trip_count = 0
    if not without_routes:
        mobile_equipment = [i for i, tid in equipment_type.items() if tid in mobile_ids]
        trip_id, pos_id = 0, 0
        latest_positions = {}
        outside_base_count = 0
        for equip_id in mobile_equipment:
            vehicle_start = NOW - timedelta(days=rng.randint(35, 180))
            for trip_index in range(3):
                trip_id += 1
                points, distance = route_points(graph, 120, rng, max_spacing_m=200.0)
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
                latest_positions[equip_id] = points[-1]
        expected_completed_trips = len(mobile_equipment) * 3
        if len(trip_rows) != expected_completed_trips or len(positions) < expected_completed_trips * 120:
            raise AssertionError("Trip/position minimums were not met")

        equipment_by_id = {row[0]: row for row in equipment_rows}
        for equip_id in mobile_equipment:
            equipment = equipment_by_id[equip_id]
            origin = location_coords[equipment[3]]
            destination = latest_positions[equip_id]
            if haversine_m(origin, destination) <= 100:
                continue
            outside_base_count += 1

            points, distance = route_between_points(graph, origin, destination, 120, max_spacing_m=25.0)
            speed = rng.uniform(18, 42)
            duration_seconds = math.ceil(max(600, distance / (speed / 3.6), (len(points) - 1) * 2))
            start = NOW - timedelta(seconds=duration_seconds)
            trip_id += 1
            trip_rows.append((trip_id, equip_id, start, None, round(distance, 2), "em_andamento"))
            for ix, (lon, lat) in enumerate(points):
                pos_id += 1
                at = start + timedelta(seconds=(duration_seconds * ix) // (len(points) - 1))
                positions.append((pos_id, equip_id, trip_id, round(lat, 7), round(lon, 7), round(speed * rng.uniform(.75, 1.2), 2), at))
            active_trip_count += 1
        if active_trip_count != outside_base_count:
            raise AssertionError(f"Expected one active base-to-GPS trip for every vehicle outside its base; got {active_trip_count}/{outside_base_count}")
    add("viagens", ["id_viagem", "id_equipamento", "inicio_em", "fim_em", "distancia_m", "situacao"], trip_rows)
    add("posicoes_equipamento", ["id_posicao", "id_equipamento", "id_viagem", "latitude", "longitude", "velocidade_kmh", "registrado_em"], positions)

    occurrences = []
    equipment_by_id = {row[0]: row for row in equipment_rows}
    priority_equipment_ids = [i for i, tid in equipment_type.items() if tid in (12, 13, 14, 15)]
    for equip_id in priority_equipment_ids:
        equipment = equipment_by_id[equip_id]
        for _ in range(3):
            occurrence_id = len(occurrences) + 1
            occurred = NOW - timedelta(days=rng.randint(1, 365), hours=rng.randint(0, 23), minutes=rng.randint(0, 59))
            occurrences.append((occurrence_id, equipment[3], equipment[2], equip_id,
                                rng.choice(["tr\u00e2nsito", "falha de equipamento", "estacionamento", "seguran\u00e7a", "obstru\u00e7\u00e3o"]),
                                rng.choices(["baixa", "media", "alta", "critica"], [35, 40, 20, 5])[0],
                                rng.choice(["aberta", "em_atendimento", "resolvida", "cancelada"]),
                                "Evento fict\u00edcio vinculado ao equipamento para demonstra\u00e7\u00e3o.", occurred))
    for _ in range(1000 - len(occurrences)):
        occurrence_id = len(occurrences) + 1
        hour = rng.choices(range(24), [1,1,1,1,1,2,3,5,7,7,6,5,5,5,5,5,6,8,9,9,7,5,3,2])[0]
        day = rng.randint(0, 365)
        occurred = NOW - timedelta(days=day, hours=hour, minutes=rng.randint(0, 59))
        equip_id = rng.choice(list(equipment_type))
        occurrences.append((occurrence_id, rng.randint(1, 350), rng.randint(1, 4), equip_id,
                            rng.choice(["tr\u00e2nsito", "falha de equipamento", "estacionamento", "seguran\u00e7a", "obstru\u00e7\u00e3o"]),
                            rng.choices(["baixa", "media", "alta", "critica"], [35, 40, 20, 5])[0],
                            rng.choice(["aberta", "em_atendimento", "resolvida", "cancelada"]),
                            "Evento fict\u00edcio para demonstra\u00e7\u00e3o e an\u00e1lise.", occurred))
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
    temp_out = out.with_suffix(out.suffix + ".tmp")
    temp_out.write_text("\n".join(sql), encoding="utf-8")
    temp_out.replace(out)
    active_trip_rows = [row for row in trip_rows if row[5] == "em_andamento"]
    active_trip_ids = {row[0] for row in active_trip_rows}
    active_position_rows = [
        (row[2], row[1], row[3], row[4], row[5], row[6])
        for row in positions if row[2] in active_trip_ids
    ]
    migration_path = out.with_name("migrate_active_trips.sql")
    migration_temp = migration_path.with_suffix(migration_path.suffix + ".tmp")
    migration_temp.write_text(migration_sql(active_trip_rows, active_position_rows), encoding="utf-8")
    migration_temp.replace(migration_path)
    summary = {**counts, "equipamentos_moveis": sum(equipment_type[i] in mobile_ids for i in equipment_type), "viagens_em_andamento": active_trip_count, "posicoes_min_por_viagem": min_positions_per_trip, "seed": seed}
    LOG.info("Wrote %s", out)
    for key, value in summary.items():
        LOG.info("%s: %s", key, value)
    return summary


def haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    lon1, lat1, lon2, lat2 = map(math.radians, (*a, *b))
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * 6_371_000 * math.asin(math.sqrt(h))


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
