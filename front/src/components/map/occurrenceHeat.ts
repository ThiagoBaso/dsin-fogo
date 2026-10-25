import type { OcorrenciaMapa } from '../../types';
import { coverageIntensity, coveragePixel, projectCoveragePosition, unprojectCoveragePosition } from './coverage';

export type OccurrenceHeatMode = 'quantidade' | 'gravidade' | 'ambos';

export interface OccurrenceHeatSource {
  latitude: number;
  longitude: number;
  severityWeight: number;
}

const maximumLatitude = 85.05112878;
const radiusMeters = 350;
const maximumGridCells = 4000000;
const maximumSeverityTotal = 16;
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

export function collectOccurrenceHeatSources(
  occurrences: Pick<OcorrenciaMapa, 'latitude' | 'longitude' | 'gravidade'>[],
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

    sources.push({ latitude, longitude, severityWeight: severityWeights[gravidade] ?? 1 });
  });

  return { sources, excludedCount };
}

export function buildOccurrenceHeatGrid(sources: OccurrenceHeatSource[]) {
  if (!sources.length) return null;

  const projected = sources.map((source) => ({
    ...projectCoveragePosition(source.latitude, source.longitude),
    radius: radiusMeters / Math.cos(source.latitude * Math.PI / 180),
    severityWeight: source.severityWeight,
  }));
  const extent = projected.reduce((bounds, source) => ({
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
  projected.forEach((source) => {
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

  return { bounds, width, height, resolution, countValues, severityValues };
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

export function occurrenceHeatPixel(
  count: number,
  severityTotal: number,
  mode: OccurrenceHeatMode,
): [number, number, number, number] {
  if (count <= 0) return [0, 0, 0, 0];

  if (mode === 'quantidade') {
    const [red, green, blue] = coveragePixel(count);
    const alpha = Math.round((0.2 + 0.6 * coverageIntensity(count)) * 255);
    return [red, green, blue, alpha];
  }

  const averageSeverity = severityTotal / count;
  const [red, green, blue] = severityColor(averageSeverity);
  const intensity = mode === 'gravidade'
    ? Math.min(1, severityTotal / maximumSeverityTotal)
    : coverageIntensity(count);
  const alpha = Math.round((0.2 + (mode === 'gravidade' ? 0.75 : 0.6) * intensity) * 255);
  return [red, green, blue, alpha];
}

export { unprojectCoveragePosition };
