# Banco de referencia F.O.G.O.

Schema de referencia para MySQL 8.0, baseado em `DER_FOGO.dbml`.

## Arquivos

- `DER_FOGO.dbml`: modelo logico.
- `schema.sql`: schema MySQL 8.0 / InnoDB / utf8mb4.
- `migrate_active_trips.sql`: non-destructive upgrade for an existing Compose database volume.
- `generate_data.py`: gera a massa SQL de demonstracao.
- `generate_routes.py`: cria e interpola rotas pela malha viaria OpenStreetMap de Marilia.
- `validate_data.py`: valida integridade, extremidades das viagens ativas e limites geograficos.
- `seed.sql`: massa de demonstracao aplicada junto ao schema em um banco novo.
- `marilia.graphml`: cache local da malha viaria OSM.

O schema inclui viagens em andamento e concluídas. O seed gera 180 viagens concluidas e uma viagem ativa para cada veiculo movel que esteja a mais de 100 m da sua localizacao cadastrada. Essas rotas demonstrativas ligam a localizacao cadastrada (base simulada) a ultima posicao GPS historica do veiculo. Cada rota tem ao menos 120 posicoes. Localizacoes, enderecos e viagens sao dados sinteticos e nao representam operacao real.

## Instalacao e uso

Use Python 3.10+ e MySQL 8.0. No diretorio do projeto:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
py -m pip install -r database\requirements.txt
mysql -u root -p < database\schema.sql
py database\generate_data.py --seed 20261020
mysql -u root -p fogo < database\seed.sql
```

A primeira geracao requer acesso ao OpenStreetMap/Overpass para obter a malha, que fica em cache no arquivo GraphML. Se a obtencao falhar, a geracao para com erro; nao substitui rotas por linhas inventadas.

O Docker Compose monta `schema.sql` e `seed.sql` como scripts de inicializacao do MySQL. O MySQL executa esses scripts somente quando cria um volume vazio. Para um volume existente, o servico `database-migrate` aplica a mudanca de viagens e inclui as rotas ativas de forma idempotente, preservando os outros dados. A API aguarda a migracao concluir. Nao remova `fogo_mysql_data`, pois isso apagaria os dados.

Para validar o seed offline, conferir as viagens ativas e verificar os limites geograficos, execute `py database\validate_data.py --seed-sql database\seed.sql`. Para validar uma base importada, configure `MYSQL_*` e execute `py database\validate_data.py`.

## Observacoes

O grafo OSM e geografico. Equipamentos, agentes, eventos, locais cadastrados, trajetos e padroes analiticos sao sinteticos. Bairros, setores e regioes nao sao divisoes oficiais de Marilia. A massa usa IDs deterministas e data corrente para que as viagens ativas estejam atuais no momento da geracao.
