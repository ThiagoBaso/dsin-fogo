"""F.O.G.O. read API for the React dashboard."""
from __future__ import annotations

import os
from contextlib import closing
from datetime import datetime

import mysql.connector
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="F.O.G.O. API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:8081,http://localhost:3000").split(","),
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


def connect():
    return mysql.connector.connect(
        host=os.getenv("MYSQL_HOST", "database"),
        port=int(os.getenv("MYSQL_PORT", "3306")),
        user=os.environ["MYSQL_USER"],
        password=os.environ["MYSQL_PASSWORD"],
        database=os.getenv("MYSQL_DATABASE", "fogo"),
        connection_timeout=5,
        charset="utf8mb4",
    )


def fetch_all(query: str, params: tuple = ()):
    try:
        with closing(connect()) as db:
            cursor = db.cursor(dictionary=True)
            cursor.execute(query, params)
            rows = cursor.fetchall()
            cursor.close()
            # Some existing imports stored UTF-8 text as Latin-1. Normalize only
            # recoverable strings on reads, preserving the stored data.
            for row in rows:
                for key, value in row.items():
                    if isinstance(value, str):
                        try:
                            row[key] = value.encode("latin1").decode("utf-8")
                        except (UnicodeEncodeError, UnicodeDecodeError):
                            pass
            return rows
    except mysql.connector.Error as exc:
        raise HTTPException(status_code=503, detail="Banco de dados indisponível") from exc


def attach_equipment_attributes(equipment_rows: list[dict]):
    if not equipment_rows:
        return equipment_rows

    equipment_ids = [row["id"] for row in equipment_rows]
    placeholders = ",".join(["%s"] * len(equipment_ids))
    attributes = fetch_all(
        f"""
        SELECT v.id_equipamento, a.id_atributo AS id, a.nome, a.tipo_valor, a.unidade,
               v.valor_texto, CAST(v.valor_numero AS DOUBLE) AS valor_numero, v.valor_booleano
        FROM valores_atributo v
        JOIN atributos_tipo a ON a.id_atributo = v.id_atributo
        WHERE v.id_equipamento IN ({placeholders})
        ORDER BY v.id_equipamento, a.id_atributo
        """,
        tuple(equipment_ids),
    )
    by_equipment: dict[int, list[dict]] = {equipment_id: [] for equipment_id in equipment_ids}
    for attribute in attributes:
        value_key = {"texto": "valor_texto", "numero": "valor_numero", "booleano": "valor_booleano"}[attribute["tipo_valor"]]
        value = attribute[value_key]
        if attribute["tipo_valor"] == "booleano" and value is not None:
            value = bool(value)
        by_equipment[attribute["id_equipamento"]].append({
            "id": attribute["id"],
            "nome": attribute["nome"],
            "tipo_valor": attribute["tipo_valor"],
            "unidade": attribute["unidade"],
            "valor": value,
        })

    for equipment in equipment_rows:
        equipment["atributos"] = applicable_equipment_attributes(
            equipment["tipo_id"], by_equipment[equipment["id"]])
    return equipment_rows


def applicable_equipment_attributes(equipment_type_id: int, attributes: list[dict]):
    if equipment_type_id not in (1, 2):
        return attributes
    modality = next((attribute["valor"] for attribute in attributes if attribute["nome"] == "modalidade"), None)
    if modality == "velocidade":
        return attributes
    return [attribute for attribute in attributes if attribute["nome"] != "limite_velocidade"]


@app.get("/api/health")
def health():
    rows = fetch_all("SELECT 1 AS ok")
    return {"status": "ok", "database": bool(rows and rows[0]["ok"] == 1)}


@app.get("/api/agentes")
def list_agentes(em: datetime | None = None):
    rows = fetch_all(
        """
        SELECT a.id_agente AS id, a.nome, a.matricula, a.cargo,
               a.ativo_cadastro,
               o.id_orgao AS orgao_id, o.nome AS orgao_nome, o.sigla AS orgao_sigla,
               turno.id_turno AS turno_id,
               CASE WHEN %s IS NOT NULL AND turno.id_turno IS NOT NULL THEN 'em_atividade'
                    ELSE turno.status END AS turno_status,
               turno.inicio_previsto AS turno_inicio_previsto,
               turno.fim_previsto AS turno_fim_previsto,
               turno.id_equipamento AS veiculo_id,
               veiculo.numero_serie AS veiculo_numero_serie,
               veiculo.marca AS veiculo_marca, veiculo.modelo AS veiculo_modelo,
               veiculo_tipo.nome AS veiculo_tipo,
               CAST(COALESCE(pos.latitude, veiculo_local.latitude, base.latitude) AS DOUBLE) AS latitude,
               CAST(COALESCE(pos.longitude, veiculo_local.longitude, base.longitude) AS DOUBLE) AS longitude,
               COALESCE(veiculo_local.logradouro, base.logradouro) AS logradouro,
               COALESCE(veiculo_local.referencia, base.referencia) AS referencia,
               COALESCE(veiculo_bairro.nome, base_bairro.nome) AS bairro,
               COALESCE(veiculo_regiao.nome, base_regiao.nome) AS regiao,
               COALESCE(veiculo_local.cidade, base.cidade) AS cidade,
               COALESCE(veiculo_local.uf, base.uf) AS uf,
               COALESCE(veiculo_local.cep, base.cep) AS cep,
               pos.registrado_em AS posicao_registrada_em,
               CASE WHEN pos.id_posicao IS NOT NULL THEN 'gps_veiculo'
                    WHEN turno.id_equipamento IS NOT NULL AND veiculo_local.latitude IS NOT NULL THEN 'base_veiculo'
                    ELSE 'base_agente' END AS origem_posicao
        FROM agentes a
        JOIN orgaos o ON o.id_orgao = a.id_orgao
        LEFT JOIN localizacoes base ON base.id_localizacao = a.id_localizacao_base
        LEFT JOIN bairros base_bairro ON base_bairro.id_bairro = base.id_bairro
        LEFT JOIN regioes base_regiao ON base_regiao.id_regiao = base_bairro.id_regiao
        LEFT JOIN turnos_agente turno ON turno.id_turno = (
            SELECT t.id_turno
            FROM turnos_agente t
            WHERE t.id_agente = a.id_agente
              AND (
                (%s IS NULL AND t.status IN ('em_atividade', 'programado'))
                OR (
                  %s IS NOT NULL
                  AND COALESCE(t.inicio_real, t.inicio_previsto) <= %s
                  AND COALESCE(t.fim_real, t.fim_previsto) >= %s
                )
              )
            ORDER BY CASE t.status WHEN 'em_atividade' THEN 0 WHEN 'programado' THEN 1 ELSE 2 END,
                     t.inicio_previsto DESC, t.id_turno DESC
            LIMIT 1
        )
        LEFT JOIN equipamentos veiculo ON veiculo.id_equipamento = turno.id_equipamento
        LEFT JOIN tipos_equipamento veiculo_tipo ON veiculo_tipo.id_tipo = veiculo.id_tipo
        LEFT JOIN localizacoes veiculo_local ON veiculo_local.id_localizacao = veiculo.id_localizacao
        LEFT JOIN bairros veiculo_bairro ON veiculo_bairro.id_bairro = veiculo_local.id_bairro
        LEFT JOIN regioes veiculo_regiao ON veiculo_regiao.id_regiao = veiculo_bairro.id_regiao
        LEFT JOIN posicoes_equipamento pos ON pos.id_posicao = (
            SELECT p.id_posicao
            FROM posicoes_equipamento p
            WHERE p.id_equipamento = veiculo.id_equipamento
              AND p.id_viagem IS NOT NULL
              AND (%s IS NULL OR p.registrado_em <= %s)
            ORDER BY p.registrado_em DESC, p.id_posicao DESC
            LIMIT 1
        )
        ORDER BY a.id_agente
        """,
        (em, em, em, em, em, em, em),
    )
    for row in rows:
        row["ativo_cadastro"] = bool(row["ativo_cadastro"])
    return rows


@app.get("/api/equipamentos")
def list_equipamentos(em: datetime | None = None):
    if em is not None:
        rows = fetch_all(
            """
            SELECT e.id_equipamento AS id,
                   CONCAT(t.nome, ' ', e.numero_serie) AS nome,
                   e.numero_serie,
                   t.id_tipo AS tipo_id, t.nome AS tipo, t.mobilidade,
                   s.id_situacao AS situacao_id, s.nome AS situacao,
                   CAST(COALESCE(pos.latitude, l.latitude) AS DOUBLE) AS latitude,
                   CAST(COALESCE(pos.longitude, l.longitude) AS DOUBLE) AS longitude,
                   CAST(l.latitude AS DOUBLE) AS latitude_fixa,
                   CAST(l.longitude AS DOUBLE) AS longitude_fixa,
                   CAST(pos.latitude AS DOUBLE) AS latitude_gps,
                   CAST(pos.longitude AS DOUBLE) AS longitude_gps,
                   l.logradouro, l.referencia, l.cep, l.cidade, l.uf,
                   b.nome AS bairro, r.nome AS regiao,
                   CASE WHEN s.disponivel = 1 THEN 'ativo' ELSE 'inativo' END AS status
            FROM equipamentos e
            JOIN tipos_equipamento t ON t.id_tipo = e.id_tipo
            LEFT JOIN historico_situacoes hs ON hs.id_historico = (
                SELECT h.id_historico
                FROM historico_situacoes h
                WHERE h.id_equipamento = e.id_equipamento AND h.iniciado_em <= %s
                ORDER BY h.iniciado_em DESC, h.id_historico DESC
                LIMIT 1
            )
            JOIN situacoes_equipamento s ON s.id_situacao = COALESCE(hs.id_situacao, e.id_situacao)
            LEFT JOIN localizacoes l ON l.id_localizacao = e.id_localizacao
            LEFT JOIN bairros b ON b.id_bairro = l.id_bairro
            LEFT JOIN regioes r ON r.id_regiao = b.id_regiao
            LEFT JOIN posicoes_equipamento pos ON pos.id_posicao = (
                SELECT p.id_posicao
                FROM posicoes_equipamento p
                WHERE p.id_equipamento = e.id_equipamento
                  AND p.id_viagem IS NOT NULL
                  AND p.registrado_em <= %s
                ORDER BY p.registrado_em DESC, p.id_posicao DESC
                LIMIT 1
            )
            WHERE e.cadastrado_em <= %s
              AND (e.instalado_em IS NULL OR e.instalado_em <= %s)
            ORDER BY e.id_equipamento
            """,
            (em, em, em, em),
        )
        return attach_equipment_attributes(rows)

    rows = fetch_all(
        """
        SELECT e.id_equipamento AS id,
               CONCAT(t.nome, ' ', e.numero_serie) AS nome,
               e.numero_serie,
               t.id_tipo AS tipo_id,
               t.nome AS tipo,
               t.mobilidade,
               s.id_situacao AS situacao_id,
               s.nome AS situacao,
               CAST(COALESCE(pos.latitude, l.latitude) AS DOUBLE) AS latitude,
               CAST(COALESCE(pos.longitude, l.longitude) AS DOUBLE) AS longitude,
               CAST(l.latitude AS DOUBLE) AS latitude_fixa,
               CAST(l.longitude AS DOUBLE) AS longitude_fixa,
               CAST(pos.latitude AS DOUBLE) AS latitude_gps,
               CAST(pos.longitude AS DOUBLE) AS longitude_gps,
               l.logradouro, l.referencia, l.cep, l.cidade, l.uf,
               b.nome AS bairro, r.nome AS regiao,
               CASE WHEN s.disponivel = 1 THEN 'ativo' ELSE 'inativo' END AS status
        FROM equipamentos e
        JOIN tipos_equipamento t ON t.id_tipo = e.id_tipo
        JOIN situacoes_equipamento s ON s.id_situacao = e.id_situacao
        LEFT JOIN localizacoes l ON l.id_localizacao = e.id_localizacao
        LEFT JOIN bairros b ON b.id_bairro = l.id_bairro
        LEFT JOIN regioes r ON r.id_regiao = b.id_regiao
        LEFT JOIN posicoes_equipamento pos ON pos.id_posicao = (
            SELECT p.id_posicao
            FROM posicoes_equipamento p
            WHERE p.id_equipamento = e.id_equipamento AND p.id_viagem IS NOT NULL
            ORDER BY p.registrado_em DESC, p.id_posicao DESC
            LIMIT 1
        )
        ORDER BY e.id_equipamento
        """
    )
    return attach_equipment_attributes(rows)


@app.get("/api/equipamentos/{equipamento_id}")
def get_equipamento(equipamento_id: int, em: datetime | None = None):
    if em is None:
        rows = fetch_all(
        """
        SELECT e.id_equipamento AS id, e.numero_serie, e.marca, e.modelo,
               e.cadastrado_em, e.instalado_em,
               t.id_tipo AS tipo_id, t.nome AS tipo, t.mobilidade,
               s.id_situacao AS situacao_id, s.nome AS situacao,
               o.nome AS orgao_nome, o.sigla AS orgao_sigla,
               l.logradouro, l.referencia, l.cep, l.cidade, l.uf,
               b.nome AS bairro, r.nome AS regiao,
               CAST(COALESCE(pos.latitude, l.latitude) AS DOUBLE) AS latitude,
               CAST(COALESCE(pos.longitude, l.longitude) AS DOUBLE) AS longitude,
               pos.registrado_em AS posicao_registrada_em,
               CAST(pos.velocidade_kmh AS DOUBLE) AS velocidade_kmh
        FROM equipamentos e
        JOIN tipos_equipamento t ON t.id_tipo = e.id_tipo
        JOIN situacoes_equipamento s ON s.id_situacao = e.id_situacao
        JOIN orgaos o ON o.id_orgao = e.id_orgao
        LEFT JOIN localizacoes l ON l.id_localizacao = e.id_localizacao
        LEFT JOIN bairros b ON b.id_bairro = l.id_bairro
        LEFT JOIN regioes r ON r.id_regiao = b.id_regiao
        LEFT JOIN posicoes_equipamento pos ON pos.id_posicao = (
            SELECT p.id_posicao FROM posicoes_equipamento p
            WHERE p.id_equipamento = e.id_equipamento AND p.id_viagem IS NOT NULL
            ORDER BY p.registrado_em DESC, p.id_posicao DESC LIMIT 1
        )
        WHERE e.id_equipamento = %s
        """,
        (equipamento_id,),
        )
    else:
        rows = fetch_all(
            """
            SELECT e.id_equipamento AS id, e.numero_serie, e.marca, e.modelo,
                   e.cadastrado_em, e.instalado_em,
                   t.id_tipo AS tipo_id, t.nome AS tipo, t.mobilidade,
                   s.id_situacao AS situacao_id, s.nome AS situacao,
                   o.nome AS orgao_nome, o.sigla AS orgao_sigla,
                   l.logradouro, l.referencia, l.cep, l.cidade, l.uf,
                   b.nome AS bairro, r.nome AS regiao,
                   CAST(COALESCE(pos.latitude, l.latitude) AS DOUBLE) AS latitude,
                   CAST(COALESCE(pos.longitude, l.longitude) AS DOUBLE) AS longitude,
                   pos.registrado_em AS posicao_registrada_em,
                   CAST(pos.velocidade_kmh AS DOUBLE) AS velocidade_kmh
            FROM equipamentos e
            JOIN tipos_equipamento t ON t.id_tipo = e.id_tipo
            LEFT JOIN historico_situacoes hs ON hs.id_historico = (
                SELECT h.id_historico FROM historico_situacoes h
                WHERE h.id_equipamento = e.id_equipamento AND h.iniciado_em <= %s
                ORDER BY h.iniciado_em DESC, h.id_historico DESC LIMIT 1
            )
            JOIN situacoes_equipamento s ON s.id_situacao = COALESCE(hs.id_situacao, e.id_situacao)
            JOIN orgaos o ON o.id_orgao = e.id_orgao
            LEFT JOIN localizacoes l ON l.id_localizacao = e.id_localizacao
            LEFT JOIN bairros b ON b.id_bairro = l.id_bairro
            LEFT JOIN regioes r ON r.id_regiao = b.id_regiao
            LEFT JOIN posicoes_equipamento pos ON pos.id_posicao = (
                SELECT p.id_posicao FROM posicoes_equipamento p
                WHERE p.id_equipamento = e.id_equipamento
                  AND p.id_viagem IS NOT NULL AND p.registrado_em <= %s
                ORDER BY p.registrado_em DESC, p.id_posicao DESC LIMIT 1
            )
            WHERE e.id_equipamento = %s
              AND e.cadastrado_em <= %s
              AND (e.instalado_em IS NULL OR e.instalado_em <= %s)
            """,
            (em, em, equipamento_id, em, em),
        )
    if not rows:
        raise HTTPException(status_code=404, detail="Equipamento não encontrado")
    equipamento = rows[0]
    atributos = fetch_all(
        """
        SELECT a.id_atributo AS id, a.nome, a.tipo_valor, a.unidade,
               v.valor_texto, CAST(v.valor_numero AS DOUBLE) AS valor_numero,
               v.valor_booleano
        FROM atributos_tipo a
        LEFT JOIN valores_atributo v ON v.id_atributo = a.id_atributo
                                    AND v.id_equipamento = %s
        WHERE a.id_tipo = %s ORDER BY a.id_atributo
        """,
        (equipamento_id, equipamento["tipo_id"]),
    )
    equipamento["atributos"] = []
    for atributo in atributos:
        tipo = atributo["tipo_valor"]
        valor = atributo[{"texto": "valor_texto", "numero": "valor_numero", "booleano": "valor_booleano"}[tipo]]
        if tipo == "booleano" and valor is not None:
            valor = bool(valor)
        equipamento["atributos"].append({
            "id": atributo["id"], "nome": atributo["nome"],
            "tipo_valor": tipo, "unidade": atributo["unidade"], "valor": valor,
        })
    equipamento["atributos"] = applicable_equipment_attributes(
        equipamento["tipo_id"], equipamento["atributos"])
    return equipamento


@app.get("/api/equipamentos/{equipamento_id}/ocorrencias")
def list_ocorrencias_equipamento(equipamento_id: int, em: datetime | None = None):
    return fetch_all(
        """
        SELECT o.id_ocorrencia AS id, o.tipo, o.gravidade, o.status,
               o.descricao, o.ocorrida_em,
               l.logradouro, b.nome AS bairro, l.cidade, l.uf
        FROM ocorrencias o
        LEFT JOIN localizacoes l ON l.id_localizacao = o.id_localizacao
        LEFT JOIN bairros b ON b.id_bairro = l.id_bairro
        WHERE o.id_equipamento = %s
          AND (%s IS NULL OR o.ocorrida_em <= %s)
        ORDER BY o.ocorrida_em DESC, o.id_ocorrencia DESC
        """,
        (equipamento_id, em, em),
    )


@app.get("/api/equipamentos/{equipamento_id}/manutencoes")
def list_manutencoes_equipamento(equipamento_id: int):
    return fetch_all(
        """
        SELECT id_manutencao AS id, modalidade, prioridade, status, descricao,
               aberta_em, prevista_para, iniciada_em, concluida_em
        FROM manutencoes
        WHERE id_equipamento = %s
        ORDER BY CASE WHEN status IN ('pendente', 'agendada', 'em_execucao') THEN 0 ELSE 1 END,
                 CASE WHEN prevista_para IS NULL THEN 1 ELSE 0 END,
                 prevista_para ASC, aberta_em DESC, id_manutencao DESC
        """,
        (equipamento_id,),
    )


@app.get("/api/equipamentos/{equipamento_id}/viagens")
def list_viagens_equipamento(
    equipamento_id: int,
    limit: int = Query(default=10, ge=1, le=30),
    offset: int = Query(default=0, ge=0),
):
    viagens = fetch_all(
        """
        SELECT v.id_viagem AS id, v.id_equipamento, e.numero_serie,
               v.inicio_em, v.fim_em, CAST(v.distancia_m AS DOUBLE) AS distancia_m,
               v.situacao
        FROM viagens v
        JOIN equipamentos e ON e.id_equipamento = v.id_equipamento
        WHERE v.id_equipamento = %s
          AND EXISTS (SELECT 1 FROM posicoes_equipamento p WHERE p.id_viagem = v.id_viagem)
        ORDER BY v.inicio_em DESC, v.id_viagem DESC
        LIMIT %s OFFSET %s
        """,
        (equipamento_id, limit, offset),
    )
    if not viagens:
        return []

    viagem_ids = [viagem["id"] for viagem in viagens]
    placeholders = ",".join(["%s"] * len(viagem_ids))
    posicoes = fetch_all(
        f"""
        SELECT id_viagem, CAST(latitude AS DOUBLE) AS latitude,
               CAST(longitude AS DOUBLE) AS longitude, registrado_em
        FROM posicoes_equipamento
        WHERE id_viagem IN ({placeholders})
        ORDER BY id_viagem, registrado_em, id_posicao
        """,
        tuple(viagem_ids),
    )

    por_viagem: dict[int, list[dict]] = {viagem_id: [] for viagem_id in viagem_ids}
    for posicao in posicoes:
        por_viagem[posicao["id_viagem"]].append({
            "latitude": posicao["latitude"],
            "longitude": posicao["longitude"],
            "registrado_em": posicao["registrado_em"],
        })

    for viagem in viagens:
        pontos = por_viagem[viagem["id"]]
        if len(pontos) > 80:
            ultimo_indice = len(pontos) - 1
            indices = [round(index * ultimo_indice / 79) for index in range(80)]
            pontos = [pontos[index] for index in indices]
        viagem["posicoes"] = pontos
    return viagens


@app.get("/api/viagens")
def list_viagens(limit: int = Query(default=100, ge=1, le=500)):
    return fetch_all(
        """
        SELECT v.id_viagem AS id, v.id_equipamento, e.numero_serie,
               v.inicio_em, v.fim_em, v.distancia_m, v.situacao
        FROM viagens v JOIN equipamentos e ON e.id_equipamento = v.id_equipamento
        ORDER BY v.inicio_em DESC LIMIT %s
        """,
        (limit,),
    )


@app.get("/api/viagens/rotas-ativas")
def list_rotas_ativas(
    equipamento_ids: list[int] = Query(default=[]),
    em: datetime | None = None,
):
    """Return active trip paths for selected mobile equipment, optionally as of a time."""
    ids = list(dict.fromkeys(equipamento_ids))
    if not ids:
        return []

    placeholders = ",".join(["%s"] * len(ids))
    params: tuple = tuple(ids)
    as_of_clause = ""
    if em is not None:
        as_of_clause = " AND v.inicio_em <= %s"
        params += (em,)
    trips = fetch_all(
        f"""
        SELECT v.id_viagem AS id, v.id_equipamento, e.numero_serie,
               v.inicio_em, v.fim_em, v.distancia_m, v.situacao
        FROM viagens v
        JOIN equipamentos e ON e.id_equipamento = v.id_equipamento
        JOIN tipos_equipamento t ON t.id_tipo = e.id_tipo
        WHERE v.situacao = 'em_andamento'
          AND t.mobilidade = 'movel'
          AND v.id_equipamento IN ({placeholders}){as_of_clause}
        ORDER BY v.id_equipamento, v.inicio_em DESC
        """,
        params,
    )
    if not trips:
        return []

    trip_ids = [trip["id"] for trip in trips]
    trip_placeholders = ",".join(["%s"] * len(trip_ids))
    position_params: tuple = tuple(trip_ids)
    position_as_of_clause = ""
    if em is not None:
        position_as_of_clause = " AND registrado_em <= %s"
        position_params += (em,)
    positions = fetch_all(
        f"""
        SELECT id_viagem, CAST(latitude AS DOUBLE) AS latitude,
               CAST(longitude AS DOUBLE) AS longitude, registrado_em
        FROM posicoes_equipamento
        WHERE id_viagem IN ({trip_placeholders}){position_as_of_clause}
        ORDER BY id_viagem, registrado_em, id_posicao
        """,
        position_params,
    )
    by_trip: dict[int, list[dict]] = {trip_id: [] for trip_id in trip_ids}
    for position in positions:
        by_trip[position["id_viagem"]].append({
            "latitude": position["latitude"],
            "longitude": position["longitude"],
            "registrado_em": position["registrado_em"],
        })
    for trip in trips:
        trip["posicoes"] = by_trip[trip["id"]]
    return trips


@app.get("/api/viagens/{viagem_id}/posicoes")
def list_posicoes(viagem_id: int):
    rows = fetch_all(
        """
        SELECT id_posicao, CAST(latitude AS DOUBLE) AS latitude,
               CAST(longitude AS DOUBLE) AS longitude,
               CAST(velocidade_kmh AS DOUBLE) AS velocidade_kmh, registrado_em
        FROM posicoes_equipamento
        WHERE id_viagem = %s
        ORDER BY registrado_em, id_posicao
        """,
        (viagem_id,),
    )
    if not rows:
        exists = fetch_all("SELECT id_viagem FROM viagens WHERE id_viagem = %s", (viagem_id,))
        if not exists:
            raise HTTPException(status_code=404, detail="Viagem não encontrada")
    return rows
