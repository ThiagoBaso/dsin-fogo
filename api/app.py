"""F.O.G.O. read API for the React dashboard."""
from __future__ import annotations

import os
from contextlib import closing

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
            return rows
    except mysql.connector.Error as exc:
        raise HTTPException(status_code=503, detail="Banco de dados indisponível") from exc


@app.get("/api/health")
def health():
    rows = fetch_all("SELECT 1 AS ok")
    return {"status": "ok", "database": bool(rows and rows[0]["ok"] == 1)}


@app.get("/api/equipamentos")
def list_equipamentos():
    return fetch_all(
        """
        SELECT e.id_equipamento AS id,
               CONCAT(t.nome, ' ', e.numero_serie) AS nome,
               t.id_tipo AS tipo_id,
               t.nome AS tipo,
               s.id_situacao AS situacao_id,
               s.nome AS situacao,
               CAST(COALESCE(pos.latitude, l.latitude) AS DOUBLE) AS latitude,
               CAST(COALESCE(pos.longitude, l.longitude) AS DOUBLE) AS longitude,
               CASE WHEN s.disponivel = 1 THEN 'ativo' ELSE 'inativo' END AS status
        FROM equipamentos e
        JOIN tipos_equipamento t ON t.id_tipo = e.id_tipo
        JOIN situacoes_equipamento s ON s.id_situacao = e.id_situacao
        LEFT JOIN localizacoes l ON l.id_localizacao = e.id_localizacao
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
