import type { Agente, Ponto } from '../../types';

export interface CoverageSource {
  latitude: number;
  longitude: number;
  radiusKm: number;
}

const earthRadius = 6378137;
const maximumLatitude = 85.05112878;
const maximumGridCells = 4000000;
const heatColors = [
  { at: 0, color: [30, 64, 175] },
  { at: 0.35, color: [37, 99, 235] },
  { at: 0.55, color: [6, 182, 212] },
  { at: 0.7, color: [34, 197, 94] },
  { at: 0.85, color: [250, 204, 21] },
  { at: 1, color: [220, 38, 38] },
];

export const coverageGradient = `linear-gradient(90deg, ${heatColors
  .map((stop) => `rgb(${stop.color.join(',')}) ${stop.at * 100}%`).join(', ')})`;

export function collectCoverageSources(
  equipment: Pick<Ponto, 'latitude' | 'longitude' | 'atributos'>[],
  agents: Pick<Agente, 'latitude' | 'longitude' | 'raio_atuacao_km'>[],
) {
  const sources: CoverageSource[] = [];
  let equipmentCount = 0;
  let agentCount = 0;
  function include(latitude: unknown, longitude: unknown, radiusKm: unknown) {
    if (typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) > maximumLatitude
      || typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180
      || typeof radiusKm !== 'number' || !Number.isFinite(radiusKm) || radiusKm <= 0) return false;
    sources.push({ latitude, longitude, radiusKm });
    return true;
  }
  equipment.forEach((point) => {
    const radius = point.atributos?.find((attribute) => attribute.nome === 'raio_cobertura_km');
    if (include(point.latitude, point.longitude, radius?.tipo_valor === 'numero' ? radius.valor : null)) equipmentCount += 1;
  });
  agents.forEach((agent) => {
    if (include(agent.latitude, agent.longitude, agent.raio_atuacao_km)) agentCount += 1;
  });
  return { sources, equipmentCount, agentCount, excludedCount: equipment.length + agents.length - sources.length };
}

export function projectCoveragePosition(latitude: number, longitude: number) {
  return {
    x: earthRadius * longitude * Math.PI / 180,
    y: earthRadius * Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360)),
  };
}

export function unprojectCoveragePosition(x: number, y: number): [number, number] {
  return [(2 * Math.atan(Math.exp(y / earthRadius)) - Math.PI / 2) * 180 / Math.PI,
    x / earthRadius * 180 / Math.PI];
}

/** Each source fades to zero at its registered radius. No viewport or zoom participates. */
export function buildCoverageGrid(sources: CoverageSource[]) {
  if (!sources.length) return null;
  const projected = sources.map((source) => ({
    ...projectCoveragePosition(source.latitude, source.longitude),
    radius: source.radiusKm * 1000 / Math.cos(source.latitude * Math.PI / 180),
  }));
  const extent = projected.reduce((bounds, source) => ({
    minX: Math.min(bounds.minX, source.x - source.radius),
    maxX: Math.max(bounds.maxX, source.x + source.radius),
    minY: Math.min(bounds.minY, source.y - source.radius),
    maxY: Math.max(bounds.maxY, source.y + source.radius),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });

  // Resolve small equipment footprints when possible; bound memory for extensive datasets.
  let resolution = Math.min(50, ...projected.map((source) => source.radius / 3));
  function dimensions() {
    const minX = (Math.floor(extent.minX / resolution) - 1) * resolution;
    const maxY = (Math.ceil(extent.maxY / resolution) + 1) * resolution;
    const width = Math.ceil((extent.maxX - minX) / resolution) + 1;
    const height = Math.ceil((maxY - extent.minY) / resolution) + 1;
    return { minX, maxX: minX + width * resolution, minY: maxY - height * resolution, maxY, width, height };
  }
  let bounds = dimensions();
  while (bounds.width * bounds.height > maximumGridCells) {
    resolution *= Math.max(1.01, Math.sqrt(bounds.width * bounds.height / maximumGridCells));
    bounds = dimensions();
  }
  const { width, height, minX, maxY } = bounds;
  const values = new Float32Array(width * height);
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
        // Keep the equipment footprint visible across its radius, fading smoothly to zero at the edge.
        values[y * width + x] += (1 - ratio) ** 2;
        sampled = true;
      }
    }
    if (!sampled) {
      // Preserve subpixel sources in their own cell, with fractional area instead of enlarging their radius.
      const x = Math.round(centerX);
      const y = Math.round(centerY);
      values[y * width + x] += Math.min(1, Math.PI * radiusSquared / 3);
    }
  });
  return { bounds, width, height, resolution, values };
}

/** Logarithmic color intensity with a configurable upper scale. */
export function coverageIntensity(value: number, maximum = 10) {
  return Math.min(1, Math.log1p(Math.max(0, value)) / Math.log1p(Math.max(0.01, maximum)));
}

export function coveragePixel(value: number, maximum = 10): [number, number, number, number] {
  if (value <= 0) return [0, 0, 0, 0];
  const intensity = coverageIntensity(value, maximum);
  const upperIndex = Math.max(1, heatColors.findIndex((stop) => stop.at >= intensity));
  const lower = heatColors[upperIndex - 1];
  const upper = heatColors[upperIndex];
  const progress = (intensity - lower.at) / (upper.at - lower.at);
  const rgb = lower.color.map((channel, index) => Math.round(channel + (upper.color[index] - channel) * progress));
  return [rgb[0], rgb[1], rgb[2], Math.round(0.9 * Math.min(1, value) ** 0.65 * 255)];
}
