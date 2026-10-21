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


@app.get("/api/health")
def health():
    rows = fetch_all("SELECT 1 AS ok")
    return {"status": "ok", "database": bool(rows and rows[0]["ok"] == 1)}


@app.get("/api/equipamentos")
def list_equipamentos(em: datetime | None = None):
    if em is not None:
        return fetch_all(
            """
            SELECT e.id_equipamento AS id,
                   CONCAT(t.nome, ' ', e.numero_serie) AS nome,
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

    return fetch_all(
        """
        SELECT e.id_equipamento AS id,
               CONCAT(t.nome, ' ', e.numero_serie) AS nome,
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
    return equipamento


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
