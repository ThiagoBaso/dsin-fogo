-- Set demo radii (20-60 m at bases, 100-300 m in vehicles), preserving custom values.
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

INSERT INTO migration_agent_coverage (`id_agente`, `raio_atuacao_km`, `raio_anterior_km`, `raio_base_anterior_km`) VALUES
(1, 0.14, 2.88, 0.03),
(2, 0.3, 9.76, 0.06),
(3, 0.11, 1.77, 0.02),
(4, 0.03, 4.09, 0.03),
(5, 0.04, 4.07, 0.04),
(6, 0.18, 4.44, 0.04),
(7, 0.15, 4.36, 0.04),
(8, 0.13, 2.83, 0.03),
(9, 0.03, 2.74, 0.03),
(10, 0.12, 3.18, 0.03),
(11, 0.3, 9.98, 0.06),
(12, 0.14, 2.66, 0.02),
(13, 0.03, 2.81, 0.03),
(14, 0.16, 3.98, 0.04),
(15, 0.03, 2.95, 0.03),
(16, 0.2, 5.16, 0.05),
(17, 0.17, 4.2, 0.04),
(18, 0.13, 2.45, 0.02),
(19, 0.02, 1.92, 0.02),
(20, 0.04, 4.92, 0.04),
(21, 0.12, 2.09, 0.02),
(22, 0.15, 4.29, 0.04),
(23, 0.02, 1.98, 0.02),
(24, 0.13, 2.75, 0.03),
(25, 0.04, 3.66, 0.04),
(26, 0.05, 5.68, 0.05),
(27, 0.03, 3.52, 0.03),
(28, 0.17, 3.79, 0.03),
(29, 0.15, 3.53, 0.04),
(30, 0.04, 3.5, 0.04),
(31, 0.11, 2.71, 0.02),
(32, 0.04, 4.34, 0.04),
(33, 0.26, 7.87, 0.05),
(34, 0.15, 4.5, 0.04),
(35, 0.27, 8.12, 0.05),
(36, 0.05, 6.41, 0.05),
(37, 0.02, 2.07, 0.02),
(38, 0.11, 1.82, 0.02),
(39, 0.02, 2.16, 0.02),
(40, 0.13, 2.46, 0.02),
(41, 0.29, 9.69, 0.06),
(42, 0.03, 2.95, 0.03),
(43, 0.27, 8.26, 0.05),
(44, 0.14, 3.26, 0.03),
(45, 0.02, 1.85, 0.02),
(46, 0.02, 2.71, 0.02),
(47, 0.06, 8.66, 0.06),
(48, 0.02, 1.61, 0.02),
(49, 0.18, 4.54, 0.04),
(50, 0.12, 3.19, 0.03),
(51, 0.13, 3.53, 0.03),
(52, 0.2, 5.33, 0.05),
(53, 0.1, 2.06, 0.02),
(54, 0.04, 4.06, 0.04),
(55, 0.12, 2.82, 0.03),
(56, 0.04, 4.75, 0.04),
(57, 0.14, 3.3, 0.03),
(58, 0.16, 4.0, 0.04),
(59, 0.3, 9.83, 0.06),
(60, 0.14, 3.13, 0.03),
(61, 0.03, 2.73, 0.03),
(62, 0.12, 2.54, 0.03),
(63, 0.05, 8.34, 0.05),
(64, 0.22, 5.16, 0.04),
(65, 0.16, 3.41, 0.03),
(66, 0.24, 6.67, 0.05),
(67, 0.03, 4.04, 0.03),
(68, 0.06, 9.05, 0.06),
(69, 0.28, 9.05, 0.06),
(70, 0.12, 2.63, 0.03),
(71, 0.25, 7.15, 0.05),
(72, 0.03, 3.23, 0.03),
(73, 0.21, 5.58, 0.05),
(74, 0.13, 3.29, 0.03),
(75, 0.03, 3.6, 0.03),
(76, 0.22, 5.87, 0.05),
(77, 0.24, 6.42, 0.05),
(78, 0.04, 4.05, 0.04),
(79, 0.27, 7.99, 0.05),
(80, 0.21, 4.46, 0.04),
(81, 0.2, 5.46, 0.05),
(82, 0.28, 8.78, 0.06),
(83, 0.15, 4.72, 0.04),
(84, 0.14, 3.94, 0.03),
(85, 0.12, 2.96, 0.03),
(86, 0.11, 2.37, 0.02),
(87, 0.03, 2.65, 0.03),
(88, 0.25, 6.81, 0.05),
(89, 0.14, 3.09, 0.03),
(90, 0.04, 5.05, 0.04),
(91, 0.29, 9.66, 0.06),
(92, 0.2, 5.14, 0.05),
(93, 0.04, 4.52, 0.04),
(94, 0.05, 5.73, 0.05),
(95, 0.02, 2.45, 0.02),
(96, 0.04, 4.78, 0.04),
(97, 0.04, 4.76, 0.04),
(98, 0.03, 3.74, 0.03),
(99, 0.02, 2.19, 0.02),
(100, 0.04, 3.55, 0.04);

UPDATE agentes AS agent
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
