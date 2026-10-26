"""Explainable short-horizon forecasts for IBGE census sectors."""
from __future__ import annotations

from bisect import bisect_left
from datetime import datetime, timedelta, timezone
from math import exp, log

HISTORY_WEEKS = 156
BACKTEST_MONTHS = 6
RECENCY_HALF_LIFE_WEEKS = 52
REGION_PRIOR_WEEKS = 8.0
SERIOUS_GRAVITIES = {"alta", "critica"}
SAO_PAULO_TIMEZONE = timezone(timedelta(hours=-3))


def local_now() -> datetime:
    return datetime.now(SAO_PAULO_TIMEZONE).replace(tzinfo=None, microsecond=0)


def backtest_period(generated_at: datetime) -> tuple[datetime, datetime]:
    period_end = generated_at.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    start_month_index = generated_at.year * 12 + generated_at.month - 1 - BACKTEST_MONTHS
    start_year, start_month_offset = divmod(start_month_index, 12)
    period_start = generated_at.replace(
        year=start_year,
        month=start_month_offset + 1,
        day=1,
        hour=0,
        minute=0,
        second=0,
        microsecond=0,
    )
    return period_start, period_end


def _as_datetime(value: datetime | str) -> datetime:
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            return value.astimezone(SAO_PAULO_TIMEZONE).replace(tzinfo=None)
        return value
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is not None:
        return parsed.astimezone(SAO_PAULO_TIMEZONE).replace(tzinfo=None)
    return parsed


def _index_occurrences(area_ids: list[int], occurrences: list[dict]) -> dict[int, tuple[list[datetime], list[int]]]:
    grouped: dict[int, list[tuple[datetime, int]]] = {area_id: [] for area_id in area_ids}
    for occurrence in occurrences:
        occurred_at = occurrence.get("ocorrida_em")
        area_id = occurrence.get("area_id")
        if occurred_at is None or area_id is None:
            continue
        area_id = int(area_id)
        if area_id not in grouped:
            continue
        grouped[area_id].append((
            _as_datetime(occurred_at),
            int(occurrence.get("gravidade") in SERIOUS_GRAVITIES),
        ))

    indexed: dict[int, tuple[list[datetime], list[int]]] = {}
    for area_id, rows in grouped.items():
        rows.sort(key=lambda row: row[0])
        timestamps = [row[0] for row in rows]
        serious_prefix = [0]
        for _, is_serious in rows:
            serious_prefix.append(serious_prefix[-1] + is_serious)
        indexed[area_id] = (timestamps, serious_prefix)
    return indexed


def _count_window(
    indexed: tuple[list[datetime], list[int]],
    start: datetime,
    end: datetime,
) -> tuple[int, int]:
    timestamps, serious_prefix = indexed
    left = bisect_left(timestamps, start)
    right = bisect_left(timestamps, end)
    return right - left, serious_prefix[right] - serious_prefix[left]


def _weighted_quantile(samples: list[tuple[int, float]], quantile: float) -> int:
    if not samples:
        return 0
    ordered = sorted(samples, key=lambda sample: sample[0])
    target = sum(weight for _, weight in ordered) * quantile
    accumulated = 0.0
    for value, weight in ordered:
        accumulated += weight
        if accumulated >= target:
            return value
    return ordered[-1][0]


def _window_samples(
    area_ids: list[int],
    indexed: dict[int, tuple[list[datetime], list[int]]],
    future_start: datetime,
    duration: timedelta,
    history_start: datetime | None,
) -> tuple[dict[int, list[tuple[int, int, float]]], list[tuple[int, int, float]]]:
    samples_by_area = {area_id: [] for area_id in area_ids}
    all_samples: list[tuple[int, int, float]] = []
    half_life = float(RECENCY_HALF_LIFE_WEEKS)

    for weeks_ago in range(1, HISTORY_WEEKS + 1):
        historical_start = future_start - timedelta(weeks=weeks_ago)
        if history_start is not None and historical_start < history_start:
            break
        historical_end = historical_start + duration
        weight = exp(-log(2) * weeks_ago / half_life)
        for area_id in area_ids:
            count, serious_count = _count_window(indexed[area_id], historical_start, historical_end)
            sample = (count, serious_count, weight)
            samples_by_area[area_id].append(sample)
            all_samples.append(sample)

    return samples_by_area, all_samples


def _statistics(
    local_samples: list[tuple[int, int, float]],
    regional_samples: list[tuple[int, int, float]],
    include_range: bool,
) -> dict:
    local_weight = sum(weight for _, _, weight in local_samples)
    regional_weight = sum(weight for _, _, weight in regional_samples)
    if regional_weight <= 0:
        return {
            "expected": 0.0,
            "serious_expected": 0.0,
            "serious_probability": 0.0,
            "baseline_expected": 0.0,
            "baseline_serious_probability": 0.0,
            "serious_windows": 0,
            "windows_available": 0,
            "historical_occurrences": 0,
            "effective_windows": 0.0,
            "range_low": 0,
            "range_high": 0,
        }

    regional_expected = sum(count * weight for count, _, weight in regional_samples) / regional_weight
    regional_serious_expected = sum(
        serious_count * weight for _, serious_count, weight in regional_samples
    ) / regional_weight
    regional_serious_probability = sum(
        weight for _, serious_count, weight in regional_samples if serious_count > 0
    ) / regional_weight
    local_expected = sum(count * weight for count, _, weight in local_samples)
    local_serious_probability = sum(
        weight for _, serious_count, weight in local_samples if serious_count > 0
    )
    denominator = local_weight + REGION_PRIOR_WEEKS
    expected = (local_expected + REGION_PRIOR_WEEKS * regional_expected) / denominator if denominator else 0.0
    serious_probability = (
        local_serious_probability + REGION_PRIOR_WEEKS * regional_serious_probability
    ) / denominator if denominator else 0.0

    squared_weight = sum(weight * weight for _, _, weight in local_samples)
    effective_windows = local_weight * local_weight / squared_weight if squared_weight else 0.0
    result = {
        "expected": expected,
        "serious_expected": (
            sum(serious_count * weight for _, serious_count, weight in local_samples)
            + REGION_PRIOR_WEEKS * regional_serious_expected
        ) / denominator if denominator else 0.0,
        "serious_probability": serious_probability,
        "baseline_expected": regional_expected,
        "baseline_serious_probability": regional_serious_probability,
        "serious_windows": sum(1 for _, serious_count, _ in local_samples if serious_count > 0),
        "windows_available": len(local_samples),
        "historical_occurrences": sum(count for count, _, _ in local_samples),
        "effective_windows": effective_windows,
        "range_low": 0,
        "range_high": 0,
    }

    if include_range:
        prior_scale = REGION_PRIOR_WEEKS / regional_weight
        distribution = [(count, weight) for count, _, weight in local_samples]
        distribution.extend((count, weight * prior_scale) for count, _, weight in regional_samples)
        result["range_low"] = _weighted_quantile(distribution, 0.1)
        result["range_high"] = _weighted_quantile(distribution, 0.9)

    return result


def _predict_window(
    area_ids: list[int],
    indexed: dict[int, tuple[list[datetime], list[int]]],
    neighbors: dict[int, list[int]],
    start: datetime,
    duration: timedelta,
    include_range: bool = False,
    history_start: datetime | None = None,
) -> dict[int, dict]:
    samples_by_area, city_samples = _window_samples(area_ids, indexed, start, duration, history_start)
    predictions = {}
    for area_id in area_ids:
        nearby_samples = [
            sample
            for neighbor_id in neighbors.get(area_id, [])
            for sample in samples_by_area.get(neighbor_id, [])
        ]
        prior_samples = nearby_samples or city_samples
        predictions[area_id] = _statistics(samples_by_area[area_id], prior_samples, include_range)
    return predictions


def _score_backtest(
    area_ids: list[int],
    indexed: dict[int, tuple[list[datetime], list[int]]],
    neighbors: dict[int, list[int]],
    generated_at: datetime,
    history_start: datetime | None,
) -> dict | None:
    model_absolute_errors: list[float] = []
    baseline_absolute_errors: list[float] = []
    model_brier_scores: list[float] = []
    baseline_brier_scores: list[float] = []
    series_by_area = {area_id: [] for area_id in area_ids}

    test_start, test_end = backtest_period(generated_at)
    test_days = (test_end.date() - test_start.date()).days
    for day_offset in range(test_days):
        origin = test_start + timedelta(days=day_offset)
        predicted_intervals = [
            _predict_window(
                area_ids,
                indexed,
                neighbors,
                origin + timedelta(hours=6 * slot),
                timedelta(hours=6),
                history_start=history_start,
            )
            for slot in range(4)
        ]
        predicted_day = _predict_window(
            area_ids,
            indexed,
            neighbors,
            origin,
            timedelta(hours=24),
            include_range=True,
            history_start=history_start,
        )

        for area_id in area_ids:
            actual_count, actual_serious = _count_window(
                indexed[area_id], origin, origin + timedelta(hours=24)
            )
            predicted_count = sum(interval[area_id]["expected"] for interval in predicted_intervals)
            baseline_count = sum(interval[area_id]["baseline_expected"] for interval in predicted_intervals)
            actual_serious_flag = float(actual_serious > 0)
            model_absolute_errors.append(abs(predicted_count - actual_count))
            baseline_absolute_errors.append(abs(baseline_count - actual_count))
            model_brier_scores.append((predicted_day[area_id]["serious_probability"] - actual_serious_flag) ** 2)
            baseline_brier_scores.append((predicted_day[area_id]["baseline_serious_probability"] - actual_serious_flag) ** 2)
            series_by_area[area_id].append({
                "data": origin,
                "previsto": round(predicted_count, 3),
                "observado": actual_count,
                "limite_inferior": predicted_day[area_id]["range_low"],
                "limite_superior": predicted_day[area_id]["range_high"],
                "probabilidade_grave": round(predicted_day[area_id]["serious_probability"], 4),
                "grave_observada": actual_serious > 0,
            })

    if not model_absolute_errors:
        return None
    sample_count = len(model_absolute_errors)
    return {
        "dias_teste": test_days,
        "meses_teste": BACKTEST_MONTHS,
        "amostras": sample_count,
        "mae_modelo": round(sum(model_absolute_errors) / sample_count, 3),
        "mae_referencia": round(sum(baseline_absolute_errors) / sample_count, 3),
        "brier_modelo": round(sum(model_brier_scores) / sample_count, 4),
        "brier_referencia": round(sum(baseline_brier_scores) / sample_count, 4),
        "inicio": test_start,
        "fim": test_end,
        "series_por_area": [
            {"area_id": area_id, "pontos": series_by_area[area_id]}
            for area_id in area_ids
        ],
    }


def build_occurrence_forecast(
    areas: list[dict],
    occurrences: list[dict],
    generated_at: datetime | None = None,
    neighbors: dict[int, list[int]] | None = None,
) -> dict:
    generated_at = generated_at or local_now()
    area_by_id = {int(area["id"]): str(area["nome"]) for area in areas}
    sectors_by_area_id = {
        int(area["id"]): int(area.get("quantidade_setores", 1))
        for area in areas
    }
    area_ids = sorted(area_by_id)
    neighbors = neighbors or {}
    indexed = _index_occurrences(area_ids, occurrences)
    history_start = min(
        (timestamps[0] for timestamps, _ in indexed.values() if timestamps),
        default=None,
    )
    model_history_start = generated_at - timedelta(weeks=HISTORY_WEEKS)
    historical_count = sum(
        sum(timestamp >= model_history_start for timestamp in timestamps)
        for timestamps, _ in indexed.values()
    )

    result = {
        "status": "ok" if historical_count else "sem_historico",
        "unidades": "areas_agrupadas",
        "quantidade_areas": len(area_ids),
        "quantidade_setores": sum(sectors_by_area_id.values()),
        "gerada_em": generated_at,
        "inicio": generated_at,
        "fim": generated_at + timedelta(hours=24),
        "periodo_historico_semanas": 0,
        "ocorrencias_historicas": historical_count,
        "metodo": (
            f"Janelas equivalentes em até {HISTORY_WEEKS} semanas, com meia-vida de "
            f"{RECENCY_HALF_LIFE_WEEKS} semanas para dar mais peso aos dados recentes. "
            "A previsão é calculada por áreas agrupadas de setores censitários contíguos."
        ),
        "areas": [],
        "avaliacao": None,
    }
    if not area_ids or not historical_count:
        return result

    interval_forecasts = []
    for slot in range(4):
        start = generated_at + timedelta(hours=6 * slot)
        predictions = _predict_window(
            area_ids,
            indexed,
            neighbors,
            start,
            timedelta(hours=6),
            include_range=True,
            history_start=history_start,
        )
        interval_forecasts.append((start, start + timedelta(hours=6), predictions))
    day_predictions = _predict_window(
        area_ids,
        indexed,
        neighbors,
        generated_at,
        timedelta(hours=24),
        include_range=True,
        history_start=history_start,
    )
    result["periodo_historico_semanas"] = day_predictions[area_ids[0]]["windows_available"]
    result["metodo"] = (
        f"Janelas equivalentes nas últimas {result['periodo_historico_semanas']} semanas disponíveis, "
        f"com maior peso para dados recentes (meia-vida de {RECENCY_HALF_LIFE_WEEKS} semanas). "
        "Cada área é suavizada pela média histórica das áreas vizinhas; áreas sem vizinhas usam a média municipal. "
        "Graves = alta ou crítica."
    )

    for area_id in area_ids:
        intervals = []
        expected_total = 0.0
        serious_expected_total = 0.0
        for start, end, predictions in interval_forecasts:
            prediction = predictions[area_id]
            expected_total += prediction["expected"]
            serious_expected_total += prediction["serious_expected"]
            intervals.append({
                "inicio": start,
                "fim": end,
                "quantidade_esperada": round(prediction["expected"], 2),
                "graves_esperadas": round(prediction["serious_expected"], 2),
                "probabilidade_grave": round(prediction["serious_probability"], 4),
                "faixa_historica_p10": prediction["range_low"],
                "faixa_historica_p90": prediction["range_high"],
                "janelas_com_graves": prediction["serious_windows"],
                "janelas_avaliadas": prediction["windows_available"],
                "janelas_efetivas": round(prediction["effective_windows"], 1),
            })

        day_prediction = day_predictions[area_id]
        result["areas"].append({
            "id": area_id,
            "nome": area_by_id[area_id],
            "quantidade_setores": sectors_by_area_id[area_id],
            "quantidade_esperada": round(expected_total, 2),
            "graves_esperadas": round(serious_expected_total, 2),
            "probabilidade_grave_24h": round(day_prediction["serious_probability"], 4),
            "faixa_historica_p10": day_prediction["range_low"],
            "faixa_historica_p90": day_prediction["range_high"],
            "janelas_com_graves": day_prediction["serious_windows"],
            "janelas_avaliadas": day_prediction["windows_available"],
            "janelas_efetivas": round(day_prediction["effective_windows"], 1),
            "intervalos": intervals,
        })

    result["avaliacao"] = _score_backtest(area_ids, indexed, neighbors, generated_at, history_start)
    return result
