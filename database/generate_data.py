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
OCCURRENCE_TOTAL = 10_000
OCCURRENCE_ACTIVE_TOTAL = 500
OCCURRENCE_HISTORY_START = datetime(2024, 1, 1)
DEMO_MAP_CENTER = (-49.950, -22.217)  # same center as generate_neighborhood_boundaries.py
DEMO_MAP_HALF_SPAN = 0.07
OCCURRENCE_HOTSPOT_RADIUS_M = 2_500
OCCURRENCE_RESOLUTION_SECTOR_FACTORS = (0.62, 1.55, 0.78, 1.72, 0.92, 1.28, 0.70)
OCCURRENCE_RESOLUTION_BASE_MINUTES = {
    "tr\u00e2nsito": 100,
    "falha de equipamento": 360,
    "estacionamento": 60,
    "seguran\u00e7a": 160,
    "obstru\u00e7\u00e3o": 180,
}
OCCURRENCE_RESOLUTION_SEVERITY_FACTORS = {
    "baixa": 0.92,
    "media": 1.0,
    "alta": 1.12,
    "critica": 1.22,
}


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


def occurrence_hotspots(locations):
    """Choose reproducible road locations and uneven synthetic risk profiles."""
    coords = {row[0]: (row[8], row[7]) for row in locations}
    map_location_ids = [
        location_id for location_id, (lon, lat) in coords.items()
        if abs(lon - DEMO_MAP_CENTER[0]) <= DEMO_MAP_HALF_SPAN
        and abs(lat - DEMO_MAP_CENTER[1]) <= DEMO_MAP_HALF_SPAN
    ]
    if not map_location_ids:
        map_location_ids = list(coords)
    unique_locations = list(dict.fromkeys(
        (round(coords[location_id][0], 6), round(coords[location_id][1], 6), location_id)
        for location_id in map_location_ids
    ))
    if not unique_locations:
        raise RuntimeError("No locations available for occurrence generation")

    center = (
        sum(lon for lon, _lat, _location_id in unique_locations) / len(unique_locations),
        sum(lat for _lon, lat, _location_id in unique_locations) / len(unique_locations),
    )
    dense_centers = [
        row for row in unique_locations
        if sum(
            haversine_m((row[0], row[1]), coords[location_id]) <= OCCURRENCE_HOTSPOT_RADIUS_M
            for location_id in map_location_ids
        ) >= 20
    ]
    if len({(row[0], row[1]) for row in dense_centers}) < 7:
        dense_centers = unique_locations
    first = min(dense_centers, key=lambda row: haversine_m(center, (row[0], row[1])))
    selected = [first]
    selected_coordinates = {(first[0], first[1])}
    while len(selected) < 7:
        candidate = max(
            (row for row in dense_centers if (row[0], row[1]) not in selected_coordinates),
            key=lambda row: min(haversine_m((row[0], row[1]), (hotspot[0], hotspot[1])) for hotspot in selected),
            default=None,
        )
        if candidate is None:
            break
        selected.append(candidate)
        selected_coordinates.add((candidate[0], candidate[1]))

    # Shares control how many events enter each hotspot; profiles make nearby
    # areas differ in severity and occurrence type instead of looking uniform.
    profiles = [
        {"share": 0.25, "severity": [20, 38, 30, 12], "types": [40, 15, 25, 8, 12]},
        {"share": 0.20, "severity": [6, 19, 43, 32], "types": [20, 14, 8, 36, 22]},
        {"share": 0.17, "severity": [47, 34, 16, 3], "types": [35, 18, 22, 9, 16]},
        {"share": 0.14, "severity": [14, 35, 37, 14], "types": [28, 18, 18, 18, 18]},
        {"share": 0.10, "severity": [56, 31, 11, 2], "types": [38, 18, 21, 8, 15]},
        {"share": 0.08, "severity": [28, 43, 24, 5], "types": [31, 17, 20, 13, 19]},
        {"share": 0.06, "severity": [40, 43, 15, 2], "types": [34, 20, 19, 11, 16]},
    ][:len(selected)]
    share_total = sum(profile["share"] for profile in profiles)
    for profile in profiles:
        profile["share"] /= share_total

    hotspot_candidates = []
    for lon, lat, _location_id in selected:
        nearby = []
        for location_id in map_location_ids:
            distance = haversine_m((lon, lat), coords[location_id])
            if distance <= OCCURRENCE_HOTSPOT_RADIUS_M:
                nearby.append((location_id, math.exp(-0.5 * (distance / 900) ** 2)))
        if not nearby:
            nearest = min(coords, key=lambda location_id: haversine_m((lon, lat), coords[location_id]))
            nearby = [(nearest, 1.0)]
        hotspot_candidates.append(nearby)

    return coords, map_location_ids, selected, profiles, hotspot_candidates


def random_datetime(rng, start, end):
    span_seconds = max(0, int((end - start).total_seconds()))
    return start + timedelta(seconds=rng.randint(0, span_seconds))


def occurrence_severity_pressure(occurred):
    """Model recurring low/high-risk periods across the synthetic history."""
    elapsed_days = max(0, (occurred - OCCURRENCE_HISTORY_START).total_seconds() / 86400)
    annual_wave = math.sin(2 * math.pi * elapsed_days / 480 - 0.65)
    seasonal_wave = math.sin(2 * math.pi * elapsed_days / 185 + 0.4)
    return 0.72 * annual_wave + 0.28 * seasonal_wave


def adjust_occurrence_severity(seed, occurrence_id, occurred, severity):
    """Shift a portion of events up or down during synthetic risk waves."""
    score = {"baixa": 1, "media": 2, "alta": 3, "critica": 4}[severity]
    pressure = occurrence_severity_pressure(occurred)
    if pressure == 0:
        return severity
    variation_rng = random.Random((seed * 1_000_003) ^ (occurrence_id * 0x9E3779B1))
    shift_probability = min(0.72, abs(pressure) * 0.72)
    if variation_rng.random() < shift_probability:
        score = min(4, score + 1) if pressure > 0 else max(1, score - 1)
    return ("baixa", "media", "alta", "critica")[score - 1]


def occurrence_response_factor(occurred):
    """Add synthetic staffing and workload waves to resolution times."""
    elapsed_days = max(0, (occurred - OCCURRENCE_HISTORY_START).total_seconds() / 86400)
    annual_pressure = math.sin(2 * math.pi * elapsed_days / 510 + 0.5)
    seasonal_pressure = math.sin(2 * math.pi * elapsed_days / 200 - 0.5)
    return math.exp(0.55 * annual_pressure + 0.20 * seasonal_pressure)


def occurrence_resolution_duration_seconds(seed, occurrence_id, location, hotspots,
                                           occurrence_type, severity, occurred):
    """Create reproducible resolution times that vary by area and across periods."""
    sector_index = min(
        range(len(hotspots)),
        key=lambda index: haversine_m(location, (hotspots[index][0], hotspots[index][1])),
    )
    sector_factor = OCCURRENCE_RESOLUTION_SECTOR_FACTORS[
        sector_index % len(OCCURRENCE_RESOLUTION_SECTOR_FACTORS)
    ]
    base_minutes = OCCURRENCE_RESOLUTION_BASE_MINUTES.get(occurrence_type, 180)
    severity_factor = OCCURRENCE_RESOLUTION_SEVERITY_FACTORS.get(severity, 1.0)
    outside_business_hours = occurred.weekday() >= 5 or occurred.hour < 7 or occurred.hour >= 19
    schedule_factor = 1.12 if outside_business_hours else 1.0
    duration_rng = random.Random((seed * 1_000_003) ^ (occurrence_id * 0x9E3779B1))
    variation = duration_rng.lognormvariate(0, 0.42)
    temporal_factor = occurrence_response_factor(occurred)
    duration_seconds = round(
        base_minutes * severity_factor * sector_factor * schedule_factor
        * temporal_factor * variation * 60
    )
    return min(max(duration_seconds, 60), 14 * 24 * 60 * 60)


def occurrence_resolution_datetime(seed, occurrence_id, location, hotspots,
                                   occurrence_type, severity, occurred, status, now=NOW):
    """Create a reproducible resolution timestamp for resolved demo incidents only."""
    if status != "resolvida":
        return None

    duration_seconds = occurrence_resolution_duration_seconds(
        seed, occurrence_id, location, hotspots, occurrence_type, severity, occurred,
    )
    available_seconds = int((now - occurred).total_seconds())
    if available_seconds <= 0:
        return None
    return occurred + timedelta(seconds=min(duration_seconds, available_seconds))


def occurrence_migration_sql(occurrences):
    """Append missing historical occurrence IDs to databases with a persistent volume."""
    new_rows = [row[:9] for row in occurrences if row[0] > 1_000]
    rows_sql = insert(
        "ocorrencias",
        ["id_ocorrencia", "id_localizacao", "id_orgao", "id_equipamento", "tipo", "gravidade", "status", "descricao", "ocorrida_em"],
        new_rows,
    ).replace("INSERT INTO `ocorrencias`", "INSERT IGNORE INTO `ocorrencias`")
    return (
        "-- Idempotently add the historical demo occurrences missing from persistent volumes.\n"
        "-- New databases already receive these rows from seed.sql.\n"
        "SET time_zone = '-03:00';\n"
        "START TRANSACTION;\n"
        + rows_sql
        + "UPDATE `ocorrencias`\n"
        + "SET `ocorrida_em` = NOW()\n"
        + "WHERE `id_ocorrencia` = 1\n"
        + "  AND `status` IN ('aberta', 'em_atendimento')\n"
        + "  AND `descricao` = 'Evento fictício vinculado ao equipamento para demonstração.';\n"
        + "COMMIT;\n"
    )


def occurrence_resolution_migration_sql(occurrences, location_coords, hotspots, seed):
    """Backfill generated resolution dates on existing demo rows without touching live data."""
    rows = []
    for row in occurrences:
        duration_seconds = occurrence_resolution_duration_seconds(
            seed, row[0], location_coords[row[1]], hotspots, row[4], row[5], row[8],
        )
        rows.append((row[0], row[1], row[2], row[3], row[5], duration_seconds))
    schema_migration = """-- Add simulated resolution dates to generated demo occurrences only.
SET time_zone = '-03:00';
DROP PROCEDURE IF EXISTS migrate_occurrence_resolution_schema;
DELIMITER //
CREATE PROCEDURE migrate_occurrence_resolution_schema()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'ocorrencias' AND column_name = 'resolvida_em'
  ) THEN
    ALTER TABLE ocorrencias ADD COLUMN resolvida_em DATETIME NULL AFTER ocorrida_em;
  END IF;
END//
DELIMITER ;
CALL migrate_occurrence_resolution_schema();
DROP PROCEDURE migrate_occurrence_resolution_schema;
START TRANSACTION;
CREATE TEMPORARY TABLE migration_occurrence_resolution (
  id_ocorrencia INT UNSIGNED NOT NULL PRIMARY KEY,
  id_localizacao INT UNSIGNED NOT NULL,
  id_orgao INT UNSIGNED NOT NULL,
  id_equipamento INT UNSIGNED NULL,
  gravidade ENUM('baixa','media','alta','critica') NOT NULL,
  duracao_segundos INT UNSIGNED NOT NULL
) ENGINE=InnoDB;
"""
    staging_insert = insert(
        "migration_occurrence_resolution",
        ["id_ocorrencia", "id_localizacao", "id_orgao", "id_equipamento",
         "gravidade", "duracao_segundos"],
        rows,
    ).replace("INSERT INTO `migration_occurrence_resolution`", "INSERT INTO migration_occurrence_resolution")
    update = """UPDATE ocorrencias AS occurrence
JOIN migration_occurrence_resolution AS resolution_source
  ON resolution_source.id_ocorrencia = occurrence.id_ocorrencia
SET occurrence.gravidade = resolution_source.gravidade
WHERE occurrence.id_ocorrencia <= 10000
  AND occurrence.descricao LIKE 'Evento fict%';

UPDATE ocorrencias AS occurrence
JOIN migration_occurrence_resolution AS resolution_source
  ON resolution_source.id_ocorrencia = occurrence.id_ocorrencia
SET occurrence.resolvida_em = LEAST(
  TIMESTAMPADD(SECOND, resolution_source.duracao_segundos, occurrence.ocorrida_em), NOW()
)
WHERE occurrence.status = 'resolvida'
  AND occurrence.descricao LIKE 'Evento fict%'
  AND occurrence.ocorrida_em < NOW()
  AND resolution_source.duracao_segundos > 0;
DROP TEMPORARY TABLE migration_occurrence_resolution;
COMMIT;
"""
    return schema_migration + staging_insert + update


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


def equipment_attributes_migration_sql(attribute_definitions, attribute_values):
    """Create an idempotent migration for equipment attributes on existing volumes."""
    parts = ["""-- Idempotent catalog and demo values upgrade for persistent database volumes.
START TRANSACTION;
CREATE TEMPORARY TABLE migration_attribute_definitions (
  id_tipo INT UNSIGNED NOT NULL,
  nome VARCHAR(100) NOT NULL,
  tipo_valor ENUM('texto','numero','booleano') NOT NULL,
  unidade VARCHAR(30),
  obrigatorio BOOLEAN NOT NULL,
  PRIMARY KEY (id_tipo, nome)
) ENGINE=InnoDB;
""",
        insert("migration_attribute_definitions", ["id_tipo", "nome", "tipo_valor", "unidade", "obrigatorio"], attribute_definitions)
        .replace("INSERT INTO `migration_attribute_definitions`", "INSERT INTO migration_attribute_definitions"),
        """INSERT INTO atributos_tipo (id_tipo, nome, tipo_valor, unidade, obrigatorio)
SELECT id_tipo, nome, tipo_valor, unidade, obrigatorio
FROM migration_attribute_definitions
ON DUPLICATE KEY UPDATE tipo_valor=VALUES(tipo_valor), unidade=VALUES(unidade), obrigatorio=VALUES(obrigatorio);

CREATE TEMPORARY TABLE migration_attribute_values (
  id_equipamento INT UNSIGNED NOT NULL,
  id_tipo INT UNSIGNED NOT NULL,
  nome VARCHAR(100) NOT NULL,
  valor_texto VARCHAR(255),
  valor_numero DECIMAL(14,4),
  valor_booleano BOOLEAN,
  PRIMARY KEY (id_equipamento, id_tipo, nome)
) ENGINE=InnoDB;
""",
        insert("migration_attribute_values", ["id_equipamento", "id_tipo", "nome", "valor_texto", "valor_numero", "valor_booleano"], attribute_values)
        .replace("INSERT INTO `migration_attribute_values`", "INSERT INTO migration_attribute_values"),
        """INSERT INTO valores_atributo (id_equipamento, id_atributo, valor_texto, valor_numero, valor_booleano)
SELECT staged.id_equipamento, attribute.id_atributo,
       staged.valor_texto, staged.valor_numero, staged.valor_booleano
FROM migration_attribute_values AS staged
JOIN equipamentos AS equipment
  ON equipment.id_equipamento = staged.id_equipamento
 AND equipment.id_tipo = staged.id_tipo
JOIN atributos_tipo AS attribute
  ON attribute.id_tipo = staged.id_tipo
 AND attribute.nome = staged.nome
ON DUPLICATE KEY UPDATE
  valor_texto=VALUES(valor_texto),
  valor_numero=CASE WHEN EXISTS (
    SELECT 1 FROM atributos_tipo AS existing_attribute
    WHERE existing_attribute.id_atributo = VALUES(id_atributo)
      AND existing_attribute.nome = 'raio_cobertura_km'
  ) THEN valores_atributo.valor_numero ELSE VALUES(valor_numero) END,
  valor_booleano=VALUES(valor_booleano);
COMMIT;
"""]
    return "\n".join(parts)


def generate_equipment_coverage(equipment_type, seed):
    """Generate equipment coverage radii and migrations for prior vehicle values, in kilometres."""
    previous_ranges = {
        1: (0.12, 0.28), 2: (0.10, 0.24), 3: (0.08, 0.22),
        4: (0.01, 0.04), 5: (0.10, 0.35), 6: (0.03, 0.12),
        7: (1.00, 2.50), 8: (1.50, 3.50), 9: (3.00, 7.00),
        10: (2.00, 5.00), 11: (2.00, 5.00), 12: (2.00, 7.00),
        13: (1.50, 4.50), 14: (3.00, 8.00), 15: (1.50, 4.00),
    }
    current_ranges = {
        **{type_id: previous_ranges[type_id] for type_id in range(1, 7)},
        7: (0.10, 0.20), 8: (0.10, 0.20), 9: (0.20, 0.30),
        10: (0.20, 0.30), 11: (0.15, 0.25), 12: (0.10, 0.20),
        13: (0.10, 0.20), 14: (0.20, 0.30), 15: (0.10, 0.20),
    }
    current_rng = random.Random(seed ^ 0xC0A3)
    previous_rng = random.Random(seed ^ 0xC0A3)
    coverage_by_equipment = {}
    migration_rows = []
    for equipment_id, type_id in equipment_type.items():
        current_radius = round(current_rng.uniform(*current_ranges[type_id]), 2)
        previous_radius = round(previous_rng.uniform(*previous_ranges[type_id]), 2)
        coverage_by_equipment[equipment_id] = current_radius
        if type_id >= 7:
            migration_rows.append((equipment_id, type_id, previous_radius, current_radius))
    return coverage_by_equipment, migration_rows


def equipment_coverage_migration_sql(coverage_rows):
    """Reduce generated mobile equipment coverage while preserving customized radii."""
    return """-- Reduce generated mobile equipment coverage to 100-300 m; keep custom values.
START TRANSACTION;
CREATE TEMPORARY TABLE migration_vehicle_coverage (
  id_equipamento INT UNSIGNED NOT NULL PRIMARY KEY,
  id_tipo INT UNSIGNED NOT NULL,
  raio_anterior_km DECIMAL(14,2) NOT NULL,
  raio_novo_km DECIMAL(14,2) NOT NULL
) ENGINE=InnoDB;
""" + insert(
        "migration_vehicle_coverage",
        ["id_equipamento", "id_tipo", "raio_anterior_km", "raio_novo_km"],
        coverage_rows,
    ).replace("INSERT INTO `migration_vehicle_coverage`", "INSERT INTO migration_vehicle_coverage") + """
UPDATE valores_atributo AS coverage
JOIN migration_vehicle_coverage AS staged ON staged.id_equipamento = coverage.id_equipamento
JOIN equipamentos AS equipment
  ON equipment.id_equipamento = staged.id_equipamento AND equipment.id_tipo = staged.id_tipo
JOIN atributos_tipo AS attribute
  ON attribute.id_tipo = equipment.id_tipo AND attribute.nome = 'raio_cobertura_km'
SET coverage.valor_numero = staged.raio_novo_km
WHERE equipment.numero_serie = CONCAT('DEMO-', LPAD(staged.id_equipamento, 5, '0'))
  AND coverage.id_atributo = attribute.id_atributo
  AND coverage.valor_numero = staged.raio_anterior_km;
DROP TEMPORARY TABLE migration_vehicle_coverage;
COMMIT;
"""


def agent_vehicle_migration_sql(assignments):
    """Link demo shifts to vehicles and add the relationship on persistent volumes."""
    parts = ["""-- Add vehicle assignments to active demo agent shifts without replacing closed shift history.
DROP PROCEDURE IF EXISTS migrate_agent_vehicle_shifts;
DELIMITER //
CREATE PROCEDURE migrate_agent_vehicle_shifts()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'turnos_agente' AND column_name = 'id_equipamento'
  ) THEN
    ALTER TABLE turnos_agente ADD COLUMN id_equipamento INT UNSIGNED NULL AFTER id_agente;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'turnos_agente' AND index_name = 'ix_turno_equipamento_status_inicio'
  ) THEN
    ALTER TABLE turnos_agente ADD KEY ix_turno_equipamento_status_inicio (id_equipamento, status, inicio_previsto);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = DATABASE() AND table_name = 'turnos_agente' AND constraint_name = 'fk_turno_equipamento'
  ) THEN
    ALTER TABLE turnos_agente ADD CONSTRAINT fk_turno_equipamento
      FOREIGN KEY (id_equipamento) REFERENCES equipamentos(id_equipamento);
  END IF;
END//
DELIMITER ;
CALL migrate_agent_vehicle_shifts();
DROP PROCEDURE migrate_agent_vehicle_shifts;

CREATE TEMPORARY TABLE migration_agent_vehicle_assignments (
  id_agente INT UNSIGNED NOT NULL PRIMARY KEY,
  id_equipamento INT UNSIGNED NOT NULL,
  id_regiao INT UNSIGNED NOT NULL,
  status ENUM('programado','em_atividade') NOT NULL
) ENGINE=InnoDB;
""",
        insert("migration_agent_vehicle_assignments", ["id_agente", "id_equipamento", "id_regiao", "status"], assignments)
        .replace("INSERT INTO `migration_agent_vehicle_assignments`", "INSERT INTO migration_agent_vehicle_assignments"),
        """UPDATE turnos_agente AS turno
JOIN migration_agent_vehicle_assignments AS assignment ON assignment.id_agente = turno.id_agente
SET turno.id_equipamento = assignment.id_equipamento
WHERE turno.status <> 'encerrado' AND turno.id_equipamento IS NULL;

INSERT INTO turnos_agente
  (id_agente, id_equipamento, id_regiao, inicio_previsto, fim_previsto, inicio_real, fim_real, status)
SELECT agent.id_agente, assignment.id_equipamento, assignment.id_regiao,
       CASE WHEN assignment.status = 'em_atividade' THEN CURRENT_TIMESTAMP - INTERVAL 2 HOUR
            ELSE CURRENT_TIMESTAMP + INTERVAL 1 DAY END,
       CASE WHEN assignment.status = 'em_atividade' THEN CURRENT_TIMESTAMP + INTERVAL 6 HOUR
            ELSE CURRENT_TIMESTAMP + INTERVAL 1 DAY + INTERVAL 8 HOUR END,
       CASE WHEN assignment.status = 'em_atividade' THEN CURRENT_TIMESTAMP - INTERVAL 2 HOUR ELSE NULL END,
       NULL,
       assignment.status
FROM migration_agent_vehicle_assignments AS assignment
JOIN agentes AS agent ON agent.id_agente = assignment.id_agente
WHERE agent.ativo_cadastro = 1
  AND agent.matricula LIKE 'DEMO-AG-%'
  AND NOT EXISTS (
    SELECT 1 FROM turnos_agente AS current_shift
    WHERE current_shift.id_agente = agent.id_agente AND current_shift.status <> 'encerrado'
  );

DROP TEMPORARY TABLE migration_agent_vehicle_assignments;

DROP PROCEDURE IF EXISTS add_agent_shift_vehicle_check;
DELIMITER //
CREATE PROCEDURE add_agent_shift_vehicle_check()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = DATABASE() AND table_name = 'turnos_agente' AND constraint_name = 'chk_turno_veiculo'
  ) THEN
    ALTER TABLE turnos_agente ADD CONSTRAINT chk_turno_veiculo
      CHECK (status = 'encerrado' OR id_equipamento IS NOT NULL);
  END IF;
END//
DELIMITER ;
CALL add_agent_shift_vehicle_check();
DROP PROCEDURE add_agent_shift_vehicle_check;
"""]
    return "\n".join(parts)


def generate_agent_coverage(agents, seed, agents_with_vehicles=()):
    """Generate separate current and previous radii for vehicle and base agents, in kilometres."""
    current_rng = random.Random(seed ^ 0xA63E)
    previous_rng = random.Random(seed ^ 0xA63E)
    previous_local_rng = random.Random(seed ^ 0xA63E)
    base_ranges_km = {1: (0.02, 0.04), 2: (0.03, 0.05), 3: (0.04, 0.06), 4: (0.02, 0.03)}
    vehicle_ranges_km = {1: (0.10, 0.16), 2: (0.12, 0.22), 3: (0.20, 0.30), 4: (0.10, 0.18)}
    previous_ranges_km = {1: (2.00, 5.00), 2: (2.50, 6.00), 3: (4.00, 10.00), 4: (1.50, 4.00)}
    vehicle_agents = set(agents_with_vehicles)
    rows = []
    for agent in agents:
        organization_id = agent[1]
        is_vehicle_agent = agent[0] in vehicle_agents
        current_ranges = vehicle_ranges_km if is_vehicle_agent else base_ranges_km
        rows.append((agent[0], round(current_rng.uniform(*current_ranges[organization_id]), 2),
                     round(previous_rng.uniform(*previous_ranges_km[organization_id]), 2),
                     round(previous_local_rng.uniform(*base_ranges_km[organization_id]), 2)))
    return rows


def agent_coverage_migration_sql(agent_coverage):
    """Apply local base and vehicle radii on persistent database volumes."""
    parts = ["""-- Set demo radii (20-60 m at bases, 100-300 m in vehicles), preserving custom values.
DROP PROCEDURE IF EXISTS migrate_agent_coverage;
DELIMITER //
CREATE PROCEDURE migrate_agent_coverage()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'agentes' AND column_name = 'raio_atuacao_km'
  ) THEN
    ALTER TABLE agentes ADD COLUMN raio_atuacao_km DECIMAL(5,2) NULL AFTER ativo_cadastro;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = DATABASE() AND table_name = 'agentes' AND constraint_name = 'chk_agente_raio_atuacao'
  ) THEN
    ALTER TABLE agentes DROP CHECK chk_agente_raio_atuacao;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = DATABASE() AND table_name = 'agentes' AND constraint_name = 'chk_agente_raio_atuacao_metros'
  ) THEN
    ALTER TABLE agentes ADD CONSTRAINT chk_agente_raio_atuacao_metros
      CHECK (raio_atuacao_km IS NULL OR raio_atuacao_km BETWEEN 0.01 AND 25.00);
  END IF;
END//
DELIMITER ;
CALL migrate_agent_coverage();
DROP PROCEDURE migrate_agent_coverage;

CREATE TEMPORARY TABLE migration_agent_coverage (
  id_agente INT UNSIGNED NOT NULL PRIMARY KEY,
  raio_atuacao_km DECIMAL(5,2) NOT NULL,
  raio_anterior_km DECIMAL(5,2) NOT NULL,
  raio_base_anterior_km DECIMAL(5,2) NOT NULL
) ENGINE=InnoDB;
""",
        insert("migration_agent_coverage", ["id_agente", "raio_atuacao_km", "raio_anterior_km", "raio_base_anterior_km"], agent_coverage)
        .replace("INSERT INTO `migration_agent_coverage`", "INSERT INTO migration_agent_coverage"),
        """UPDATE agentes AS agent
JOIN migration_agent_coverage AS coverage ON coverage.id_agente = agent.id_agente
SET agent.raio_atuacao_km = CASE WHEN EXISTS (
  SELECT 1 FROM turnos_agente AS turno
  WHERE turno.id_agente = agent.id_agente AND turno.id_equipamento IS NOT NULL
    AND turno.status IN ('em_atividade', 'programado')
) THEN coverage.raio_atuacao_km ELSE coverage.raio_base_anterior_km END
WHERE (agent.raio_atuacao_km IS NULL
       OR agent.raio_atuacao_km = coverage.raio_anterior_km
       OR agent.raio_atuacao_km = coverage.raio_base_anterior_km)
  AND agent.matricula = CONCAT('DEMO-AG-', LPAD(coverage.id_agente, 4, '0'));

DROP TEMPORARY TABLE migration_agent_coverage;
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

    attr_defs = [
        # Keep the original definitions first so IDs stay stable in fresh databases.
        (1, "limite_velocidade", "numero", "km/h", False), (1, "modalidade", "texto", None, True),
        (2, "limite_velocidade", "numero", "km/h", False), (2, "modalidade", "texto", None, True),
        (3, "resolucao", "texto", None, True), (3, "visao_noturna", "booleano", None, True),
        (4, "largura_m", "numero", "m", True), (5, "vagas_monitoradas", "numero", "vagas", True),
        (6, "capacidade_ton", "numero", "t", True), (7, "autonomia_km", "numero", "km", True),
        (8, "cilindrada_cc", "numero", "cc", True), (9, "tracao", "texto", None, True),
        (10, "tracao", "texto", None, True), (11, "tracao", "texto", None, True),
        (12, "categoria_servico", "texto", None, True), (12, "capacidade_passageiros", "numero", "pessoas", True),
        (13, "cilindrada_cc", "numero", "cc", True), (13, "capacete_disponivel", "booleano", None, True),
        (14, "capacidade_alunos", "numero", "pessoas", True), (14, "acessibilidade", "booleano", None, True),
        (15, "leitura_placas", "booleano", None, True), (15, "autonomia_km", "numero", "km", True),
        (1, "faixas_fiscalizadas", "numero", "faixas", True), (2, "faixas_fiscalizadas", "numero", "faixas", True),
        (3, "tipo_imagem", "texto", None, True), (3, "ptz", "booleano", None, True),
        (4, "altura_m", "numero", "m", True), (4, "controle_acesso", "texto", None, True),
        (4, "duplo_sentido", "booleano", None, True),
        (5, "aceita_pix", "booleano", None, True), (5, "aceita_cartao", "booleano", None, True),
        (5, "aceita_dinheiro", "booleano", None, True), (5, "acessibilidade", "booleano", None, True),
        (6, "eixos_maximo", "numero", "eixos", True), (6, "precisao_kg", "numero", "kg", True),
        (7, "velocidade_max_kmh", "numero", "km/h", True), (7, "tipo_propulsao", "texto", None, True),
        (7, "bloqueio_area_restrita", "booleano", None, True),
        (8, "tipo_propulsao", "texto", None, True),
        (9, "tipo_propulsao", "texto", None, True), (9, "radio_operacional", "booleano", None, True),
        (9, "sirene_giroflex", "booleano", None, True),
        (10, "tipo_propulsao", "texto", None, True), (10, "radio_operacional", "booleano", None, True),
        (10, "sirene_giroflex", "booleano", None, True),
        (11, "tipo_propulsao", "texto", None, True), (11, "radio_operacional", "booleano", None, True),
        (11, "camera_embarcada", "booleano", None, True),
        (12, "tipo_propulsao", "texto", None, True), (12, "acessibilidade", "booleano", None, True),
        (12, "tracao", "texto", None, True),
        (13, "tipo_propulsao", "texto", None, True), (13, "capacete_passageiro", "booleano", None, True),
        (14, "tipo_propulsao", "texto", None, True), (14, "cintos_seguranca", "booleano", None, True),
        (14, "acompanhante", "booleano", None, True), (14, "tracao", "texto", None, True),
        (15, "quantidade_cameras", "numero", "unidades", True), (15, "resolucao", "texto", None, True),
        (15, "visao_noturna", "booleano", None, True), (15, "tipo_propulsao", "texto", None, True),
        (15, "tracao", "texto", None, True), (15, "radio_operacional", "booleano", None, True),
        *[(type_id, "raio_cobertura_km", "numero", "km", True) for type_id in range(1, 16)],
    ]
    add("atributos_tipo", ["id_atributo", "id_tipo", "nome", "tipo_valor", "unidade", "obrigatorio"],
        [(i + 1, *a) for i, a in enumerate(attr_defs)])
    attr_by_type = {}
    for i, a in enumerate(attr_defs, 1):
        attr_by_type.setdefault(a[0], []).append(i)
    values = []
    equipment_coverage_by_id, vehicle_coverage_migration = generate_equipment_coverage(equipment_type, seed)
    modalities = ["velocidade", "avan\u00e7o de sinal", "faixa exclusiva", "convers\u00e3o proibida", "retorno proibido"]
    radar_modality = {}
    for radar_type in (1, 2):
        radar_ids = [equip_id for equip_id, type_id in equipment_type.items() if type_id == radar_type]
        for index, equip_id in enumerate(radar_ids):
            radar_modality[equip_id] = modalities[index % len(modalities)]
    propulsion_by_type = {
        7: ["el\u00e9trica"], 8: ["gasolina", "flex"], 9: ["flex", "diesel", "h\u00edbrida"],
        10: ["flex", "diesel", "h\u00edbrida"], 11: ["flex", "diesel", "el\u00e9trica"],
        12: ["flex", "gasolina", "h\u00edbrida", "el\u00e9trica"], 13: ["gasolina", "flex"],
        14: ["diesel", "flex"], 15: ["el\u00e9trica", "h\u00edbrida"],
    }
    for equip_id, type_id in equipment_type.items():
        for attr_id in attr_by_type.get(type_id, []):
            definition = attr_defs[attr_id - 1]
            name, kind = definition[1], definition[2]
            if name == "modalidade": value = (radar_modality[equip_id], None, None)
            elif name == "limite_velocidade":
                value = (None, rng.choice([40, 50, 60, 80]) if radar_modality[equip_id] == "velocidade" else None, None)
            elif name == "categoria_servico": value = (rng.choice(["convencional", "executivo", "acess\u00edvel"]), None, None)
            elif name == "resolucao": value = (rng.choice(["1080p", "4 MP", "4K"]), None, None)
            elif name == "tipo_imagem": value = (rng.choice(["colorida", "preto e branco"]), None, None)
            elif name == "controle_acesso": value = (rng.choice(["leitor de placas", "tag RFID", "controle manual"]), None, None)
            elif name == "tipo_propulsao": value = (rng.choice(propulsion_by_type[type_id]), None, None)
            elif name == "tracao": value = (rng.choice(["4x2", "4x4"]) if type_id in (9, 10, 11, 15) else "4x2", None, None)
            elif name == "quantidade_cameras": value = (None, rng.choice([2, 4, 6, 8]), None)
            elif name == "faixas_fiscalizadas": value = (None, rng.choice([1, 2, 3, 4]), None)
            elif name == "eixos_maximo": value = (None, rng.choice([2, 3, 4, 5, 6, 7, 9]), None)
            elif name == "precisao_kg": value = (None, rng.choice([5, 10, 20, 50]), None)
            elif name == "velocidade_max_kmh": value = (None, rng.choice([20, 25, 30, 35]), None)
            elif name == "altura_m": value = (None, round(rng.uniform(2.5, 5.5), 1), None)
            elif name in ("aceita_pix", "aceita_cartao", "aceita_dinheiro", "acessibilidade", "bloqueio_area_restrita",
                          "ptz", "duplo_sentido", "radio_operacional", "sirene_giroflex", "camera_embarcada",
                          "capacete_disponivel", "capacete_passageiro", "cintos_seguranca", "acompanhante", "visao_noturna",
                          "leitura_placas"):
                value = (None, None, rng.choice([True, False]))
            elif name == "largura_m": value = (None, round(rng.uniform(2.5, 5.5), 1), None)
            elif name == "vagas_monitoradas": value = (None, rng.randint(5, 120), None)
            elif name == "capacidade_ton": value = (None, rng.choice([30, 40, 60, 80, 100]), None)
            elif name == "autonomia_km": value = (None, rng.choice([60, 80, 100, 120, 160, 200]), None)
            elif name == "cilindrada_cc": value = (None, rng.choice([125, 150, 160, 250, 300, 500]), None)
            elif name == "capacidade_passageiros": value = (None, rng.choice([4, 5, 6, 7]), None)
            elif name == "capacidade_alunos": value = (None, rng.choice([15, 20, 25, 30, 35, 40]), None)
            elif name == "raio_cobertura_km":
                value = (None, equipment_coverage_by_id[equip_id], None)
            else: raise ValueError(f"No seed generator for equipment attribute {name!r}")
            if any(item is not None for item in value):
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
    role_by_organization = {
        1: "agente de tr\u00e2nsito",
        2: "guarda municipal",
        3: "policial",
        4: "fiscal",
    }
    agents = [(*agent[:5], role_by_organization[agent[1]], agent[6]) for agent in agents]

    capacity_by_type = {2: 1, 8: 1, 9: 2, 10: 2, 11: 2}
    eligible_vehicles = [
        (row[0], capacity_by_type[row[1]])
        for row in equipment_rows
        if row[1] in capacity_by_type and row[4] == 1
    ]
    agent_assignment_rng = random.Random(seed ^ 0xF060)
    agent_assignment_rng.shuffle(eligible_vehicles)
    vehicle_seats = [equipment_id for equipment_id, capacity in eligible_vehicles for _ in range(capacity)]
    active_agent_ids = [agent[0] for agent in agents if agent[6]]
    agent_assignment_rng.shuffle(active_agent_ids)
    non_ended_count = min(60, len(vehicle_seats), len(active_agent_ids))
    active_shift_count = (non_ended_count * 3 + 3) // 4
    agent_assignments = {
        agent_id: (vehicle_seats[index], "em_atividade" if index < active_shift_count else "programado")
        for index, agent_id in enumerate(active_agent_ids[:non_ended_count])
    }

    agent_coverage = generate_agent_coverage(agents, seed, agent_assignments)
    radius_by_agent = {agent_id: radius for agent_id, radius, _, _ in agent_coverage}
    agents = [(*agent, radius_by_agent[agent[0]]) for agent in agents]
    add("agentes", ["id_agente", "id_orgao", "id_localizacao_base", "matricula", "nome", "cargo", "ativo_cadastro", "raio_atuacao_km"], agents)

    shifts = []
    for i in range(1, 101):
        days_back = rng.randint(0, 30)
        hours_back = rng.randint(0, 8)
        region_id = rng.randint(1, 10)
        assignment = agent_assignments.get(i)
        if assignment is None:
            status = "encerrado"
            vehicle_id = None
            start = NOW - timedelta(days=days_back, hours=hours_back)
            end = start + timedelta(hours=8)
            actual_start, actual_end = start, end
        else:
            vehicle_id, status = assignment
            if status == "em_atividade":
                start = NOW - timedelta(hours=2)
                end = NOW + timedelta(hours=6)
                actual_start, actual_end = start, None
            else:
                start = NOW + timedelta(days=1, hours=i % 5)
                end = start + timedelta(hours=8)
                actual_start, actual_end = None, None
        shifts.append((i, i, vehicle_id, region_id, start, end, actual_start, actual_end, status))
    add("turnos_agente", ["id_turno", "id_agente", "id_equipamento", "id_regiao", "inicio_previsto", "fim_previsto", "inicio_real", "fim_real", "status"], shifts)

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
    occurrence_types = ["tr\u00e2nsito", "falha de equipamento", "estacionamento", "seguran\u00e7a", "obstru\u00e7\u00e3o"]
    severities = ["baixa", "media", "alta", "critica"]
    background_profile = {"severity": [38, 42, 17, 3], "types": [34, 19, 20, 12, 15]}
    occurrence_coords, map_location_ids, hotspots, hotspot_profiles, hotspot_candidates = occurrence_hotspots(locations)
    active_start = max(OCCURRENCE_HISTORY_START, NOW - timedelta(days=60))
    active_status_index = 0
    current_occurrence_created = False

    def context_for_random_occurrence():
        if rng.random() < 0.18:
            location_id = rng.choice(map_location_ids)
            return location_id, background_profile
        hotspot_index = rng.choices(
            range(len(hotspot_profiles)),
            weights=[profile["share"] for profile in hotspot_profiles],
            k=1,
        )[0]
        candidates = hotspot_candidates[hotspot_index]
        location_id = rng.choices(
            [candidate[0] for candidate in candidates],
            weights=[candidate[1] for candidate in candidates],
            k=1,
        )[0]
        return location_id, hotspot_profiles[hotspot_index]

    def context_for_location(location_id):
        lon_lat = occurrence_coords[location_id]
        nearest = min(
            range(len(hotspots)),
            key=lambda index: haversine_m(lon_lat, (hotspots[index][0], hotspots[index][1])),
        )
        return hotspot_profiles[nearest]

    def add_occurrence(location_id, org_id, equip_id, active, description, fixed_location=False,
                       force_start=False, force_now=False):
        nonlocal active_status_index, current_occurrence_created
        occurrence_id = len(occurrences) + 1
        if active and not current_occurrence_created:
            force_now = True
            current_occurrence_created = True
        if fixed_location:
            profile = context_for_location(location_id)
        else:
            location_id, profile = context_for_random_occurrence()
        status = (
            ("aberta" if active_status_index % 2 == 0 else "em_atendimento")
            if active else rng.choices(["resolvida", "cancelada"], [86, 14])[0]
        )
        if active:
            active_status_index += 1
            occurred = NOW if force_now else random_datetime(rng, active_start, NOW)
        else:
            occurred = OCCURRENCE_HISTORY_START if force_start else random_datetime(rng, OCCURRENCE_HISTORY_START, NOW)
        if force_now:
            occurred = NOW
        occurrence_type = rng.choices(occurrence_types, profile["types"], k=1)[0]
        severity = rng.choices(severities, profile["severity"], k=1)[0]
        severity = adjust_occurrence_severity(seed, occurrence_id, occurred, severity)
        if status == "resolvida" and occurred >= NOW:
            occurred = NOW - timedelta(minutes=1)
        resolved = occurrence_resolution_datetime(
            seed,
            occurrence_id,
            occurrence_coords[location_id],
            hotspots,
            occurrence_type,
            severity,
            occurred,
            status,
        )
        occurrences.append((
            occurrence_id,
            location_id,
            org_id,
            equip_id,
            occurrence_type,
            severity,
            status,
            description,
            occurred,
            resolved,
        ))

    for equipment_index, equip_id in enumerate(priority_equipment_ids):
        equipment = equipment_by_id[equip_id]
        for equipment_occurrence_index in range(3):
            is_active = equipment_occurrence_index == 0 or (equipment_occurrence_index == 1 and equipment_index < 16)
            add_occurrence(
                equipment[3], equipment[2], equip_id, is_active,
                "Evento fict\u00edcio vinculado ao equipamento para demonstra\u00e7\u00e3o.",
                fixed_location=True,
                force_start=(len(occurrences) == 2),
            )

    remaining_active = OCCURRENCE_ACTIVE_TOTAL - active_status_index
    for _ in range(remaining_active):
        equip_id = rng.choice(list(equipment_type))
        add_occurrence(
            0, rng.randint(1, 4), equip_id, True,
            "Evento fict\u00edcio para demonstra\u00e7\u00e3o e an\u00e1lise.",
        )

    remaining_historical = OCCURRENCE_TOTAL - len(occurrences)
    for _ in range(remaining_historical):
        equip_id = rng.choice(list(equipment_type))
        add_occurrence(
            0, rng.randint(1, 4), equip_id, False,
            "Evento fict\u00edcio para demonstra\u00e7\u00e3o e an\u00e1lise.",
        )
    if not current_occurrence_created or max(row[8] for row in occurrences) < NOW.replace(hour=0, minute=0, second=0):
        raise RuntimeError("Occurrence generation did not reach the current date")
    add("ocorrencias", ["id_ocorrencia", "id_localizacao", "id_orgao", "id_equipamento", "tipo", "gravidade", "status", "descricao", "ocorrida_em", "resolvida_em"], occurrences)
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
    occurrence_migration_path = out.with_name("migrate_occurrences.sql")
    occurrence_migration_temp = occurrence_migration_path.with_suffix(occurrence_migration_path.suffix + ".tmp")
    occurrence_migration_temp.write_text(occurrence_migration_sql(occurrences), encoding="utf-8")
    occurrence_migration_temp.replace(occurrence_migration_path)
    occurrence_resolution_migration_path = out.with_name("migrate_occurrence_resolution.sql")
    occurrence_resolution_migration_temp = occurrence_resolution_migration_path.with_suffix(
        occurrence_resolution_migration_path.suffix + ".tmp")
    occurrence_resolution_migration_temp.write_text(
        occurrence_resolution_migration_sql(occurrences, occurrence_coords, hotspots, seed), encoding="utf-8")
    occurrence_resolution_migration_temp.replace(occurrence_resolution_migration_path)
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
    attribute_definitions = [(definition[0], definition[1], definition[2], definition[3], definition[4])
                             for definition in attr_defs]
    definition_by_id = {index: definition for index, definition in enumerate(attr_defs, 1)}
    attribute_migration_values = []
    for equip_id, attr_id, text_value, number_value, boolean_value in values:
        definition = definition_by_id[attr_id]
        attribute_migration_values.append((equip_id, definition[0], definition[1], text_value, number_value, boolean_value))
    attributes_migration_path = out.with_name("migrate_equipment_attributes.sql")
    attributes_migration_temp = attributes_migration_path.with_suffix(attributes_migration_path.suffix + ".tmp")
    attributes_migration_temp.write_text(
        equipment_attributes_migration_sql(attribute_definitions, attribute_migration_values), encoding="utf-8")
    attributes_migration_temp.replace(attributes_migration_path)
    vehicle_coverage_path = out.with_name("migrate_vehicle_coverage.sql")
    vehicle_coverage_temp = vehicle_coverage_path.with_suffix(vehicle_coverage_path.suffix + ".tmp")
    vehicle_coverage_temp.write_text(
        equipment_coverage_migration_sql(vehicle_coverage_migration), encoding="utf-8")
    vehicle_coverage_temp.replace(vehicle_coverage_path)
    agent_migration_assignments = [
        (row[1], row[2], row[3], row[8])
        for row in shifts if row[8] != "encerrado"
    ]
    agent_migration_path = out.with_name("migrate_agent_vehicle_shifts.sql")
    agent_migration_temp = agent_migration_path.with_suffix(agent_migration_path.suffix + ".tmp")
    agent_migration_temp.write_text(
        agent_vehicle_migration_sql(agent_migration_assignments), encoding="utf-8")
    agent_migration_temp.replace(agent_migration_path)
    agent_coverage_path = out.with_name("migrate_agent_coverage.sql")
    agent_coverage_temp = agent_coverage_path.with_suffix(agent_coverage_path.suffix + ".tmp")
    agent_coverage_temp.write_text(
        agent_coverage_migration_sql(agent_coverage), encoding="utf-8")
    agent_coverage_temp.replace(agent_coverage_path)
    summary = {
        **counts,
        "ocorrencias_resolvidas_com_data": sum(row[6] == "resolvida" and row[9] is not None for row in occurrences),
        "ocorrencias_sem_data_de_resolucao": sum(row[9] is None for row in occurrences),
        "equipamentos_moveis": sum(equipment_type[i] in mobile_ids for i in equipment_type),
        "viagens_em_andamento": active_trip_count,
        "turnos_em_atividade": sum(row[8] == "em_atividade" for row in shifts),
        "turnos_programados": sum(row[8] == "programado" for row in shifts),
        "turnos_vinculados_a_veiculos": len(agent_migration_assignments),
        "posicoes_min_por_viagem": min_positions_per_trip,
        "seed": seed,
    }
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
