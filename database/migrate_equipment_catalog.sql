-- Idempotent upgrade: demo equipment gets complete, varied operational history.
INSERT IGNORE INTO tipos_equipamento (id_tipo, nome, mobilidade, icone_mapa) VALUES
  (12, 'Táxi', 'movel', 'car'),
  (13, 'Mototáxi', 'movel', 'motorcycle'),
  (14, 'Transporte escolar', 'movel', 'car'),
  (15, 'Veículo autônomo de fiscalização de estacionamento', 'movel', 'car');

INSERT INTO equipamentos
  (id_tipo, id_orgao, id_localizacao, id_situacao, numero_serie, marca, modelo, cadastrado_em, instalado_em)
SELECT tipos.id_tipo, 1, locais.id_localizacao, 1,
       CONCAT('DEMO-EXTRA-', LPAD(tipos.id_tipo, 2, '0'), '-', LPAD(vagas.slot, 3, '0')),
       'F.O.G.O. Demo', tipos.modelo, CURRENT_TIMESTAMP, NULL
FROM (
  SELECT 12 AS id_tipo, 'Taxi demonstrativo' AS modelo
  UNION ALL SELECT 13, 'Mototaxi demonstrativo'
  UNION ALL SELECT 14, 'Transporte escolar demonstrativo'
  UNION ALL SELECT 15, 'Fiscalizacao autonoma de estacionamento demonstrativa'
) AS tipos
CROSS JOIN (
  SELECT 1 AS slot UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
  UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8
) AS vagas
JOIN (
  SELECT id_localizacao, ROW_NUMBER() OVER (ORDER BY id_localizacao) AS local_slot
  FROM localizacoes
) AS locais ON locais.local_slot = MOD((tipos.id_tipo * 17 + vagas.slot * 31 - 1), (SELECT COUNT(*) FROM localizacoes)) + 1
WHERE vagas.slot > (
  SELECT COUNT(*) FROM equipamentos AS existente WHERE existente.id_tipo = tipos.id_tipo
);

INSERT IGNORE INTO atributos_tipo (id_tipo, nome, tipo_valor, unidade, obrigatorio) VALUES
  (12, 'categoria_servico', 'texto', NULL, TRUE),
  (12, 'capacidade_passageiros', 'numero', 'pessoas', TRUE),
  (13, 'cilindrada_cc', 'numero', 'cc', TRUE),
  (13, 'capacete_disponivel', 'booleano', NULL, TRUE),
  (14, 'capacidade_alunos', 'numero', 'pessoas', TRUE),
  (14, 'acessibilidade', 'booleano', NULL, TRUE),
  (15, 'leitura_placas', 'booleano', NULL, TRUE),
  (15, 'autonomia_km', 'numero', 'km', TRUE);

INSERT IGNORE INTO valores_atributo
  (id_equipamento, id_atributo, valor_texto, valor_numero, valor_booleano)
SELECT equipamento.id_equipamento, atributo.id_atributo,
       CASE WHEN atributo.tipo_valor = 'texto' THEN
         CASE MOD(equipamento.id_equipamento, 3)
           WHEN 0 THEN 'convencional' WHEN 1 THEN 'executivo' ELSE 'acessivel' END
       ELSE NULL END,
       CASE atributo.nome
         WHEN 'capacidade_passageiros' THEN 4 + MOD(equipamento.id_equipamento, 2)
         WHEN 'cilindrada_cc' THEN 125 + MOD(equipamento.id_equipamento, 4) * 25
         WHEN 'capacidade_alunos' THEN 20 + MOD(equipamento.id_equipamento, 20)
         WHEN 'autonomia_km' THEN 80 + MOD(equipamento.id_equipamento, 6) * 10
         ELSE NULL END,
       CASE atributo.nome
         WHEN 'capacete_disponivel' THEN MOD(equipamento.id_equipamento, 2)
         WHEN 'acessibilidade' THEN MOD(equipamento.id_equipamento + 1, 2)
         WHEN 'leitura_placas' THEN 1
         ELSE NULL END
FROM equipamentos AS equipamento
JOIN atributos_tipo AS atributo ON atributo.id_tipo = equipamento.id_tipo
WHERE equipamento.id_tipo IN (12, 13, 14, 15);

-- Select source vehicles with distinct registered bases and complete OSM route history.
CREATE TEMPORARY TABLE migration_targets AS
SELECT equipamento.id_equipamento AS target_id,
       ROW_NUMBER() OVER (ORDER BY equipamento.id_equipamento) AS route_slot
FROM equipamentos AS equipamento
WHERE equipamento.id_tipo IN (12, 13, 14, 15)
  AND equipamento.numero_serie LIKE 'DEMO-EXTRA-%'
  AND NOT EXISTS (
    SELECT 1 FROM viagens AS existente
    WHERE existente.id_equipamento = equipamento.id_equipamento
  );

CREATE TEMPORARY TABLE migration_sources AS
SELECT candidatos.id_equipamento AS source_id,
       candidatos.id_localizacao,
       ROW_NUMBER() OVER (ORDER BY candidatos.id_equipamento) AS route_slot
FROM (
  SELECT equipamento.id_equipamento, equipamento.id_localizacao,
         ROW_NUMBER() OVER (PARTITION BY equipamento.id_localizacao ORDER BY equipamento.id_equipamento) AS base_rank
  FROM equipamentos AS equipamento
  WHERE equipamento.id_tipo IN (2, 7, 8, 9, 10, 11)
    AND EXISTS (
      SELECT 1 FROM viagens AS ativa
      WHERE ativa.id_equipamento = equipamento.id_equipamento
        AND ativa.situacao = 'em_andamento'
    )
    AND 3 <= (
      SELECT COUNT(*) FROM viagens AS concluidas
      WHERE concluidas.id_equipamento = equipamento.id_equipamento
        AND concluidas.situacao = 'concluida'
    )
) AS candidatos
WHERE candidatos.base_rank = 1;

CREATE TEMPORARY TABLE migration_route_equipment AS
SELECT alvo.target_id, origem.source_id, origem.id_localizacao
FROM migration_targets AS alvo
JOIN migration_sources AS origem USING (route_slot);

UPDATE equipamentos AS alvo
JOIN migration_route_equipment AS mapa ON mapa.target_id = alvo.id_equipamento
JOIN equipamentos AS origem ON origem.id_equipamento = mapa.source_id
SET alvo.id_localizacao = mapa.id_localizacao,
    alvo.cadastrado_em = origem.cadastrado_em;

CREATE TEMPORARY TABLE migration_source_trips AS
SELECT viagens.*,
       ROW_NUMBER() OVER (
         PARTITION BY viagens.id_equipamento
         ORDER BY CASE WHEN viagens.situacao = 'em_andamento' THEN 1 ELSE 0 END,
                  viagens.inicio_em
       ) AS route_rank
FROM viagens
JOIN equipamentos AS origem ON origem.id_equipamento = viagens.id_equipamento
WHERE origem.id_tipo IN (2, 7, 8, 9, 10, 11)
  AND (viagens.situacao = 'em_andamento' OR viagens.situacao = 'concluida');

CREATE TEMPORARY TABLE migration_trip_map AS
SELECT mapa.target_id, fonte.id_viagem AS source_trip_id,
       (SELECT COALESCE(MAX(id_viagem), 0) FROM viagens)
         + ROW_NUMBER() OVER (ORDER BY mapa.target_id, fonte.route_rank) AS new_trip_id,
       fonte.inicio_em, fonte.fim_em, fonte.distancia_m, fonte.situacao
FROM migration_route_equipment AS mapa
JOIN migration_source_trips AS fonte ON fonte.id_equipamento = mapa.source_id
WHERE fonte.route_rank <= 4;

INSERT INTO viagens (id_viagem, id_equipamento, inicio_em, fim_em, distancia_m, situacao)
SELECT new_trip_id, target_id, inicio_em, fim_em, distancia_m, situacao
FROM migration_trip_map;

INSERT INTO posicoes_equipamento
  (id_equipamento, id_viagem, latitude, longitude, velocidade_kmh, registrado_em)
SELECT mapa.target_id, mapa.new_trip_id, posicao.latitude, posicao.longitude,
       posicao.velocidade_kmh, posicao.registrado_em
FROM migration_trip_map AS mapa
JOIN posicoes_equipamento AS posicao ON posicao.id_viagem = mapa.source_trip_id
ORDER BY mapa.new_trip_id, posicao.registrado_em;

-- Keep three incident records attached to each new vehicle and its assigned base.
CREATE TEMPORARY TABLE migration_occurrence_counts AS
SELECT id_equipamento, COUNT(*) AS total
FROM ocorrencias
GROUP BY id_equipamento;

INSERT INTO ocorrencias
  (id_localizacao, id_orgao, id_equipamento, tipo, gravidade, status, descricao, ocorrida_em)
SELECT equipamento.id_localizacao, equipamento.id_orgao, equipamento.id_equipamento,
       CASE equipamento.id_tipo WHEN 12 THEN 'estacionamento' WHEN 13 THEN 'transito'
            WHEN 14 THEN 'transito' ELSE 'estacionamento' END,
       CASE slots.slot WHEN 1 THEN 'baixa' WHEN 2 THEN 'media' ELSE 'alta' END,
       'resolvida', 'Ocorrencia demonstrativa vinculada ao equipamento.',
       DATE_SUB(CURRENT_TIMESTAMP, INTERVAL slots.slot DAY)
FROM equipamentos AS equipamento
CROSS JOIN (SELECT 1 AS slot UNION ALL SELECT 2 UNION ALL SELECT 3) AS slots
LEFT JOIN migration_occurrence_counts AS existentes
  ON existentes.id_equipamento = equipamento.id_equipamento
WHERE equipamento.id_tipo IN (12, 13, 14, 15)
  AND slots.slot > COALESCE(existentes.total, 0);

INSERT INTO historico_situacoes (id_equipamento, id_situacao, iniciado_em, encerrado_em, observacao)
SELECT equipamento.id_equipamento, equipamento.id_situacao, equipamento.cadastrado_em, NULL,
       'Situacao atual de demonstracao'
FROM equipamentos AS equipamento
WHERE equipamento.id_tipo IN (12, 13, 14, 15)
  AND equipamento.numero_serie LIKE 'DEMO-EXTRA-%'
  AND NOT EXISTS (
    SELECT 1 FROM historico_situacoes AS historico
    WHERE historico.id_equipamento = equipamento.id_equipamento
      AND historico.encerrado_em IS NULL
  );

UPDATE valores_atributo AS valor
JOIN atributos_tipo AS atributo ON atributo.id_atributo = valor.id_atributo
JOIN equipamentos AS equipamento ON equipamento.id_equipamento = valor.id_equipamento
SET valor.valor_texto = 'retorno proibido',
    valor.valor_numero = NULL,
    valor.valor_booleano = NULL
WHERE atributo.nome = 'modalidade'
  AND equipamento.id_tipo IN (1, 2)
  AND equipamento.id_equipamento = (
    SELECT alvo.id_equipamento
    FROM (
      SELECT MIN(e.id_equipamento) AS id_equipamento
      FROM equipamentos AS e
      JOIN atributos_tipo AS a ON a.id_tipo = e.id_tipo AND a.nome = 'modalidade'
      WHERE e.id_tipo IN (1, 2)
    ) AS alvo
  );
