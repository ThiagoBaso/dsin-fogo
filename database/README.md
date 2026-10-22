# Banco de referencia F.O.G.O.

Schema de referencia para MySQL 8.0, baseado em `DER_FOGO.dbml`.

## Arquivos

- `DER_FOGO.dbml`: modelo logico.
- `schema.sql`: schema MySQL 8.0 / InnoDB / utf8mb4.
- `migrate_active_trips.sql`, `migrate_equipment_catalog.sql` and `migrate_location_addresses.sql`: non-destructive upgrades for an existing Compose database volume.
- `generate_data.py`: gera a massa SQL de demonstracao.
- `generate_neighborhood_boundaries.py`: gera o GeoJSON de setores demonstrativos usando quarteiroes delimitados por ruas do OpenStreetMap.
- `generate_routes.py`: cria e interpola rotas pela malha viaria OpenStreetMap de Marilia.
- `validate_data.py`: valida integridade, extremidades das viagens ativas e limites geograficos.
- `seed.sql`: massa de demonstracao aplicada junto ao schema em um banco novo.
- `marilia.graphml`: cache local da malha viaria OSM.

O seed preserva os 500 equipamentos originais e inclui oito unidades de cada um dos quatro novos tipos moveis (532 equipamentos no total, 92 moveis). Cada novo cadastro tem localizacao distinta, atributos especificos, historico e ao menos tres ocorrencias e quatro viagens com posicoes GPS. O gerador cria tres viagens concluidas por equipamento movel e uma ativa quando ele esta a mais de 100 m da base. As rotas sao demonstrativas e usam a malha viaria OSM.

As localizacoes de demonstracao recebem CEPs e logradouros ficticios, identificados como demonstrativos. O servico `database-migrate` preenche esses campos quando estiverem vazios em volumes ja existentes.

## Instalacao e uso

Use Python 3.10+ e MySQL 8.0. No diretorio do projeto:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
py -m pip install -r database\requirements.txt
py database\generate_neighborhood_boundaries.py
mysql -u root -p < database\schema.sql
py database\generate_data.py --seed 20261020
mysql -u root -p fogo < database\seed.sql
```

A primeira geracao requer acesso ao OpenStreetMap/Overpass para obter a malha, que fica em cache no arquivo GraphML. Se a obtencao falhar, a geracao para com erro; nao substitui rotas por linhas inventadas.

O GeoJSON dos setores e gerado a partir dessa mesma malha viaria: quarteiroes fechados pelas ruas sao agrupados em 40 setores sinteticos. As divisorias internas seguem vias; o limite externo e um fecho aproximado. Os setores continuam ficticios e nao devem ser tratados como limites oficiais de bairros.

O Docker Compose monta `schema.sql` e `seed.sql` como scripts de inicializacao do MySQL. O MySQL executa esses scripts somente quando cria um volume vazio. Para um volume existente, o servico `database-migrate` aplica as mudancas de viagens e do catalogo de equipamentos de forma idempotente, preservando os outros dados. A API aguarda as migracoes concluirem. Nao remova `fogo_mysql_data`, pois isso apagaria os dados.

Para validar o seed offline, conferir as viagens ativas e verificar os limites geograficos, execute `py database\validate_data.py --seed-sql database\seed.sql`. Para validar uma base importada, configure `MYSQL_*` e execute `py database\validate_data.py`.

## Observacoes

O grafo OSM e geografico. Equipamentos, agentes, eventos, locais cadastrados, trajetos e padroes analiticos sao sinteticos. Bairros, setores e regioes nao sao divisoes oficiais de Marilia. A massa usa IDs deterministas e data corrente para que as viagens ativas estejam atuais no momento da geracao.
