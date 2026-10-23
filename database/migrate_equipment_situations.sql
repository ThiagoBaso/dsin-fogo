-- Add explicit demo equipment situations and apply them to a fixed sample.
INSERT IGNORE INTO situacoes_equipamento (id_situacao, nome, disponivel) VALUES
  (6, 'ainda não instalado', FALSE),
  (7, 'mau funcionamento', FALSE);

CREATE TEMPORARY TABLE migration_situation_targets AS
SELECT id_equipamento,
       ROW_NUMBER() OVER (ORDER BY id_equipamento) AS situation_slot
FROM equipamentos
WHERE numero_serie LIKE 'DEMO-%'
  AND id_tipo IN (1, 3, 4, 5, 6);

UPDATE equipamentos AS equipamento
JOIN migration_situation_targets AS alvo USING (id_equipamento)
SET equipamento.id_situacao = CASE WHEN alvo.situation_slot <= 8 THEN 6 ELSE 7 END,
    equipamento.instalado_em = CASE
      WHEN alvo.situation_slot <= 8 THEN NULL
      ELSE COALESCE(equipamento.instalado_em, equipamento.cadastrado_em)
    END
WHERE alvo.situation_slot <= 16;

UPDATE historico_situacoes AS historico
JOIN migration_situation_targets AS alvo USING (id_equipamento)
SET historico.id_situacao = CASE WHEN alvo.situation_slot <= 8 THEN 6 ELSE 7 END
WHERE alvo.situation_slot <= 16
  AND historico.encerrado_em IS NULL;

INSERT INTO historico_situacoes
  (id_equipamento, id_situacao, iniciado_em, encerrado_em, observacao)
SELECT equipamento.id_equipamento,
       CASE WHEN alvo.situation_slot <= 8 THEN 6 ELSE 7 END,
       equipamento.cadastrado_em,
       NULL,
       'Situacao demonstrativa aplicada pela migracao'
FROM equipamentos AS equipamento
JOIN migration_situation_targets AS alvo USING (id_equipamento)
WHERE alvo.situation_slot <= 16
  AND NOT EXISTS (
    SELECT 1 FROM historico_situacoes AS historico
    WHERE historico.id_equipamento = equipamento.id_equipamento
      AND historico.encerrado_em IS NULL
  );

DROP TEMPORARY TABLE migration_situation_targets;
