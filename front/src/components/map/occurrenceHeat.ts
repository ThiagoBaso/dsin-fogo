import type { OcorrenciaMapa } from '../../types';
import { coverageIntensity, coveragePixel, projectCoveragePosition, unprojectCoveragePosition } from './coverage';

export type OccurrenceHeatMode = 'quantidade' | 'gravidade' | 'ambos' | 'recorrencia' | 'tempo_resolucao';

export interface OccurrenceHeatSource {
  latitude: number;
  longitude: number;
  severityWeight: number;
  occurrenceType: string;
  occurrenceDay: string;
  resolutionHours: number | null;
}

interface ProjectedOccurrenceHeatSource extends OccurrenceHeatSource {
  x: number;
  y: number;
  radius: number;
}

interface OccurrenceRecurrenceGroup {
  occurrenceType: string;
  x: number;
  y: number;
  latitude: number;
  radius: number;
  days: Set<string>;
}

interface OccurrenceRecurrenceRasterSource extends OccurrenceRecurrenceGroup {
  recurrenceDays: number;
}

interface OccurrenceResolutionGroup {
  x: number;
  y: number;
  latitude: number;
  radius: number;
  durations: number[];
}

interface OccurrenceResolutionArea extends Omit<OccurrenceResolutionGroup, 'durations'> {
  medianHours: number;
}

interface ProjectedOccurrenceResolutionSource {
  x: number;
  y: number;
  latitude: number;
  radius: number;
  resolutionHours: number | null;
}

export interface OccurrenceResolutionSummary {
  resolvedCount: number;
  areaCount: number;
  maximumHours: number;
}

const maximumLatitude = 85.05112878;
const radiusMeters = 350;
const maximumGridCells = 4000000;
const maximumSeverityTotal = 16;
const recurrenceBucketMeters = 400;
const maximumRecurrenceRate = 0.15;
const resolutionBucketMeters = 400;
const resolutionRadiusMeters = 350;
const minimumResolutionSamples = 3;
const resolutionColorStops = [
  { value: 0, color: [30, 64, 175] },
  { value: 0.3, color: [6, 182, 212] },
  { value: 0.62, color: [250, 204, 21] },
  { value: 1, color: [220, 38, 38] },
];
const severityWeights: Record<OcorrenciaMapa['gravidade'], number> = {
  baixa: 1,
  media: 2,
  alta: 3,
  critica: 4,
};
const severityColorStops = [
  { value: 1, color: [21, 128, 61] },
  { value: 2, color: [202, 138, 4] },
  { value: 3, color: [234, 88, 12] },
  { value: 4, color: [220, 38, 38] },
];

export const occurrenceSeverityGradient = `linear-gradient(90deg, ${severityColorStops
  .map((stop, index) => `rgb(${stop.color.join(',')}) ${index / (severityColorStops.length - 1) * 100}%`)
  .join(', ')})`;
const recurrenceColorStops = [
  { value: 0, color: [196, 181, 253] },
  { value: 0.01, color: [167, 139, 250] },
  { value: 0.03, color: [139, 92, 246] },
  { value: 0.07, color: [124, 58, 237] },
  { value: maximumRecurrenceRate, color: [88, 28, 135] },
];

export const occurrenceRecurrenceGradient = `linear-gradient(90deg, ${recurrenceColorStops
  .map((stop) => `rgb(${stop.color.join(',')}) ${stop.value / maximumRecurrenceRate * 100}%`)
  .join(', ')})`;

export const occurrenceResolutionGradient = `linear-gradient(90deg, ${resolutionColorStops
  .map((stop) => `rgb(${stop.color.join(',')}) ${stop.value * 100}%`)
  .join(', ')})`;

export function countOccurrencePeriodDays(start: string, end: string) {
  const startTimestamp = Date.parse(`${start.slice(0, 10)}T00:00:00Z`);
  const endTimestamp = Date.parse(`${end.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp) || endTimestamp < startTimestamp) return 1;
  return Math.floor((endTimestamp - startTimestamp) / 86400000) + 1;
}

export function collectOccurrenceHeatSources(
  occurrences: Pick<OcorrenciaMapa, 'latitude' | 'longitude' | 'gravidade' | 'tipo' | 'status' | 'ocorrida_em' | 'resolvida_em'>[],
) {
  const sources: OccurrenceHeatSource[] = [];
  let excludedCount = 0;

  occurrences.forEach((occurrence) => {
    const { latitude, longitude, gravidade } = occurrence;
    if (typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) > maximumLatitude
      || typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
      excludedCount += 1;
      return;
    }

    sources.push({
      latitude,
      longitude,
      severityWeight: severityWeights[gravidade] ?? 1,
      occurrenceType: occurrence.tipo.trim().toLocaleLowerCase('pt-BR'),
      occurrenceDay: occurrence.ocorrida_em.slice(0, 10),
      resolutionHours: getResolutionHours(occurrence),
    });
  });

  return { sources, excludedCount };
}

function getResolutionHours(occurrence: Pick<OcorrenciaMapa, 'status' | 'ocorrida_em' | 'resolvida_em'>) {
  if (occurrence.status !== 'resolvida' || !occurrence.resolvida_em) return null;
  const occurredAt = Date.parse(occurrence.ocorrida_em);
  const resolvedAt = Date.parse(occurrence.resolvida_em);
  if (!Number.isFinite(occurredAt) || !Number.isFinite(resolvedAt) || resolvedAt <= occurredAt) return null;
  return (resolvedAt - occurredAt) / 3_600_000;
}

function buildRecurrenceGroups(projectedSources: ProjectedOccurrenceHeatSource[]) {
  const groupsByTypeAndLocation = new Map<string, OccurrenceRecurrenceGroup>();
  projectedSources.forEach((source) => {
    if (!source.occurrenceType || !/^\d{4}-\d{2}-\d{2}$/.test(source.occurrenceDay)) return;
    const locationKey = `${source.occurrenceType}:${Math.round(source.x)}:${Math.round(source.y)}`;
    let group = groupsByTypeAndLocation.get(locationKey);
    if (!group) {
      group = {
        occurrenceType: source.occurrenceType,
        x: source.x,
        y: source.y,
        latitude: source.latitude,
        radius: source.radius,
        days: new Set(),
      };
      groupsByTypeAndLocation.set(locationKey, group);
    }
    group.days.add(source.occurrenceDay);
  });

  const groupsBySpatialBucket = new Map<string, OccurrenceRecurrenceGroup[]>();
  groupsByTypeAndLocation.forEach((group) => {
    const bucketX = Math.floor(group.x / recurrenceBucketMeters);
    const bucketY = Math.floor(group.y / recurrenceBucketMeters);
    const bucketKey = `${group.occurrenceType}:${bucketX}:${bucketY}`;
    const bucket = groupsBySpatialBucket.get(bucketKey) || [];
    bucket.push(group);
    groupsBySpatialBucket.set(bucketKey, bucket);
  });

  const recurringGroups: OccurrenceRecurrenceRasterSource[] = [];
  groupsByTypeAndLocation.forEach((group) => {
    const bucketX = Math.floor(group.x / recurrenceBucketMeters);
    const bucketY = Math.floor(group.y / recurrenceBucketMeters);
    const recurringDays = new Set(group.days);
    const bucketRange = Math.ceil(group.radius / recurrenceBucketMeters);
    for (let offsetX = -bucketRange; offsetX <= bucketRange; offsetX += 1) {
      for (let offsetY = -bucketRange; offsetY <= bucketRange; offsetY += 1) {
        const bucketKey = `${group.occurrenceType}:${bucketX + offsetX}:${bucketY + offsetY}`;
        (groupsBySpatialBucket.get(bucketKey) || []).forEach((neighbor) => {
          const dx = neighbor.x - group.x;
          const dy = neighbor.y - group.y;
          const radius = (neighbor.radius + group.radius) / 2;
          if (dx * dx + dy * dy <= radius * radius) {
            neighbor.days.forEach((day) => recurringDays.add(day));
          }
        });
      }
    }
    if (recurringDays.size >= 2) {
      recurringGroups.push({ ...group, recurrenceDays: recurringDays.size });
    }
  });
  return recurringGroups;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function buildOccurrenceResolutionAreas(projectedSources: ProjectedOccurrenceResolutionSource[]) {
  const groupsByLocation = new Map<string, OccurrenceResolutionGroup>();
  projectedSources.forEach((source) => {
    if (source.resolutionHours === null || !Number.isFinite(source.resolutionHours)) return;
    const locationKey = `${source.x.toFixed(2)}:${source.y.toFixed(2)}`;
    let group = groupsByLocation.get(locationKey);
    if (!group) {
      group = {
        x: source.x,
        y: source.y,
        latitude: source.latitude,
        radius: resolutionRadiusMeters / Math.cos(source.latitude * Math.PI / 180),
        durations: [],
      };
      groupsByLocation.set(locationKey, group);
    }
    group.durations.push(source.resolutionHours);
  });

  const groupsBySpatialBucket = new Map<string, OccurrenceResolutionGroup[]>();
  groupsByLocation.forEach((group) => {
    const bucketX = Math.floor(group.x / resolutionBucketMeters);
    const bucketY = Math.floor(group.y / resolutionBucketMeters);
    const bucketKey = `${bucketX}:${bucketY}`;
    const bucket = groupsBySpatialBucket.get(bucketKey) || [];
    bucket.push(group);
    groupsBySpatialBucket.set(bucketKey, bucket);
  });

  const areas: OccurrenceResolutionArea[] = [];
  groupsByLocation.forEach((group) => {
    const bucketX = Math.floor(group.x / resolutionBucketMeters);
    const bucketY = Math.floor(group.y / resolutionBucketMeters);
    const neighbors: OccurrenceResolutionGroup[] = [];
    const bucketRange = Math.ceil(group.radius / resolutionBucketMeters);
    for (let offsetX = -bucketRange; offsetX <= bucketRange; offsetX += 1) {
      for (let offsetY = -bucketRange; offsetY <= bucketRange; offsetY += 1) {
        const bucketKey = `${bucketX + offsetX}:${bucketY + offsetY}`;
        (groupsBySpatialBucket.get(bucketKey) || []).forEach((neighbor) => {
          const dx = neighbor.x - group.x;
          const dy = neighbor.y - group.y;
          const radius = (neighbor.radius + group.radius) / 2;
          if (dx * dx + dy * dy <= radius * radius) neighbors.push(neighbor);
        });
      }
    }
    const durations = neighbors.flatMap((neighbor) => neighbor.durations);
    if (durations.length >= minimumResolutionSamples) {
      areas.push({ ...group, medianHours: median(durations) });
    }
  });
  return areas;
}

function percentile(values: number[], quantile: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * quantile))];
}

function percentileScale(values: Float32Array, quantile = 0.95) {
  const bins = 1024;
  let maximum = 0;
  let positiveCount = 0;
  values.forEach((value) => {
    if (value <= 0) return;
    maximum = Math.max(maximum, value);
    positiveCount += 1;
  });
  if (!positiveCount) return 1;

  const logMaximum = Math.log1p(maximum);
  const histogram = new Uint32Array(bins);
  values.forEach((value) => {
    if (value <= 0) return;
    const bin = Math.min(bins - 1, Math.floor(Math.log1p(value) / logMaximum * (bins - 1)));
    histogram[bin] += 1;
  });

  const target = Math.ceil(positiveCount * quantile);
  let accumulated = 0;
  for (let bin = 0; bin < bins; bin += 1) {
    accumulated += histogram[bin];
    if (accumulated >= target) {
      return Math.max(0.01, Math.expm1(logMaximum * Math.min(bins - 1, bin + 1) / (bins - 1)));
    }
  }
  return maximum;
}

export function summarizeOccurrenceResolution(sources: OccurrenceHeatSource[]): OccurrenceResolutionSummary {
  const projectedSources = sources
    .filter((source) => source.resolutionHours !== null)
    .map((source) => ({
      ...projectCoveragePosition(source.latitude, source.longitude),
      latitude: source.latitude,
      resolutionHours: source.resolutionHours,
      radius: resolutionRadiusMeters / Math.cos(source.latitude * Math.PI / 180),
    }));
  const areas = buildOccurrenceResolutionAreas(projectedSources);
  const areaDurations = areas.map((area) => area.medianHours);
  return {
    resolvedCount: projectedSources.length,
    areaCount: areas.length,
    maximumHours: areaDurations.length ? Math.max(0.25, percentile(areaDurations, 0.9)) : 1,
  };
}

export function buildOccurrenceHeatGrid(
  sources: OccurrenceHeatSource[],
  includeRecurrence = false,
  recurrencePeriodDays = 1,
  includeResolution = false,
) {
  if (!sources.length) return null;
  const safeRecurrencePeriodDays = Number.isFinite(recurrencePeriodDays) && recurrencePeriodDays > 0
    ? recurrencePeriodDays
    : 1;

  const projected = sources.map((source) => ({
    ...projectCoveragePosition(source.latitude, source.longitude),
    latitude: source.latitude,
    longitude: source.longitude,
    radius: radiusMeters / Math.cos(source.latitude * Math.PI / 180),
    severityWeight: source.severityWeight,
    occurrenceType: source.occurrenceType,
    occurrenceDay: source.occurrenceDay,
    resolutionHours: source.resolutionHours,
  }));
  const resolutionSources = includeResolution
    ? projected.filter((source) => source.resolutionHours !== null)
    : [];
  if (includeResolution && !resolutionSources.length) return null;
  const resolutionAreas = includeResolution ? buildOccurrenceResolutionAreas(resolutionSources) : [];
  if (includeResolution && !resolutionAreas.length) return null;
  const heatSources = includeResolution ? resolutionSources : projected;
  const recurrenceGroups = includeRecurrence ? buildRecurrenceGroups(projected) : [];
  const extent = heatSources.reduce((bounds, source) => ({
    minX: Math.min(bounds.minX, source.x - source.radius),
    maxX: Math.max(bounds.maxX, source.x + source.radius),
    minY: Math.min(bounds.minY, source.y - source.radius),
    maxY: Math.max(bounds.maxY, source.y + source.radius),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });

  let resolution = 50;
  function dimensions() {
    const minX = (Math.floor(extent.minX / resolution) - 1) * resolution;
    const maxY = (Math.ceil(extent.maxY / resolution) + 1) * resolution;
    const width = Math.ceil((extent.maxX - minX) / resolution) + 1;
    const height = Math.ceil((maxY - extent.minY) / resolution) + 1;
    return {
      minX,
      maxX: minX + width * resolution,
      maxY,
      minY: maxY - height * resolution,
      width,
      height,
    };
  }

  let bounds = dimensions();
  while (bounds.width * bounds.height > maximumGridCells) {
    resolution *= Math.max(1.01, Math.sqrt(bounds.width * bounds.height / maximumGridCells));
    bounds = dimensions();
  }

  const { width, height, minX, maxY } = bounds;
  const countValues = new Float32Array(width * height);
  const severityValues = new Float32Array(width * height);
  const recurrenceValues = includeRecurrence ? new Float32Array(width * height) : null;
  const resolutionValues = includeResolution ? new Float32Array(width * height) : null;
  const resolutionWeights = includeResolution ? new Float32Array(width * height) : null;
  heatSources.forEach((source) => {
    const centerX = (source.x - minX) / resolution - 0.5;
    const centerY = (maxY - source.y) / resolution - 0.5;
    const radiusCells = source.radius / resolution;
    const radiusSquared = radiusCells ** 2;
    const startX = Math.max(0, Math.ceil(centerX - radiusCells));
    const endX = Math.min(width - 1, Math.floor(centerX + radiusCells));
    const startY = Math.max(0, Math.ceil(centerY - radiusCells));
    const endY = Math.min(height - 1, Math.floor(centerY + radiusCells));
    let sampled = false;

    for (let y = startY; y <= endY; y += 1) {
      const dySquared = (y - centerY) ** 2;
      for (let x = startX; x <= endX; x += 1) {
        const ratio = ((x - centerX) ** 2 + dySquared) / radiusSquared;
        if (ratio >= 1) continue;
        const contribution = (1 - ratio) ** 2;
        const index = y * width + x;
        countValues[index] += contribution;
        severityValues[index] += contribution * source.severityWeight;
        sampled = true;
      }
    }

    if (!sampled) {
      const x = Math.max(0, Math.min(width - 1, Math.round(centerX)));
      const y = Math.max(0, Math.min(height - 1, Math.round(centerY)));
      const index = y * width + x;
      const contribution = Math.min(1, Math.PI * radiusCells ** 2 / 3);
      countValues[index] += contribution;
      severityValues[index] += contribution * source.severityWeight;
    }
  });

  recurrenceGroups.forEach((source) => {
    if (!recurrenceValues) return;
    const centerX = (source.x - minX) / resolution - 0.5;
    const centerY = (maxY - source.y) / resolution - 0.5;
    const radiusCells = source.radius / resolution;
    const radiusSquared = radiusCells ** 2;
    const startX = Math.max(0, Math.ceil(centerX - radiusCells));
    const endX = Math.min(width - 1, Math.floor(centerX + radiusCells));
    const startY = Math.max(0, Math.ceil(centerY - radiusCells));
    const endY = Math.min(height - 1, Math.floor(centerY + radiusCells));

    for (let y = startY; y <= endY; y += 1) {
      const dySquared = (y - centerY) ** 2;
      for (let x = startX; x <= endX; x += 1) {
        const ratio = ((x - centerX) ** 2 + dySquared) / radiusSquared;
        if (ratio >= 1) continue;
        const contribution = (1 - ratio) ** 2;
        const index = y * width + x;
        recurrenceValues[index] = Math.max(
          recurrenceValues[index],
          contribution * source.recurrenceDays / safeRecurrencePeriodDays,
        );
      }
    }
  });

  resolutionAreas.forEach((source) => {
    if (!resolutionValues || !resolutionWeights) return;
    const centerX = (source.x - minX) / resolution - 0.5;
    const centerY = (maxY - source.y) / resolution - 0.5;
    const radiusCells = source.radius / resolution;
    const radiusSquared = radiusCells ** 2;
    const startX = Math.max(0, Math.ceil(centerX - radiusCells));
    const endX = Math.min(width - 1, Math.floor(centerX + radiusCells));
    const startY = Math.max(0, Math.ceil(centerY - radiusCells));
    const endY = Math.min(height - 1, Math.floor(centerY + radiusCells));

    for (let y = startY; y <= endY; y += 1) {
      const dySquared = (y - centerY) ** 2;
      for (let x = startX; x <= endX; x += 1) {
        const ratio = ((x - centerX) ** 2 + dySquared) / radiusSquared;
        if (ratio >= 1) continue;
        const weight = (1 - ratio) ** 2;
        const index = y * width + x;
        resolutionValues[index] += source.medianHours * weight;
        resolutionWeights[index] += weight;
      }
    }
  });

  if (resolutionValues && resolutionWeights) {
    for (let index = 0; index < resolutionValues.length; index += 1) {
      if (resolutionWeights[index] > 0) resolutionValues[index] /= resolutionWeights[index];
    }
  }

  return {
    bounds,
    width,
    height,
    resolution,
    countValues,
    severityValues,
    recurrenceValues,
    resolutionValues,
    resolutionWeights,
    quantityScaleMaximum: percentileScale(countValues),
  };
}

function severityColor(value: number): [number, number, number] {
  const severity = Math.max(1, Math.min(4, value));
  const lowerIndex = Math.min(severityColorStops.length - 2, Math.floor(severity) - 1);
  const lower = severityColorStops[lowerIndex];
  const upper = severityColorStops[lowerIndex + 1];
  const progress = severity - lower.value;
  return lower.color.map((channel, index) => Math.round(
    channel + (upper.color[index] - channel) * progress,
  )) as [number, number, number];
}

function recurrenceColor(value: number): [number, number, number] {
  const rate = Math.max(0, Math.min(maximumRecurrenceRate, value));
  const upperIndex = Math.max(1, recurrenceColorStops.findIndex((stop) => stop.value >= rate));
  const lower = recurrenceColorStops[upperIndex - 1];
  const upper = recurrenceColorStops[upperIndex];
  const progress = (rate - lower.value) / (upper.value - lower.value);
  return lower.color.map((channel, index) => Math.round(
    channel + (upper.color[index] - channel) * progress,
  )) as [number, number, number];
}

function resolutionColor(value: number): [number, number, number] {
  const intensity = Math.max(0, Math.min(1, value));
  const upperIndex = Math.max(1, resolutionColorStops.findIndex((stop) => stop.value >= intensity));
  const lower = resolutionColorStops[upperIndex - 1];
  const upper = resolutionColorStops[upperIndex];
  const progress = (intensity - lower.value) / (upper.value - lower.value);
  return lower.color.map((channel, index) => Math.round(
    channel + (upper.color[index] - channel) * progress,
  )) as [number, number, number];
}

export function occurrenceHeatPixel(
  count: number,
  severityTotal: number,
  mode: OccurrenceHeatMode,
  recurrenceRate = 0,
  resolutionHours = 0,
  maximumResolutionHours = 1,
  maximumQuantity = 10,
): [number, number, number, number] {
  if (mode === 'recorrencia') {
    if (recurrenceRate <= 0) return [0, 0, 0, 0];
    const intensity = Math.min(1, recurrenceRate / maximumRecurrenceRate);
    const [red, green, blue] = recurrenceColor(recurrenceRate);
    const alpha = Math.round((0.2 + 0.65 * intensity) * 255);
    return [red, green, blue, alpha];
  }

  if (mode === 'tempo_resolucao') {
    if (resolutionHours <= 0) return [0, 0, 0, 0];
    const intensity = Math.min(1, resolutionHours / Math.max(0.01, maximumResolutionHours));
    const [red, green, blue] = resolutionColor(intensity);
    const alpha = Math.round((0.24 + 0.61 * intensity) * 255);
    return [red, green, blue, alpha];
  }

  if (count <= 0) return [0, 0, 0, 0];

  if (mode === 'quantidade') {
    const [red, green, blue] = coveragePixel(count, maximumQuantity);
    const alpha = Math.round((0.2 + 0.6 * coverageIntensity(count, maximumQuantity)) * 255);
    return [red, green, blue, alpha];
  }

  const averageSeverity = severityTotal / count;
  const [red, green, blue] = severityColor(averageSeverity);
  const intensity = mode === 'gravidade'
    ? Math.min(1, severityTotal / maximumSeverityTotal)
    : coverageIntensity(count, maximumQuantity);
  const alpha = Math.round((0.2 + (mode === 'gravidade' ? 0.75 : 0.6) * intensity) * 255);
  return [red, green, blue, alpha];
}

export { unprojectCoveragePosition };
