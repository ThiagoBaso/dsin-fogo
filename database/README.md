# Banco de referência F.O.G.O.

Schema de referência para MySQL 8.0, baseado em `DER_FOGO.dbml`. O script cria tabelas e índices sem apagar tabelas ou dados preexistentes.

## Arquivos

- `DER_FOGO.dbml`: modelo lógico original.
- `schema.sql`: schema MySQL 8.0 / InnoDB / utf8mb4.
- `generate_data.py`: gera SQL de demonstração com seed reprodutível.
- `generate_routes.py`: baixa e guarda a malha viária de Marília em GraphML e interpola rotas nas vias.
- `validate_data.py`: valida quantidades e integridade básica no banco.
- `seed.sql`: saída gerada localmente, não versionada por padrão.
- `marilia.graphml`: cache da malha OSM, gerado na primeira execução.

O modelo original foi preservado e complementado com `viagens` e `posicoes_equipamento.id_viagem`/`velocidade_kmh`, além dos índices, checagens e enums para apoiar integridade e consultas. Cada rota tem no mínimo 120 posições; viagens maiores são amostradas em intervalos de até 10 m ao longo da geometria viária para que as linhas exibidas no mapa acompanhem as ruas. Endereços sintéticos não alegam ser ruas ou CEPs reais; suas coordenadas vêm de nós da malha do OpenStreetMap.

## Instalação e uso

Use Python 3.10+ e MySQL 8.0. No diretório do projeto:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
py -m pip install -r database\requirements.txt
mysql -u root -p < database\schema.sql
py database\generate_data.py --seed 20261020
mysql -u root -p fogo < database\seed.sql
```

A primeira geração requer acesso à API do OpenStreetMap/Overpass. O grafo é salvo em `database/marilia.graphml` e reutilizado nas seguintes execuções. Se a obtenção falhar, o processo para com erro explícito; não substitui rotas por linhas inventadas. É possível passar `--graph caminho.graphml` para usar outro cache OSM.

Para conferir os registros offline e medir o desvio da linha desenhada para as vias OSM, execute `py database\validate_data.py --seed-sql database\seed.sql`. Para validar dados já importados, configure as variáveis de conexão (veja `.env.example`) e execute `py database\validate_data.py`. O script lê variáveis `MYSQL_*` do ambiente; não lê `.env` automaticamente. A importação do `seed.sql` é destinada a um banco vazio de demonstração: usa IDs determinísticos e não apaga dados. Não importe em produção nem repita sobre a mesma base sem limpar a base de demonstração.

## Observações

O grafo OSM e as posições de dispositivos são geográficos reais ou fictícios, respectivamente: os equipamentos, agentes, eventos, trajetos e padrões analíticos são inteiramente sintéticos. Os setores/bairros e regiões desta massa são referências demonstrativas, não divisões oficiais de Marília. `seed.sql` e o GraphML são artefatos locais grandes; gere-os quando necessário em vez de mantê-los no repositório.
