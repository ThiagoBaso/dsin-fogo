# F.O.G.O.

Aplicação local dividida em frontend React, API FastAPI e banco MySQL 8.0. O Compose inicia os três serviços e, no primeiro início com volume vazio, importa o schema e a massa sintética já gerada.

## Estrutura

- `front/`: painel React e configuração Nginx.
- `api/`: API FastAPI para equipamentos, viagens, posições GPS e agentes em turno.
- `database/`: schema MySQL, DER, geradores, validador e `seed.sql`.
- `docker-compose.yml`: serviços, rede, portas, volume persistente e ordem de inicialização.

## Iniciar com Docker

Requer Docker Desktop com Compose. Copie o exemplo de ambiente para `.env`, altere as senhas locais e suba a aplicação:

```powershell
Copy-Item .env.docker.example .env
docker compose up --build
```

Endereços padrão:

- Painel: <http://localhost:8081>
- API e documentação: <http://localhost:8000/docs>
- MySQL: `localhost:3307` (database `fogo`)

O frontend busca os equipamentos pela API em `/api/equipamentos`; o Nginx encaminha as chamadas para o serviço `api`. A API também expõe `/api/viagens`, `/api/viagens/{id}/posicoes` e `/api/agentes`. A posição de um agente em turno acompanha o GPS do veículo vinculado.

O MySQL executa `database/schema.sql` e `database/seed.sql` somente quando o volume `fogo_mysql_data` está vazio. `docker compose down` preserva o banco. Para não perder dados locais, não remova o volume sem intenção explícita.

## Validar dados

Com o ambiente Docker rodando, a API usa a base carregada automaticamente. A massa também pode ser conferida sem subir containers:

```powershell
.\.venv\Scripts\python.exe database\validate_data.py --seed-sql database\seed.sql
```

Para regenerar o SQL mantendo a seed reproduzível (é preciso ter instalado `database/requirements.txt` e acesso ao OpenStreetMap na primeira execução):

```powershell
.\.venv\Scripts\python.exe database\generate_data.py --seed 20261020
```

## Desenvolvimento do frontend

```powershell
Set-Location front
npm ci
npm start
```

O modo de desenvolvimento do React chama a API em `/api`; use o proxy de desenvolvimento do CRA ou defina `REACT_APP_API_URL` para o endereço da API. A imagem Docker de produção usa Nginx e encaminha `/api` internamente.
