# Banco de referencia F.O.G.O.

Schema de referencia para MySQL 8.0, baseado em `DER_FOGO.dbml`.

## Arquivos

- `DER_FOGO.dbml`: modelo logico.
- `schema.sql`: schema MySQL 8.0 / InnoDB / utf8mb4.
- `migrate_active_trips.sql`, `migrate_equipment_catalog.sql`, `migrate_location_addresses.sql`, `migrate_equipment_situations.sql`, `migrate_equipment_attributes.sql`, `migrate_agent_vehicle_shifts.sql`, `migrate_agent_coverage.sql`, `migrate_vehicle_coverage.sql`, `migrate_occurrences.sql` and `migrate_occurrence_resolution.sql`: idempotent upgrades for an existing Compose database volume.
- `generate_data.py`: gera a massa SQL de demonstracao.
- `generate_census_sectors.py`: baixa a malha oficial do IBGE 2022, filtra Marília e gera o GeoJSON usado pelo mapa e pela previsão.
- `generate_routes.py`: cria e interpola rotas pela malha viaria OpenStreetMap de Marilia.
- `validate_data.py`: valida integridade, extremidades das viagens ativas e limites geograficos.
- `seed.sql`: massa de demonstracao aplicada junto ao schema em um banco novo.
- `marilia.graphml`: cache local da malha viaria OSM.

O seed preserva os 500 equipamentos originais e inclui oito unidades de cada um dos quatro novos tipos moveis (532 equipamentos no total, 92 moveis). Cada novo cadastro tem localizacao distinta, atributos especificos, historico e ao menos tres ocorrencias e quatro viagens com posicoes GPS. O gerador cria tres viagens concluidas por equipamento movel e uma ativa quando ele esta a mais de 100 m da base. As rotas sao demonstrativas e usam a malha viaria OSM.

A massa tambem inclui oito equipamentos ainda nao instalados e oito com mau funcionamento, com historico de situacao coerente.

Ocorrencias resolvidas recebem `resolvida_em` com tempos sinteticos reprodutiveis, correlacionados com sete setores de atendimento e variados por tipo, gravidade e horario. Ocorrencias abertas, em atendimento e canceladas permanecem sem data de resolucao. Os tempos sao dados ficticios para demonstracao, nao indicadores operacionais reais.

O seed gera exatamente 10.000 ocorrencias entre 1 de janeiro de 2024 e a data da geracao. Mantem 500 ocorrencias abertas ou em atendimento, para que a visao atual conserve uma quantidade semelhante a anterior. Uma ocorrência ativa de demonstração é registrada no instante da geração, para que o histórico sempre alcance o dia atual, mesmo quando o projeto for iniciado no futuro. Em volumes persistentes, a migração atualiza somente esse registro sintético. A distribuição de gravidade varia em ondas ao longo do tempo e também conforme a região. Os tempos de resolução simulam ciclos de carga e disponibilidade operacional, mantendo diferenças por tipo, gravidade, horário e região. A distribuição espacial é sintética: cerca de 82% dos eventos aleatórios se concentram ao redor de sete pontos da malha viária, com intensidades e perfis de gravidade/tipo diferentes; o restante compõe uma distribuição de fundo. Esses agrupamentos servem para demonstrar variação no mapa de calor e não representam estatísticas oficiais de risco.

Veículos e patinetes móveis recebem raios de cobertura de 100 a 300 metros; radares móveis ficam entre 100 e 240 metros. A cobertura é calculada ao redor da posição atual do equipamento (GPS mais recente, ou posição cadastrada quando não houver GPS). Agentes em turnos ativos ou programados com veículo recebem raios de atuação de 100 a 300 metros ao redor da posição exibida no mapa. Agentes sem veículo recebem raios locais de 20 a 60 metros ao redor da posição cadastrada. Os raios são armazenados em km e exibidos em metros nos detalhes. Esses valores são sintéticos para demonstração; a seed e as migrações usam valores reprodutíveis e atualizam valores gerados anteriores, preservando valores personalizados.

O catalogo de atributos especificos cobre modalidade e faixas de radares; resolucao, tipo de imagem (colorida ou preto e branco), visao noturna e PTZ de cameras; dimensoes e controle de acesso de cancelas; meios de pagamento e acessibilidade de totens; capacidade por eixos e precisao de balancas; autonomia, velocidade e propulsao de patinetes; cilindrada, capacetes e equipamentos operacionais de motos e viaturas; e caracteristicas de servico, seguranca, acessibilidade e propulsao de transporte de passageiros. Radares fixos e moveis incluem as modalidades velocidade, avanco de sinal, faixa exclusiva, conversao proibida e retorno proibido. Os mesmos atributos sao usados na aba de filtros; textos e booleanos usam selecao por valores, e atributos numericos aceitam intervalo minimo e maximo.

As localizacoes de demonstracao recebem CEPs e logradouros ficticios, identificados como demonstrativos. O servico `database-migrate` preenche esses campos quando estiverem vazios em volumes ja existentes.

## Instalacao e uso

Use Python 3.10+ e MySQL 8.0. No diretorio do projeto:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
py -m pip install -r database\requirements.txt
py database\generate_census_sectors.py
mysql -u root -p < database\schema.sql
py database\generate_data.py --seed 20261020
mysql -u root -p fogo < database\seed.sql
```

A primeira geracao requer acesso ao OpenStreetMap/Overpass para obter a malha, que fica em cache no arquivo GraphML. Se a obtencao falhar, a geracao para com erro; nao substitui rotas por linhas inventadas.

`generate_census_sectors.py` baixa a malha de Setores Censitários do Censo 2022 do IBGE (município de Marília, código 3529005) e grava os limites oficiais em WGS84 em `api/data/setores-censitarios-marilia-2022.geojson`. O arquivo compactado da malha estadual fica em `cache/` e não é necessário no runtime. A previsão associa cada ocorrência ao setor que contém suas coordenadas, agrupa setores contíguos em áreas estáveis e aplica maior peso aos dados recentes em um histórico de até 156 semanas. Esses setores são unidades censitárias, não bairros.

O Docker Compose monta `schema.sql` e `seed.sql` para inicializar um banco vazio. Em um volume existente, `database-migrate` aplica migrações idempotentes. `migrate_occurrences.sql` acrescenta IDs históricos ausentes; `migrate_occurrence_resolution.sql` adiciona a coluna e atualiza gravidade e tempos apenas nas ocorrências sintéticas, preservando outros registros. A API aguarda as migrações. Não remova `fogo_mysql_data`, pois isso apagaria os dados.

Para validar o seed offline, conferir as viagens ativas e verificar os limites geograficos, execute `py database\validate_data.py --seed-sql database\seed.sql`. Para validar uma base importada, configure `MYSQL_*` e execute `py database\validate_data.py`.

## Observacoes

O grafo OSM e os setores censitários IBGE 2022 usam geometria geográfica. Equipamentos, agentes, eventos, endereços e padrões analíticos continuam sintéticos. As regiões e os bairros do seed também continuam demonstrativos; a previsão usa áreas estáveis formadas pela união de setores censitários contíguos. A massa usa IDs deterministas e data corrente para que as viagens ativas estejam atuais no momento da geração.

Turnos de agentes: o gerador cria turnos em atividade e programados, sem encerramento e vinculados a veículos operacionais. Viaturas comportam até dois agentes; radar móvel e motocicleta comportam um. A API `/api/agentes` calcula a posição compartilhada usando o GPS mais recente do veículo. A tela é somente para consulta.
