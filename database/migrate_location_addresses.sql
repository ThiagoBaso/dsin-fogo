-- Fill missing addresses in the synthetic Marilia demo locations.
-- Values are intentionally fictitious and deterministic.
UPDATE localizacoes
SET cep = COALESCE(cep, LPAD(CONCAT('00000', id_localizacao), 8, '0')),
    logradouro = COALESCE(logradouro, CONCAT('Rua Demonstrativa ', LPAD(id_localizacao, 3, '0')))
WHERE (cep IS NULL OR logradouro IS NULL)
  AND latitude BETWEEN -23 AND -21
  AND longitude BETWEEN -51 AND -49;
