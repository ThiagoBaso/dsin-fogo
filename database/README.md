# Banco de referencia F.O.G.O.

Schema de referencia para MySQL 8.0, baseado em `DER_FOGO.dbml`.

## Arquivos

- `DER_FOGO.dbml`: modelo logico.
- `schema.sql`: schema MySQL 8.0 / InnoDB / utf8mb4.
- `migrate_active_trips.sql`, `migrate_equipment_catalog.sql`, `migrate_location_addresses.sql`, `migrate_equipment_situations.sql`, `migrate_equipment_attributes.sql`, `migrate_agent_vehicle_shifts.sql`, `migrate_agent_coverage.sql` and `migrate_vehicle_coverage.sql`: idempotent upgrades for an existing Compose database volume.
- `generate_data.py`: gera a massa SQL de demonstracao.
- `generate_neighborhood_boundaries.py`: gera o GeoJSON de setores demonstrativos usando quarteiroes delimitados por ruas do OpenStreetMap.
- `generate_routes.py`: cria e interpola rotas pela malha viaria OpenStreetMap de Marilia.
- `validate_data.py`: valida integridade, extremidades das viagens ativas e limites geograficos.
- `seed.sql`: massa de demonstracao aplicada junto ao schema em um banco novo.
- `marilia.graphml`: cache local da malha viaria OSM.

O seed preserva os 500 equipamentos originais e inclui oito unidades de cada um dos quatro novos tipos moveis (532 equipamentos no total, 92 moveis). Cada novo cadastro tem localizacao distinta, atributos especificos, historico e ao menos tres ocorrencias e quatro viagens com posicoes GPS. O gerador cria tres viagens concluidas por equipamento movel e uma ativa quando ele esta a mais de 100 m da base. As rotas sao demonstrativas e usam a malha viaria OSM.

A massa tambem inclui oito equipamentos ainda nao instalados e oito com mau funcionamento, com historico de situacao coerente.

Veículos e patinetes móveis recebem raios de cobertura de 100 a 300 metros; radares móveis ficam entre 100 e 240 metros. A cobertura é calculada ao redor da posição atual do equipamento (GPS mais recente, ou posição cadastrada quando não houver GPS). Agentes em turnos ativos ou programados com veículo recebem raios de atuação de 100 a 300 metros ao redor da posição exibida no mapa. Agentes sem veículo recebem raios locais de 20 a 60 metros ao redor da posição cadastrada. Os raios são armazenados em km e exibidos em metros nos detalhes. Esses valores são sintéticos para demonstração; a seed e as migrações usam valores reprodutíveis e atualizam valores gerados anteriores, preservando valores personalizados.

O catalogo de atributos especificos cobre modalidade e faixas de radares; resolucao, tipo de imagem (colorida ou preto e branco), visao noturna e PTZ de cameras; dimensoes e controle de acesso de cancelas; meios de pagamento e acessibilidade de totens; capacidade por eixos e precisao de balancas; autonomia, velocidade e propulsao de patinetes; cilindrada, capacetes e equipamentos operacionais de motos e viaturas; e caracteristicas de servico, seguranca, acessibilidade e propulsao de transporte de passageiros. Radares fixos e moveis incluem as modalidades velocidade, avanco de sinal, faixa exclusiva, conversao proibida e retorno proibido. Os mesmos atributos sao usados na aba de filtros; textos e booleanos usam selecao por valores, e atributos numericos aceitam intervalo minimo e maximo.

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

O Docker Compose monta `schema.sql` e `seed.sql` para inicializar um banco vazio. Em um volume existente, `database-migrate` aplica de forma idempotente as migrações de viagens, catálogo, endereços, situações, atributos e turnos de agentes. A migração de atributos inclui o catálogo e valores sintéticos sem apagar equipamentos. A API aguarda as migrações. Não remova `fogo_mysql_data`, pois isso apagaria os dados.

Para validar o seed offline, conferir as viagens ativas e verificar os limites geograficos, execute `py database\validate_data.py --seed-sql database\seed.sql`. Para validar uma base importada, configure `MYSQL_*` e execute `py database\validate_data.py`.

## Observacoes

O grafo OSM e geografico. Equipamentos, agentes, eventos, locais cadastrados, trajetos e padroes analiticos sao sinteticos. Bairros, setores e regioes nao sao divisoes oficiais de Marilia. A massa usa IDs deterministas e data corrente para que as viagens ativas estejam atuais no momento da geracao.

Turnos de agentes: o gerador cria turnos em atividade e programados, sem encerramento e vinculados a veículos operacionais. Viaturas comportam até dois agentes; radar móvel e motocicleta comportam um. A API `/api/agentes` calcula a posição compartilhada usando o GPS mais recente do veículo. A tela é somente para consulta.
