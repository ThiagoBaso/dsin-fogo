-- Reduce generated mobile equipment coverage to 100-300 m; keep custom values.
START TRANSACTION;
CREATE TEMPORARY TABLE migration_vehicle_coverage (
  id_equipamento INT UNSIGNED NOT NULL PRIMARY KEY,
  id_tipo INT UNSIGNED NOT NULL,
  raio_anterior_km DECIMAL(14,2) NOT NULL,
  raio_novo_km DECIMAL(14,2) NOT NULL
) ENGINE=InnoDB;
INSERT INTO migration_vehicle_coverage (`id_equipamento`, `id_tipo`, `raio_anterior_km`, `raio_novo_km`) VALUES
(5, 11, 3.81, 0.21),
(6, 7, 1.58, 0.14),
(7, 7, 1.21, 0.11),
(21, 10, 4.44, 0.28),
(69, 9, 4.42, 0.24),
(72, 8, 1.62, 0.11),
(85, 7, 1.66, 0.14),
(100, 10, 2.29, 0.21),
(115, 8, 2.64, 0.16),
(116, 9, 5.77, 0.27),
(121, 10, 3.15, 0.24),
(124, 10, 3.35, 0.24),
(126, 9, 4.87, 0.25),
(134, 7, 2.36, 0.19),
(136, 7, 2.19, 0.18),
(138, 10, 3.9, 0.26),
(148, 9, 4.91, 0.25),
(155, 8, 1.61, 0.11),
(161, 11, 3.91, 0.21),
(162, 7, 2.24, 0.18),
(164, 9, 5.16, 0.25),
(170, 11, 4.14, 0.22),
(190, 11, 3.89, 0.21),
(200, 10, 4.0, 0.27),
(214, 7, 1.71, 0.15),
(215, 10, 3.12, 0.24),
(217, 9, 4.9, 0.25),
(222, 11, 2.56, 0.17),
(287, 10, 4.76, 0.29),
(288, 8, 2.84, 0.17),
(300, 7, 1.62, 0.14),
(310, 8, 2.3, 0.14),
(324, 7, 1.09, 0.11),
(361, 10, 4.95, 0.3),
(386, 11, 2.86, 0.18),
(396, 9, 6.74, 0.29),
(400, 8, 2.32, 0.14),
(401, 7, 2.25, 0.18),
(414, 11, 2.97, 0.18),
(419, 8, 2.34, 0.14),
(430, 11, 2.54, 0.17),
(437, 8, 3.02, 0.18),
(440, 10, 2.37, 0.21),
(444, 9, 6.37, 0.28),
(445, 9, 3.99, 0.22),
(452, 8, 2.74, 0.16),
(460, 8, 2.32, 0.14),
(472, 11, 4.25, 0.23),
(477, 11, 3.57, 0.2),
(484, 9, 6.3, 0.28),
(501, 12, 3.25, 0.12),
(502, 12, 6.8, 0.2),
(503, 12, 6.63, 0.19),
(504, 12, 4.76, 0.16),
(505, 12, 3.02, 0.12),
(506, 12, 3.66, 0.13),
(507, 12, 3.05, 0.12),
(508, 12, 6.92, 0.2),
(509, 13, 3.44, 0.16),
(510, 13, 1.7, 0.11),
(511, 13, 3.55, 0.17),
(512, 13, 4.49, 0.2),
(513, 13, 1.79, 0.11),
(514, 13, 4.49, 0.2),
(515, 13, 3.08, 0.15),
(516, 13, 2.39, 0.13),
(517, 14, 5.45, 0.25),
(518, 14, 5.66, 0.25),
(519, 14, 5.82, 0.26),
(520, 14, 4.3, 0.23),
(521, 14, 7.08, 0.28),
(522, 14, 7.03, 0.28),
(523, 14, 5.45, 0.25),
(524, 14, 6.71, 0.27),
(525, 15, 2.48, 0.14),
(526, 15, 2.43, 0.14),
(527, 15, 3.25, 0.17),
(528, 15, 2.28, 0.13),
(529, 15, 2.42, 0.14),
(530, 15, 2.32, 0.13),
(531, 15, 3.64, 0.19),
(532, 15, 2.32, 0.13);

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
