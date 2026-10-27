"""F.O.G.O. read API for the React dashboard."""
from __future__ import annotations

import os
import math
import re
from collections import OrderedDict
from contextlib import closing
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from threading import Lock
from typing import Literal

import mysql.connector
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from forecasting import (
    HISTORY_WEEKS,
    backtest_period,
    build_occurrence_evaluation,
    build_occurrence_forecast,
    local_now,
)
from geography import (
    assign_occurrences_to_prediction_areas,
    census_sector_geojson,
    prediction_area_geojson,
    prediction_area_neighbors,
    prediction_areas,
)


class CadastroLocalizacao(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    bairro_id: int = Field(gt=0)
    cep: str | None = Field(default=None, max_length=9)
    cidade: str = Field(min_length=1, max_length=100)
    uf: str = Field(min_length=2, max_length=2)
    logradouro: str | None = Field(default=None, max_length=180)
    referencia: str | None = Field(default=None, max_length=255)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)

    @field_validator("cep")
    @classmethod
    def normalize_cep(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        digits = re.sub(r"\D", "", value)
        if len(digits) != 8:
            raise ValueError("O CEP deve ter oito dígitos.")
        return digits

    @field_validator("uf")
    @classmethod
    def normalize_uf(cls, value: str) -> str:
        return value.upper()


class AtributoCadastroEquipamento(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id_atributo: int = Field(gt=0)
    valor_texto: str | None = None
    valor_numero: float | None = None
    valor_booleano: bool | None = None


class ManutencaoCadastroEquipamento(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    modalidade: Literal["preventiva", "corretiva"]
    prioridade: Literal["imediata", "agendada"]
    status: Literal["pendente", "agendada"]
    descricao: str | None = Field(default=None, max_length=5000)
    prevista_para: datetime | None = None

    @field_validator("prevista_para")
    @classmethod
    def normalize_scheduled_at(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is not None:
            return value.astimezone(timezone(timedelta(hours=-3))).replace(tzinfo=None)
        return value

    @model_validator(mode="after")
    def validate_schedule(self):
        if self.prioridade == "agendada" and self.prevista_para is None:
            raise ValueError("Informe quando a manutenção agendada deve ocorrer.")
        if self.prioridade == "imediata" and self.status == "agendada":
            raise ValueError("Uma manutenção imediata não pode estar apenas agendada.")
        return self


class EquipamentoCadastro(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    tipo_id: int = Field(gt=0)
    orgao_id: int = Field(gt=0)
    situacao_id: int = Field(gt=0)
    numero_serie: str = Field(min_length=1, max_length=120)
    marca: str = Field(min_length=1, max_length=100)
    modelo: str = Field(min_length=1, max_length=100)
    instalado_em: datetime | None = None
    localizacao: CadastroLocalizacao
    atributos: list[AtributoCadastroEquipamento] = Field(default_factory=list)
    manutencao: ManutencaoCadastroEquipamento | None = None

    @field_validator("instalado_em")
    @classmethod
    def normalize_installed_at(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is not None:
            return value.astimezone(timezone(timedelta(hours=-3))).replace(tzinfo=None)
        return value


class AgenteCadastro(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    orgao_id: int = Field(gt=0)
    matricula: str = Field(min_length=1, max_length=60)
    nome: str = Field(min_length=1, max_length=150)
    cargo: str = Field(min_length=1, max_length=100)
    raio_atuacao_km: float = Field(ge=0.01, le=25)
    ativo_cadastro: bool = True
    localizacao: CadastroLocalizacao


class OcorrenciaCadastro(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    orgao_id: int = Field(gt=0)
    equipamento_id: int | None = Field(default=None, gt=0)
    tipo: str = Field(min_length=1, max_length=100)
    gravidade: Literal["baixa", "media", "alta", "critica"]
    status: Literal["aberta", "em_atendimento", "resolvida", "cancelada"] = "aberta"
    descricao: str | None = Field(default=None, max_length=10000)
    ocorrida_em: datetime
    resolvida_em: datetime | None = None
    localizacao: CadastroLocalizacao

    @field_validator("ocorrida_em", "resolvida_em")
    @classmethod
    def normalize_datetime(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is not None:
            return value.astimezone(timezone(timedelta(hours=-3))).replace(tzinfo=None)
        return value

    @model_validator(mode="after")
    def validate_resolution(self):
        if self.ocorrida_em > datetime.now(timezone(timedelta(hours=-3))).replace(tzinfo=None):
            raise ValueError("A data da ocorrência não pode estar no futuro.")
        if self.status == "resolvida" and self.resolvida_em is None:
            raise ValueError("Informe a data de resolução para uma ocorrência resolvida.")
        if self.status != "resolvida" and self.resolvida_em is not None:
            raise ValueError("Só ocorrências resolvidas podem ter data de resolução.")
        if self.resolvida_em is not None:
            if self.resolvida_em < self.ocorrida_em:
                raise ValueError("A resolução deve ocorrer depois da abertura da ocorrência.")
            if self.resolvida_em > datetime.now(timezone(timedelta(hours=-3))).replace(tzinfo=None):
                raise ValueError("A data de resolução não pode estar no futuro.")
        return self


app = FastAPI(title="F.O.G.O. API", version="1.0.0")
FORECAST_EVALUATION_CACHE_LIMIT = 2
forecast_evaluation_cache: OrderedDict[str, dict | None] = OrderedDict()
forecast_evaluation_cache_lock = Lock()
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:8081,http://localhost:3000").split(","),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
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


def fetch_forecast_occurrences(generated_at: datetime) -> tuple[list[dict], int]:
    backtest_start, _backtest_end = backtest_period(generated_at)
    history_start = backtest_start - timedelta(weeks=HISTORY_WEEKS + 2)
    occurrences = fetch_all(
        """
        SELECT o.ocorrida_em, o.gravidade,
               CAST(l.latitude AS DOUBLE) AS latitude,
               CAST(l.longitude AS DOUBLE) AS longitude
        FROM ocorrencias o
        JOIN localizacoes l ON l.id_localizacao = o.id_localizacao
        WHERE o.status <> 'cancelada'
          AND o.ocorrida_em >= %s
          AND o.ocorrida_em < %s
        ORDER BY o.ocorrida_em
        """,
        (history_start, generated_at),
    )
    return assign_occurrences_to_prediction_areas(occurrences)


def forecast_evaluation_cache_key(occurrences: list[dict], generated_at: datetime) -> str:
    period_start, period_end = backtest_period(generated_at)
    digest = sha256()
    digest.update(period_start.isoformat().encode("utf-8"))
    digest.update(b"|")
    digest.update(period_end.isoformat().encode("utf-8"))
    facts = sorted(
        (
            int(occurrence["area_id"]),
            occurrence["ocorrida_em"].isoformat()
            if isinstance(occurrence["ocorrida_em"], datetime)
            else str(occurrence["ocorrida_em"]),
            occurrence.get("gravidade") in {"alta", "critica"},
        )
        for occurrence in occurrences
        if occurrence.get("area_id") is not None and occurrence.get("ocorrida_em") is not None
    )
    for area_id, occurred_at, is_serious in facts:
        digest.update(f"\n{area_id}|{occurred_at}|{int(is_serious)}".encode("utf-8"))
    return digest.hexdigest()


def insert_localizacao(cursor, localizacao: CadastroLocalizacao) -> int:
    cursor.execute("SELECT 1 FROM bairros WHERE id_bairro = %s", (localizacao.bairro_id,))
    if cursor.fetchone() is None:
        raise HTTPException(status_code=422, detail="Selecione um bairro válido.")
    cursor.execute(
        """
        INSERT INTO localizacoes
            (id_bairro, cep, cidade, uf, logradouro, referencia, latitude, longitude)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            localizacao.bairro_id,
            localizacao.cep,
            localizacao.cidade,
            localizacao.uf,
            localizacao.logradouro or None,
            localizacao.referencia or None,
            localizacao.latitude,
            localizacao.longitude,
        ),
    )
    return int(cursor.lastrowid)


def run_create_transaction(operation, duplicate_detail: str):
    db = None
    cursor = None
    try:
        db = connect()
        cursor = db.cursor(dictionary=True)
        db.start_transaction()
        result = operation(cursor)
        db.commit()
        return result
    except HTTPException:
        if db is not None:
            db.rollback()
        raise
    except mysql.connector.IntegrityError as exc:
        if db is not None:
            db.rollback()
        if exc.errno == 1062:
            raise HTTPException(status_code=409, detail=duplicate_detail) from exc
        if exc.errno == 1452:
            raise HTTPException(status_code=422, detail="Uma das referências selecionadas não existe.") from exc
        raise HTTPException(status_code=409, detail="Os dados não atendem às regras do cadastro.") from exc
    except mysql.connector.Error as exc:
        if db is not None:
            db.rollback()
        raise HTTPException(status_code=503, detail="Não foi possível gravar o cadastro no banco de dados.") from exc
    finally:
        if cursor is not None:
            cursor.close()
        if db is not None:
            db.close()


def insert_atributos_equipamento(
    cursor,
    equipamento_id: int,
    tipo_id: int,
    submitted_attributes: list[AtributoCadastroEquipamento],
) -> None:
    cursor.execute(
        """
        SELECT id_atributo, nome, tipo_valor, obrigatorio
        FROM atributos_tipo
        WHERE id_tipo = %s
        ORDER BY id_atributo
        """,
        (tipo_id,),
    )
    definitions = cursor.fetchall()
    if not definitions:
        cursor.execute("SELECT 1 FROM tipos_equipamento WHERE id_tipo = %s", (tipo_id,))
        if cursor.fetchone() is None:
            raise HTTPException(status_code=422, detail="Selecione um tipo de equipamento válido.")

    submitted_by_id: dict[int, AtributoCadastroEquipamento] = {}
    for submitted in submitted_attributes:
        if submitted.id_atributo in submitted_by_id:
            raise HTTPException(status_code=422, detail="Um atributo foi informado mais de uma vez.")
        submitted_by_id[submitted.id_atributo] = submitted

    definition_by_id = {int(definition["id_atributo"]): definition for definition in definitions}
    unknown_ids = set(submitted_by_id) - set(definition_by_id)
    if unknown_ids:
        raise HTTPException(status_code=422, detail="Há atributos que não pertencem ao tipo de equipamento selecionado.")

    for definition in definitions:
        attribute_id = int(definition["id_atributo"])
        submitted = submitted_by_id.get(attribute_id)
        if submitted is None:
            if definition["obrigatorio"]:
                raise HTTPException(status_code=422, detail=f"Preencha o atributo obrigatório {definition['nome']}.")
            continue

        values = {
            "texto": submitted.valor_texto.strip() if submitted.valor_texto is not None else None,
            "numero": submitted.valor_numero,
            "booleano": submitted.valor_booleano,
        }
        values = {key: value for key, value in values.items() if value is not None and value != ""}
        expected_type = definition["tipo_valor"]
        if len(values) != 1 or expected_type not in values:
            raise HTTPException(status_code=422, detail=f"O valor do atributo {definition['nome']} tem formato inválido.")
        value = values[expected_type]
        if expected_type == "texto" and len(value) > 255:
            raise HTTPException(status_code=422, detail=f"O atributo {definition['nome']} excede o limite de texto.")
        if expected_type == "numero" and not math.isfinite(value):
            raise HTTPException(status_code=422, detail=f"O atributo {definition['nome']} precisa ser um número válido.")
        if definition["nome"] == "raio_cobertura_km" and not 0.01 <= value <= 100:
            raise HTTPException(status_code=422, detail="O raio de cobertura deve estar entre 0,01 e 100 km.")

        cursor.execute(
            """
            INSERT INTO valores_atributo
                (id_equipamento, id_atributo, valor_texto, valor_numero, valor_booleano)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                equipamento_id,
                attribute_id,
                value if expected_type == "texto" else None,
                value if expected_type == "numero" else None,
                value if expected_type == "booleano" else None,
            ),
        )


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


@app.get("/api/cadastros/opcoes")
def list_cadastro_opcoes():
    organizations = fetch_all(
        "SELECT id_orgao AS id, nome, sigla FROM orgaos ORDER BY nome"
    )
    equipment_types = fetch_all(
        "SELECT id_tipo AS id, nome, mobilidade FROM tipos_equipamento ORDER BY nome"
    )
    equipment_situations = fetch_all(
        "SELECT id_situacao AS id, nome, disponivel FROM situacoes_equipamento ORDER BY id_situacao"
    )
    equipment_attributes = fetch_all(
        """
        SELECT id_atributo AS id, id_tipo AS tipo_id, nome, tipo_valor, unidade, obrigatorio
        FROM atributos_tipo
        ORDER BY id_tipo, id_atributo
        """
    )
    neighborhoods = fetch_all(
        """
        SELECT b.id_bairro AS id, b.nome, r.nome AS regiao
        FROM bairros b
        JOIN regioes r ON r.id_regiao = b.id_regiao
        ORDER BY r.nome, b.nome
        """
    )
    equipment = fetch_all(
        """
        SELECT e.id_equipamento AS id, e.id_orgao AS orgao_id,
               e.numero_serie, e.modelo, t.nome AS tipo
        FROM equipamentos e
        JOIN tipos_equipamento t ON t.id_tipo = e.id_tipo
        ORDER BY e.numero_serie
        """
    )
    occurrence_types = fetch_all(
        "SELECT DISTINCT tipo FROM ocorrencias WHERE tipo <> '' ORDER BY tipo"
    )
    default_location = fetch_all(
        """
        SELECT cidade, uf
        FROM localizacoes
        GROUP BY cidade, uf
        ORDER BY COUNT(*) DESC, cidade, uf
        LIMIT 1
        """
    )
    for situation in equipment_situations:
        situation["disponivel"] = bool(situation["disponivel"])
    for attribute in equipment_attributes:
        attribute["obrigatorio"] = bool(attribute["obrigatorio"])
    return {
        "orgaos": organizations,
        "tipos_equipamento": equipment_types,
        "situacoes_equipamento": equipment_situations,
        "atributos_equipamento": equipment_attributes,
        "bairros": neighborhoods,
        "equipamentos": equipment,
        "tipos_ocorrencia": [row["tipo"] for row in occurrence_types],
        "localizacao_padrao": default_location[0] if default_location else {"cidade": "Marília", "uf": "SP"},
    }


@app.post("/api/equipamentos", status_code=201)
def create_equipamento(payload: EquipamentoCadastro):
    def insert(cursor):
        cursor.execute(
            "SELECT nome FROM situacoes_equipamento WHERE id_situacao = %s",
            (payload.situacao_id,),
        )
        situation = cursor.fetchone()
        if situation is None:
            raise HTTPException(status_code=422, detail="Selecione uma situação válida.")
        if situation["nome"].strip().casefold() == "ainda não instalado" and payload.instalado_em is not None:
            raise HTTPException(status_code=422, detail="Um equipamento ainda não instalado não pode ter data de instalação.")
        if payload.instalado_em is not None and payload.instalado_em > local_now():
            raise HTTPException(status_code=422, detail="A data de instalação não pode estar no futuro.")

        location_id = insert_localizacao(cursor, payload.localizacao)
        created_at = local_now()
        cursor.execute(
            """
            INSERT INTO equipamentos
                (id_tipo, id_orgao, id_localizacao, id_situacao, numero_serie, marca, modelo, cadastrado_em, instalado_em)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                payload.tipo_id,
                payload.orgao_id,
                location_id,
                payload.situacao_id,
                payload.numero_serie,
                payload.marca,
                payload.modelo,
                created_at,
                payload.instalado_em,
            ),
        )
        equipment_id = int(cursor.lastrowid)
        cursor.execute(
            """
            INSERT INTO historico_situacoes
                (id_equipamento, id_situacao, iniciado_em, encerrado_em, observacao)
            VALUES (%s, %s, %s, NULL, %s)
            """,
            (equipment_id, payload.situacao_id, created_at, "Situação informada no cadastro."),
        )
        insert_atributos_equipamento(cursor, equipment_id, payload.tipo_id, payload.atributos)

        if payload.manutencao is not None:
            if payload.manutencao.prevista_para is not None and payload.manutencao.prevista_para <= created_at:
                raise HTTPException(status_code=422, detail="A manutenção agendada deve ter uma data futura.")
            cursor.execute(
                """
                INSERT INTO manutencoes
                    (id_equipamento, modalidade, prioridade, status, descricao, aberta_em, prevista_para)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    equipment_id,
                    payload.manutencao.modalidade,
                    payload.manutencao.prioridade,
                    payload.manutencao.status,
                    payload.manutencao.descricao or None,
                    created_at,
                    payload.manutencao.prevista_para,
                ),
            )
        return {"id": equipment_id}

    return run_create_transaction(insert, "Já existe um equipamento com esse número de série.")


@app.post("/api/agentes", status_code=201)
def create_agente(payload: AgenteCadastro):
    def insert(cursor):
        location_id = insert_localizacao(cursor, payload.localizacao)
        cursor.execute(
            """
            INSERT INTO agentes
                (id_orgao, id_localizacao_base, matricula, nome, cargo, ativo_cadastro, raio_atuacao_km)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                payload.orgao_id,
                location_id,
                payload.matricula,
                payload.nome,
                payload.cargo,
                payload.ativo_cadastro,
                payload.raio_atuacao_km,
            ),
        )
        return {"id": int(cursor.lastrowid)}

    return run_create_transaction(insert, "Já existe um agente com essa matrícula neste órgão.")


@app.post("/api/ocorrencias", status_code=201)
def create_ocorrencia(payload: OcorrenciaCadastro):
    def insert(cursor):
        if payload.equipamento_id is not None:
            cursor.execute(
                "SELECT 1 FROM equipamentos WHERE id_equipamento = %s AND id_orgao = %s",
                (payload.equipamento_id, payload.orgao_id),
            )
            if cursor.fetchone() is None:
                raise HTTPException(status_code=422, detail="O equipamento deve pertencer ao Ã³rgÃ£o selecionado.")
        location_id = insert_localizacao(cursor, payload.localizacao)
        cursor.execute(
            """
            INSERT INTO ocorrencias
                (id_localizacao, id_orgao, id_equipamento, tipo, gravidade, status, descricao, ocorrida_em, resolvida_em)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                location_id,
                payload.orgao_id,
                payload.equipamento_id,
                payload.tipo,
                payload.gravidade,
                payload.status,
                payload.descricao or None,
                payload.ocorrida_em,
                payload.resolvida_em,
            ),
        )
        return {"id": int(cursor.lastrowid)}

    return run_create_transaction(insert, "Não foi possível cadastrar a ocorrência.")


@app.get("/api/ocorrencias/analise")
def list_ocorrencias_analise(
    modo: str = "atual",
    inicio: datetime | None = None,
    fim: datetime | None = None,
):
    if modo not in ("atual", "periodo"):
        raise HTTPException(status_code=422, detail="Modo de ocorrências inválido")
    if modo == "periodo" and (inicio is None or fim is None):
        raise HTTPException(status_code=422, detail="Informe a data inicial e final")
    if inicio is not None and fim is not None and inicio > fim:
        raise HTTPException(status_code=422, detail="A data inicial deve ser anterior à data final")

    return fetch_all(
        """
        SELECT o.id_ocorrencia AS id, o.tipo, o.gravidade, o.status,
               o.ocorrida_em, o.resolvida_em,
               CAST(l.latitude AS DOUBLE) AS latitude,
               CAST(l.longitude AS DOUBLE) AS longitude
        FROM ocorrencias o
        JOIN localizacoes l ON l.id_localizacao = o.id_localizacao
        WHERE (
            (%s = 'atual' AND o.status IN ('aberta', 'em_atendimento'))
            OR (%s = 'periodo' AND (
                o.ocorrida_em BETWEEN %s AND %s
                OR o.resolvida_em BETWEEN %s AND %s
            ))
        )
        ORDER BY COALESCE(o.resolvida_em, o.ocorrida_em), o.id_ocorrencia
        """,
        (modo, modo, inicio, fim, inicio, fim),
    )


@app.get("/api/previsoes/ocorrencias")
def forecast_ocorrencias():
    generated_at = local_now()
    mapped_occurrences, unmatched_count = fetch_forecast_occurrences(generated_at)
    result = build_occurrence_forecast(
        prediction_areas(),
        mapped_occurrences,
        generated_at,
        prediction_area_neighbors(),
        include_evaluation=False,
    )
    result["ocorrencias_fora_malha"] = unmatched_count
    return result


@app.get("/api/previsoes/ocorrencias/avaliacao")
def forecast_ocorrencias_avaliacao():
    generated_at = local_now()
    mapped_occurrences, _unmatched_count = fetch_forecast_occurrences(generated_at)
    cache_key = forecast_evaluation_cache_key(mapped_occurrences, generated_at)
    with forecast_evaluation_cache_lock:
        if cache_key in forecast_evaluation_cache:
            forecast_evaluation_cache.move_to_end(cache_key)
            return forecast_evaluation_cache[cache_key]

        evaluation = build_occurrence_evaluation(
            prediction_areas(),
            mapped_occurrences,
            generated_at,
            prediction_area_neighbors(),
        )
        forecast_evaluation_cache[cache_key] = evaluation
        while len(forecast_evaluation_cache) > FORECAST_EVALUATION_CACHE_LIMIT:
            forecast_evaluation_cache.popitem(last=False)
        return evaluation


@app.get("/api/setores-censitarios")
def list_census_sectors():
    return JSONResponse(
        content=census_sector_geojson(),
        headers={"Cache-Control": "public, max-age=86400"},
    )


@app.get("/api/areas-previsao")
def list_prediction_areas():
    return JSONResponse(
        content=prediction_area_geojson(),
        headers={"Cache-Control": "public, max-age=86400"},
    )


@app.get("/api/ocorrencias")
def list_ocorrencias_mapa(
    modo: str = "atual",
    inicio: datetime | None = None,
    fim: datetime | None = None,
):
    if modo not in ("atual", "periodo"):
        raise HTTPException(status_code=422, detail="Modo de ocorrências inválido")
    if modo == "periodo" and (inicio is None or fim is None):
        raise HTTPException(status_code=422, detail="Informe a data inicial e final")
    if inicio is not None and fim is not None and inicio > fim:
        raise HTTPException(status_code=422, detail="A data inicial deve ser anterior à data final")

    return fetch_all(
        """
        SELECT o.id_ocorrencia AS id, o.tipo, o.gravidade, o.status,
               o.descricao, o.ocorrida_em, o.resolvida_em,
               CAST(l.latitude AS DOUBLE) AS latitude,
               CAST(l.longitude AS DOUBLE) AS longitude,
               l.logradouro, b.nome AS bairro, l.cidade, l.uf,
               org.nome AS orgao_nome, e.numero_serie AS equipamento_nome
        FROM ocorrencias o
        JOIN localizacoes l ON l.id_localizacao = o.id_localizacao
        JOIN bairros b ON b.id_bairro = l.id_bairro
        JOIN orgaos org ON org.id_orgao = o.id_orgao
        LEFT JOIN equipamentos e ON e.id_equipamento = o.id_equipamento
        WHERE (
            (%s = 'atual' AND o.status IN ('aberta', 'em_atendimento'))
            OR (%s = 'periodo' AND o.ocorrida_em >= %s AND o.ocorrida_em <= %s)
        )
        ORDER BY o.ocorrida_em DESC, o.id_ocorrencia DESC
        """,
        (modo, modo, inicio, fim),
    )


@app.get("/api/agentes")
def list_agentes(em: datetime | None = None):
    rows = fetch_all(
        """
        SELECT a.id_agente AS id, a.nome, a.matricula, a.cargo,
               a.ativo_cadastro, CAST(a.raio_atuacao_km AS DOUBLE) AS raio_atuacao_km,
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
                   e.modelo,
                   o.nome AS orgao_nome, o.sigla AS orgao_sigla,
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
            JOIN orgaos o ON o.id_orgao = e.id_orgao
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
               e.modelo,
               o.nome AS orgao_nome, o.sigla AS orgao_sigla,
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
        JOIN orgaos o ON o.id_orgao = e.id_orgao
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
               o.descricao, o.ocorrida_em, o.resolvida_em,
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
