-- Add vehicle assignments to active demo agent shifts without replacing closed shift history.
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

INSERT INTO migration_agent_vehicle_assignments (`id_agente`, `id_equipamento`, `id_regiao`, `status`) VALUES
(1, 126, 6, 'em_atividade'),
(2, 310, 9, 'em_atividade'),
(3, 138, 1, 'em_atividade'),
(6, 263, 4, 'em_atividade'),
(7, 484, 1, 'em_atividade'),
(8, 161, 10, 'programado'),
(10, 21, 10, 'programado'),
(11, 445, 1, 'programado'),
(12, 340, 5, 'programado'),
(14, 414, 8, 'em_atividade'),
(16, 170, 6, 'programado'),
(17, 472, 5, 'em_atividade'),
(18, 200, 3, 'em_atividade'),
(21, 126, 6, 'em_atividade'),
(22, 102, 4, 'em_atividade'),
(24, 311, 9, 'em_atividade'),
(28, 414, 1, 'em_atividade'),
(29, 444, 8, 'em_atividade'),
(31, 200, 4, 'em_atividade'),
(33, 69, 1, 'em_atividade'),
(34, 400, 1, 'em_atividade'),
(35, 440, 10, 'em_atividade'),
(38, 5, 2, 'em_atividade'),
(40, 164, 3, 'em_atividade'),
(41, 222, 9, 'programado'),
(43, 116, 10, 'em_atividade'),
(44, 445, 9, 'programado'),
(49, 215, 6, 'programado'),
(50, 116, 7, 'em_atividade'),
(51, 69, 2, 'em_atividade'),
(52, 500, 3, 'em_atividade'),
(53, 222, 10, 'programado'),
(55, 170, 10, 'programado'),
(57, 190, 7, 'em_atividade'),
(58, 396, 7, 'em_atividade'),
(59, 115, 8, 'em_atividade'),
(60, 386, 7, 'em_atividade'),
(62, 430, 10, 'programado'),
(64, 21, 3, 'programado'),
(65, 463, 8, 'em_atividade'),
(66, 396, 3, 'em_atividade'),
(69, 338, 10, 'em_atividade'),
(70, 100, 1, 'em_atividade'),
(71, 472, 1, 'em_atividade'),
(73, 452, 10, 'em_atividade'),
(74, 138, 5, 'em_atividade'),
(76, 100, 9, 'em_atividade'),
(77, 215, 3, 'programado'),
(79, 440, 3, 'em_atividade'),
(80, 161, 9, 'programado'),
(81, 444, 7, 'em_atividade'),
(82, 430, 10, 'em_atividade'),
(83, 437, 1, 'programado'),
(84, 164, 1, 'em_atividade'),
(85, 460, 6, 'em_atividade'),
(86, 484, 4, 'em_atividade'),
(88, 155, 3, 'em_atividade'),
(89, 386, 4, 'em_atividade'),
(91, 5, 1, 'em_atividade'),
(92, 190, 1, 'em_atividade');

UPDATE turnos_agente AS turno
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
