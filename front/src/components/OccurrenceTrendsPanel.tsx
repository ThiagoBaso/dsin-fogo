import { useMemo } from 'react';
import type { OcorrenciaTendencia } from '../types';
import type { OccurrenceHeatMode } from './map/occurrenceHeat';
import { buildOccurrenceTrends, OccurrenceTrendPoint } from './map/occurrenceTrends';

type TrendUnit = 'quantidade' | 'gravidade' | 'horas';

function formatValue(value: number, unit: TrendUnit) {
  if (unit === 'gravidade') return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} / 4`;
  if (unit === 'horas') {
    if (value < 1) return `${Math.round(value * 60)} min`;
    if (value >= 24) return `${(value / 24).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} d`;
    return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
  }
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

function trendComparison(points: OccurrenceTrendPoint[], unit: TrendUnit, fixedRange = false) {
  if (!points.length) return '';
  const completePoints = points.filter((point) => point.complete);
  if (!completePoints.length) return 'Ainda não há intervalos completos suficientes para comparar.';
  const validPoints = fixedRange
    ? [completePoints[0], completePoints[completePoints.length - 1]]
    : completePoints.filter((point) => point.value !== null && point.count > 0)
      .filter((point, index, values) => index === 0 || index === values.length - 1);
  const first = validPoints[0];
  const last = validPoints[validPoints.length - 1];
  if (!first || !last || first.value === null || last.value === null) return 'Sem dados suficientes para comparar os intervalos.';
  if (first === last || first.key === last.key) return `Dados disponíveis em ${first.fullLabel}: ${formatValue(first.value, unit)}.`;

  const difference = last.value - first.value;
  const direction = difference < 0 ? 'caiu' : difference > 0 ? 'subiu' : 'permaneceu estável';
  const amount = Math.abs(difference);
  const percent = first.value === 0 ? null : Math.abs(difference / first.value * 100);
  const change = difference === 0
    ? 'sem variação'
    : percent === null
      ? `${direction} para ${formatValue(last.value, unit)}`
      : `${direction} ${percent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% (${formatValue(amount, unit)})`;
  const interpretation = unit === 'horas' && difference !== 0
    ? difference < 0 ? ' — resolução mais rápida' : ' — resolução mais lenta'
    : '';
  return `${first.fullLabel}: ${formatValue(first.value, unit)} → ${last.fullLabel}: ${formatValue(last.value, unit)}; ${change}${interpretation}.`;
}

function TrendChart({
  title,
  points,
  unit,
  colorClass,
  emptyMessage,
}: {
  title: string;
  points: OccurrenceTrendPoint[];
  unit: TrendUnit;
  colorClass: string;
  emptyMessage?: string;
}) {
  const valid = points.filter((point) => point.value !== null);
  if (!valid.length) return (
    <section className="occurrence-trend-chart" aria-label={title}>
      <h3>{title}</h3>
      <p className="occurrence-trend-empty">{emptyMessage || 'Sem dados para os filtros e período atuais.'}</p>
    </section>
  );

  const width = 360;
  const height = 148;
  const left = 38;
  const right = 10;
  const top = 10;
  const bottom = 28;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const values = valid.map((point) => point.value as number);
  const minimum = unit === 'gravidade' ? 1 : 0;
  const maximum = unit === 'gravidade' ? 4 : Math.max(1, ...values);
  const range = maximum - minimum;
  const pointPosition = (point: OccurrenceTrendPoint, index: number) => ({
    x: left + (points.length <= 1 ? plotWidth / 2 : index / (points.length - 1) * plotWidth),
    y: top + (maximum - (point.value ?? minimum)) / range * plotHeight,
  });
  const path = points.reduce((result, point, index) => {
    if (point.value === null) return { path: result.path, connected: false };
    const position = pointPosition(point, index);
    return {
      path: `${result.path}${result.connected ? ' L' : ' M'} ${position.x.toFixed(1)} ${position.y.toFixed(1)}`,
      connected: true,
    };
  }, { path: '', connected: false }).path;
  const tickCount = Math.min(points.length, 6);
  const tickIndexes = Array.from({ length: tickCount }, (_, tick) => (
    tickCount <= 1 ? 0 : Math.round(tick * (points.length - 1) / (tickCount - 1))
  ));
  const firstValue = formatValue(minimum, unit);
  const lastValue = formatValue(maximum, unit);

  return (
    <section className="occurrence-trend-chart" aria-label={title}>
      <h3>{title}</h3>
      <svg
        className="occurrence-trend-plot"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${title}; valores entre ${firstValue} e ${lastValue}`}
        preserveAspectRatio="none"
      >
        {[0, 0.5, 1].map((step) => {
          const y = top + step * plotHeight;
          const value = maximum - step * range;
          return (
            <g key={step}>
              <line className="occurrence-trend-gridline" x1={left} x2={width - right} y1={y} y2={y} />
              <text className="occurrence-trend-axis-label" x={left - 5} y={y + 3} textAnchor="end">
                {formatValue(value, unit)}
              </text>
            </g>
          );
        })}
        <path className={`occurrence-trend-line ${colorClass}`} d={path} />
        {points.map((point, index) => {
          if (point.value === null) return null;
          const position = pointPosition(point, index);
          const sampleLabel = unit === 'gravidade'
            ? `, ${point.count} ocorrências`
            : unit === 'horas'
              ? `, ${point.count} casos resolvidos`
              : title === 'Ocorrências em locais recorrentes'
                ? `, ${point.count} recorrentes`
                : `, ${point.count} ocorrências no intervalo`;
          return (
            <circle
              className={`occurrence-trend-point ${colorClass}`}
              cx={position.x}
              cy={position.y}
              r="2.7"
              key={point.key}
            >
              <title>{`${point.fullLabel}${point.complete ? '' : ' (intervalo parcial)'}: ${formatValue(point.value, unit)}${sampleLabel}`}</title>
            </circle>
          );
        })}
        {tickIndexes.map((index) => {
          const point = points[index];
          if (!point) return null;
          const position = pointPosition(point, index);
          const anchor = index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle';
          return (
            <text className="occurrence-trend-axis-label" x={position.x} y={height - 7} textAnchor={anchor} key={point.key}>
              {point.label}
            </text>
          );
        })}
      </svg>
      <p className="occurrence-trend-comparison" aria-live="polite">
        {trendComparison(points, unit, title === 'Ocorrências por intervalo'
          || title === 'Ocorrências em locais recorrentes' || title === 'Ocorrências acumuladas')}
      </p>
    </section>
  );
}

export default function OccurrenceTrendsPanel({
  occurrences,
  mode,
  period,
  selectedTypes,
  selectedGravities,
  loading,
  error,
}: {
  occurrences: OcorrenciaTendencia[];
  mode: OccurrenceHeatMode;
  period: { mode: 'atual' | 'periodo'; start: string; end: string };
  selectedTypes: string[] | null;
  selectedGravities: string[] | null;
  loading: boolean;
  error: string;
}) {
  const filteredOccurrences = useMemo(() => occurrences.filter((occurrence) =>
    (selectedTypes === null || selectedTypes.includes(occurrence.tipo))
      && (selectedGravities === null || selectedGravities.includes(occurrence.gravidade)),
  ), [occurrences, selectedTypes, selectedGravities]);
  const trends = useMemo(
    () => buildOccurrenceTrends(filteredOccurrences, mode, period),
    [filteredOccurrences, mode, period],
  );
  const resolutionDataCount = trends?.metric.reduce((sum, point) => sum + point.count, 0) || 0;

  return (
    <section className="occurrence-trends" aria-label="Tendências do mapa de calor">
      <div className="occurrence-trends-heading">
        <div>
          <h2>Tendência do mapa</h2>
          <p>Ocorrências filtradas ao longo do tempo</p>
        </div>
      </div>
      {loading && <p className="occurrence-trend-state" role="status">Carregando tendências…</p>}
      {!loading && error && <p className="occurrence-trend-state is-error" role="alert">{error}</p>}
      {!loading && !error && trends && (
        <>
          <p className="occurrence-trend-period">
            {trends.totalOccurrences.toLocaleString('pt-BR')} ocorrências · por {trends.granularity}
            {' '}· {trends.startLabel}–{trends.endLabel}
          </p>
          <TrendChart
            title="Ocorrências por intervalo"
            points={trends.volume}
            unit="quantidade"
            colorClass="is-volume"
          />
          <TrendChart
            title={trends.metricTitle}
            points={trends.metric}
            unit={trends.metricUnit}
            colorClass={mode === 'tempo_resolucao' ? 'is-resolution' : mode === 'recorrencia' ? 'is-recurrence' : 'is-metric'}
            emptyMessage={mode === 'tempo_resolucao'
              ? period.mode === 'atual'
                ? 'O filtro Atuais contém apenas ocorrências abertas ou em atendimento. Escolha um período para analisar as resolvidas.'
                : 'Não há ocorrências resolvidas nesse intervalo com os filtros atuais.'
              : 'Sem dados para os filtros e período atuais.'}
          />
          {mode === 'tempo_resolucao' && resolutionDataCount > 0 && (
            <p className="occurrence-trend-period">
              {resolutionDataCount.toLocaleString('pt-BR')} casos resolvidos; cada ponto usa a mediana dos encerrados naquele intervalo.
            </p>
          )}
          {mode === 'tempo_resolucao' && period.mode === 'periodo' && (
            <p className="occurrence-trend-footnote">
              Casos agrupados pela data de resolução, mesmo quando foram abertos antes do intervalo.
            </p>
          )}
          {trends.volume.length > 0 && !trends.volume[trends.volume.length - 1].complete && (
            <p className="occurrence-trend-footnote">
              O último intervalo ainda está em andamento e pode conter menos ocorrências; ele não entra na comparação de início e fim.
            </p>
          )}
        </>
      )}
      {!loading && !error && !trends && (
        <p className="occurrence-trend-state">Sem ocorrências para os filtros e período atuais.</p>
      )}
    </section>
  );
}
