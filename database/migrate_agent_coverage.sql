-- Add synthetic service-area radii to demo agents without replacing existing values.
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
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = DATABASE() AND table_name = 'agentes' AND constraint_name = 'chk_agente_raio_atuacao'
  ) THEN
    ALTER TABLE agentes ADD CONSTRAINT chk_agente_raio_atuacao
      CHECK (raio_atuacao_km IS NULL OR raio_atuacao_km BETWEEN 0.10 AND 25.00);
  END IF;
END//
DELIMITER ;
CALL migrate_agent_coverage();
DROP PROCEDURE migrate_agent_coverage;

CREATE TEMPORARY TABLE migration_agent_coverage (
  id_agente INT UNSIGNED NOT NULL PRIMARY KEY,
  raio_atuacao_km DECIMAL(5,2) NOT NULL
) ENGINE=InnoDB;
INSERT INTO migration_agent_coverage (id_agente, raio_atuacao_km) VALUES
(1, 2.88),
(2, 9.76),
(3, 1.77),
(4, 4.09),
(5, 4.07),
(6, 4.44),
(7, 4.36),
(8, 2.83),
(9, 2.74),
(10, 3.18),
(11, 9.98),
(12, 2.66),
(13, 2.81),
(14, 3.98),
(15, 2.95),
(16, 5.16),
(17, 4.20),
(18, 2.45),
(19, 1.92),
(20, 4.92),
(21, 2.09),
(22, 4.29),
(23, 1.98),
(24, 2.75),
(25, 3.66),
(26, 5.68),
(27, 3.52),
(28, 3.79),
(29, 3.53),
(30, 3.50),
(31, 2.71),
(32, 4.34),
(33, 7.87),
(34, 4.50),
(35, 8.12),
(36, 6.41),
(37, 2.07),
(38, 1.82),
(39, 2.16),
(40, 2.46),
(41, 9.69),
(42, 2.95),
(43, 8.26),
(44, 3.26),
(45, 1.85),
(46, 2.71),
(47, 8.66),
(48, 1.61),
(49, 4.54),
(50, 3.19),
(51, 3.53),
(52, 5.33),
(53, 2.06),
(54, 4.06),
(55, 2.82),
(56, 4.75),
(57, 3.30),
(58, 4.00),
(59, 9.83),
(60, 3.13),
(61, 2.73),
(62, 2.54),
(63, 8.34),
(64, 5.16),
(65, 3.41),
(66, 6.67),
(67, 4.04),
(68, 9.05),
(69, 9.05),
(70, 2.63),
(71, 7.15),
(72, 3.23),
(73, 5.58),
(74, 3.29),
(75, 3.60),
(76, 5.87),
(77, 6.42),
(78, 4.05),
(79, 7.99),
(80, 4.46),
(81, 5.46),
(82, 8.78),
(83, 4.72),
(84, 3.94),
(85, 2.96),
(86, 2.37),
(87, 2.65),
(88, 6.81),
(89, 3.09),
(90, 5.05),
(91, 9.66),
(92, 5.14),
(93, 4.52),
(94, 5.73),
(95, 2.45),
(96, 4.78),
(97, 4.76),
(98, 3.74),
(99, 2.19),
(100, 3.55);
UPDATE agentes AS agent
JOIN migration_agent_coverage AS coverage ON coverage.id_agente = agent.id_agente
SET agent.raio_atuacao_km = coverage.raio_atuacao_km
WHERE agent.raio_atuacao_km IS NULL AND agent.matricula LIKE 'DEMO-AG-%';

DROP TEMPORARY TABLE migration_agent_coverage;
