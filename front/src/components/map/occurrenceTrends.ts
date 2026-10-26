import type { OcorrenciaTendencia } from '../../types';
import { projectCoveragePosition } from './coverage';
import type { OccurrenceHeatMode } from './occurrenceHeat';

export type OccurrenceTrendGranularity = 'dia' | 'semana' | 'mês';

export interface OccurrenceTrendPoint {
  key: string;
  label: string;
  fullLabel: string;
  value: number | null;
  count: number;
  complete: boolean;
}

export interface OccurrenceTrendBreakdownEntry {
  label: string;
  count: number;
}

export interface OccurrenceTrendSeries {
  granularity: OccurrenceTrendGranularity;
  volume: OccurrenceTrendPoint[];
  metric: OccurrenceTrendPoint[];
  metricTitle: string;
  metricUnit: 'quantidade' | 'gravidade' | 'horas';
  startLabel: string;
  endLabel: string;
  totalOccurrences: number;
  byType: OccurrenceTrendBreakdownEntry[];
  bySeverity: OccurrenceTrendBreakdownEntry[];
}

interface TrendPeriod {
  mode: 'atual' | 'periodo';
  start: string;
  end: string;
}

const severityWeight: Record<OcorrenciaTendencia['gravidade'], number> = {
  baixa: 1,
  media: 2,
  alta: 3,
  critica: 4,
};

const severityLabel: Record<OcorrenciaTendencia['gravidade'], string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  critica: 'Crítica',
};
const severityDisplayOrder: Record<string, number> = {
  Crítica: 4,
  Alta: 3,
  Média: 2,
  Baixa: 1,
};

function parseDay(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const day = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(day.getTime()) ? day : null;
}

function formatMonthYear(day: Date) {
  const month = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' })
    .format(day).replace(/\.$/, '');
  return `${month}/${String(day.getUTCFullYear()).slice(-2)}`;
}

function formatTickLabel(day: Date, granularity: OccurrenceTrendGranularity) {
  if (granularity === 'mês') return formatMonthYear(day);
  const startLabel = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', timeZone: 'UTC',
  }).format(day);
  if (granularity === 'semana') {
    const weekEnd = new Date(day);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    const endLabel = new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', timeZone: 'UTC',
    }).format(weekEnd);
    return `${startLabel}–${endLabel}`;
  }
  return startLabel;
}

function formatFullDate(day: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
  }).format(day);
}

function formatFullLabel(day: Date, granularity: OccurrenceTrendGranularity) {
  if (granularity === 'dia') return formatFullDate(day);
  if (granularity === 'semana') {
    const weekEnd = new Date(day);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    return `Semana de ${formatFullDate(day)} a ${formatFullDate(weekEnd)}`;
  }
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(day);
}

function startOfBucket(day: Date, granularity: OccurrenceTrendGranularity) {
  const bucket = new Date(day);
  if (granularity === 'mês') {
    bucket.setUTCDate(1);
  } else if (granularity === 'semana') {
    const daysSinceMonday = (bucket.getUTCDay() + 6) % 7;
    bucket.setUTCDate(bucket.getUTCDate() - daysSinceMonday);
  }
  return bucket;
}

function addBucket(day: Date, granularity: OccurrenceTrendGranularity) {
  const next = new Date(day);
  if (granularity === 'mês') next.setUTCMonth(next.getUTCMonth() + 1);
  else next.setUTCDate(next.getUTCDate() + (granularity === 'semana' ? 7 : 1));
  return next;
}

function bucketKey(day: Date, granularity: OccurrenceTrendGranularity) {
  return granularity === 'mês' ? day.toISOString().slice(0, 7) : day.toISOString().slice(0, 10);
}

function chooseGranularity(start: Date, end: Date): OccurrenceTrendGranularity {
  const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  if (days <= 62) return 'dia';
  if (days <= 180) return 'semana';
  return 'mês';
}

function median(values: number[]) {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

function occurrenceBreakdown(
  occurrences: OcorrenciaTendencia[],
  getLabel: (occurrence: OcorrenciaTendencia) => string,
  compare?: (left: OccurrenceTrendBreakdownEntry, right: OccurrenceTrendBreakdownEntry) => number,
) {
  const counts = new Map<string, number>();
  occurrences.forEach((occurrence) => {
    const label = getLabel(occurrence);
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  const entries = Array.from(counts.entries()).map(([label, count]) => ({ label, count }));
  return entries.sort(compare || ((left, right) => (
    right.count - left.count || left.label.localeCompare(right.label, 'pt-BR')
  )));
}

function recurringOccurrenceIds(occurrences: OcorrenciaTendencia[], start: Date, end: Date) {
  const cellMeters = 350;
  const events = occurrences.flatMap((occurrence) => {
    const day = parseDay(occurrence.ocorrida_em);
    if (!day || day < start || day > end) return [];
    const projected = projectCoveragePosition(occurrence.latitude, occurrence.longitude);
    return [{
      id: occurrence.id,
      type: occurrence.tipo.trim().toLocaleLowerCase('pt-BR'),
      day: occurrence.ocorrida_em.slice(0, 10),
      latitude: occurrence.latitude,
      x: projected.x,
      y: projected.y,
      radius: cellMeters / Math.cos(occurrence.latitude * Math.PI / 180),
    }];
  });
  const buckets = new Map<string, typeof events>();
  events.forEach((event) => {
    const bucketX = Math.floor(event.x / cellMeters);
    const bucketY = Math.floor(event.y / cellMeters);
    const key = `${event.type}:${bucketX}:${bucketY}`;
    const bucket = buckets.get(key) || [];
    bucket.push(event);
    buckets.set(key, bucket);
  });

  const recurring = new Set<number>();
  events.forEach((event) => {
    const bucketX = Math.floor(event.x / cellMeters);
    const bucketY = Math.floor(event.y / cellMeters);
    const bucketRange = Math.ceil(event.radius / cellMeters);
    for (let offsetX = -bucketRange; offsetX <= bucketRange; offsetX += 1) {
      for (let offsetY = -bucketRange; offsetY <= bucketRange; offsetY += 1) {
        const key = `${event.type}:${bucketX + offsetX}:${bucketY + offsetY}`;
        (buckets.get(key) || []).forEach((candidate) => {
          if (candidate.day === event.day) return;
          const dx = candidate.x - event.x;
          const dy = candidate.y - event.y;
          const radius = (candidate.radius + event.radius) / 2;
          if (dx * dx + dy * dy <= radius * radius) {
            recurring.add(event.id);
            recurring.add(candidate.id);
          }
        });
      }
    }
  });
  return recurring;
}

export function buildOccurrenceTrends(
  occurrences: OcorrenciaTendencia[],
  mode: OccurrenceHeatMode,
  period: TrendPeriod,
): OccurrenceTrendSeries | null {
  let start = period.mode === 'periodo' ? parseDay(period.start) : null;
  let end = period.mode === 'periodo' ? parseDay(period.end) : null;
  if (!start || !end) {
    const occurrenceDays = occurrences
      .map((occurrence) => parseDay(occurrence.ocorrida_em))
      .filter((day): day is Date => day !== null)
      .sort((left, right) => left.getTime() - right.getTime());
    start = occurrenceDays[0] || null;
    end = occurrenceDays[occurrenceDays.length - 1] || null;
  }
  if (!start || !end || start > end) return null;

  const granularity = chooseGranularity(start, end);
  const startsAtDayBoundary = period.mode !== 'periodo'
    || !period.start.includes('T')
    || period.start.slice(11, 16) === '00:00';
  const endsAtDayBoundary = period.mode !== 'periodo'
    || !period.end.includes('T')
    || period.end.slice(11, 16) >= '23:59';
  const firstBucket = startOfBucket(start, granularity);
  const lastBucket = startOfBucket(end, granularity);
  const buckets: OccurrenceTrendPoint[] = [];
  for (let date = firstBucket; date <= lastBucket; date = addBucket(date, granularity)) {
    const nextDate = addBucket(date, granularity);
    const lastDate = new Date(nextDate.getTime() - 86400000);
    const startsInPeriod = date > start || (date.getTime() === start.getTime() && startsAtDayBoundary);
    const endsInPeriod = lastDate < end || (lastDate.getTime() === end.getTime() && endsAtDayBoundary);
    const complete = startsInPeriod && endsInPeriod;
    buckets.push({
      key: bucketKey(date, granularity),
      label: formatTickLabel(date, granularity),
      fullLabel: formatFullLabel(date, granularity),
      value: 0,
      count: 0,
      complete,
    });
  }
  const inPeriod = (value: string | null) => {
    const day = parseDay(value);
    return day !== null && day >= start! && day <= end!;
  };
  const occurredInPeriod = occurrences.filter((occurrence) => inPeriod(occurrence.ocorrida_em));
  const volumeCounts = new Map<string, number>();
  occurredInPeriod.forEach((occurrence) => {
    const day = parseDay(occurrence.ocorrida_em)!;
    const key = bucketKey(startOfBucket(day, granularity), granularity);
    volumeCounts.set(key, (volumeCounts.get(key) || 0) + 1);
  });
  const volume = buckets.map((bucket) => ({
    ...bucket,
    value: volumeCounts.get(bucket.key) || 0,
    count: volumeCounts.get(bucket.key) || 0,
  }));
  const recurringIds = mode === 'recorrencia' ? recurringOccurrenceIds(occurrences, start, end) : new Set<number>();
  const metricSamples = new Map<string, number[]>();
  const addSample = (dateString: string, value: number) => {
    const day = parseDay(dateString);
    if (!day || day < start! || day > end!) return;
    const key = bucketKey(startOfBucket(day, granularity), granularity);
    const samples = metricSamples.get(key) || [];
    samples.push(value);
    metricSamples.set(key, samples);
  };

  if (mode === 'tempo_resolucao') {
    occurrences.forEach((occurrence) => {
      if (occurrence.status !== 'resolvida' || !occurrence.resolvida_em || !inPeriod(occurrence.resolvida_em)) return;
      const occurredAt = Date.parse(occurrence.ocorrida_em);
      const resolvedAt = Date.parse(occurrence.resolvida_em);
      if (Number.isFinite(occurredAt) && Number.isFinite(resolvedAt) && resolvedAt > occurredAt) {
        addSample(occurrence.resolvida_em, (resolvedAt - occurredAt) / 3600000);
      }
    });
  } else if (mode === 'gravidade' || mode === 'ambos') {
    occurredInPeriod.forEach((occurrence) => addSample(occurrence.ocorrida_em, severityWeight[occurrence.gravidade]));
  } else if (mode === 'recorrencia') {
    occurredInPeriod.forEach((occurrence) => {
      if (recurringIds.has(occurrence.id)) addSample(occurrence.ocorrida_em, 1);
    });
  } else {
    let cumulative = 0;
    volume.forEach((bucket) => {
      cumulative += bucket.count;
      metricSamples.set(bucket.key, [cumulative]);
    });
  }

  const metric = buckets.map((bucket) => {
    const samples = metricSamples.get(bucket.key) || [];
    const value = mode === 'gravidade' || mode === 'ambos'
      ? samples.length ? samples.reduce((sum, sample) => sum + sample, 0) / samples.length : null
      : mode === 'tempo_resolucao'
        ? samples.length ? median(samples) : null
        : mode === 'quantidade'
          ? samples.length ? samples[samples.length - 1] : 0
          : samples.length;
    return { ...bucket, value, count: mode === 'quantidade' ? bucket.count : samples.length };
  });
  const metricTitle = mode === 'tempo_resolucao'
    ? 'Mediana do tempo de resolução'
    : mode === 'gravidade' || mode === 'ambos'
      ? 'Gravidade média'
      : mode === 'recorrencia'
        ? 'Ocorrências em locais recorrentes'
        : 'Ocorrências acumuladas';

  return {
    granularity,
    volume,
    metric,
    metricTitle,
    metricUnit: mode === 'tempo_resolucao' ? 'horas'
      : mode === 'gravidade' || mode === 'ambos' ? 'gravidade' : 'quantidade',
    startLabel: formatFullDate(start),
    endLabel: formatFullDate(end),
    totalOccurrences: occurredInPeriod.length,
    byType: occurrenceBreakdown(occurredInPeriod, (occurrence) => {
      const type = occurrence.tipo.trim();
      return type ? type[0].toLocaleUpperCase('pt-BR') + type.slice(1) : 'Sem tipo';
    }),
    bySeverity: occurrenceBreakdown(
      occurredInPeriod,
      (occurrence) => severityLabel[occurrence.gravidade],
      (left, right) => severityDisplayOrder[right.label] - severityDisplayOrder[left.label],
    ),
  };
}
