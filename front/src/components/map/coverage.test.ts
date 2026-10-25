import type { Agente, Ponto } from '../../types';
import {
  buildCoverageGrid, collectCoverageSources, coverageIntensity, coveragePixel,
  projectCoveragePosition, unprojectCoveragePosition,
} from './coverage';

const source = { latitude: -22.217, longitude: -49.95, radiusKm: 0.2 };
type Grid = NonNullable<ReturnType<typeof buildCoverageGrid>>;
function sample(grid: Grid, latitude: number, longitude: number) {
  const position = projectCoveragePosition(latitude, longitude);
  const x = Math.floor((position.x - grid.bounds.minX) / grid.resolution);
  const y = Math.floor((grid.bounds.maxY - position.y) / grid.resolution);
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return 0;
  return grid.values[y * grid.width + x] ?? 0;
}

test('requires a valid registered radius and coordinate instead of inventing coverage', () => {
  const equipment: Pick<Ponto, 'latitude' | 'longitude' | 'atributos'> = {
    ...source, atributos: [{ id: 1, nome: 'raio_cobertura_km', tipo_valor: 'numero', unidade: 'km', valor: 0.2 }],
  };
  const agent: Pick<Agente, 'latitude' | 'longitude' | 'raio_atuacao_km'> = { ...source, raio_atuacao_km: 3 };
  const result = collectCoverageSources([equipment, { ...equipment, atributos: [] }],
    [agent, { ...agent, latitude: null }, { ...agent, raio_atuacao_km: null }]);
  expect(result.sources.map((item) => item.radiusKm)).toEqual([0.2, 3]);
  expect(result.equipmentCount).toBe(1);
  expect(result.agentCount).toBe(1);
  expect(result.excludedCount).toBe(3);
  expect(buildCoverageGrid([])).toBeNull();
});

test('renders visible equipment-only heat without any agents', () => {
  const equipment = { ...source, atributos: [
    { id: 1, nome: 'raio_cobertura_km', tipo_valor: 'numero' as const, unidade: 'km', valor: 0.2 },
  ] };
  const coverage = collectCoverageSources([equipment], []);
  expect(coverage.agentCount).toBe(0);
  const grid = buildCoverageGrid(coverage.sources)!;
  const pixel = coveragePixel(sample(grid, source.latitude, source.longitude));
  expect(pixel[3]).toBeGreaterThan(200);
  expect(pixel[2]).toBeGreaterThan(pixel[0]);
  expect(coveragePixel(0)[3]).toBe(0);
});

test('centers local agent coverage on its current position after movement', () => {
  const moved = { latitude: source.latitude + 0.005, longitude: source.longitude + 0.005, raio_atuacao_km: 0.03 };
  const coverage = collectCoverageSources([], [moved]);
  const grid = buildCoverageGrid(coverage.sources)!;
  expect(sample(grid, moved.latitude, moved.longitude)).toBeGreaterThan(0.75);
  expect(sample(grid, source.latitude, source.longitude)).toBe(0);
});

test('keeps the heat inside the recorded geographic radius, including small equipment', () => {
  for (const radiusKm of [0.01, 0.2, 3]) {
    const grid = buildCoverageGrid([{ ...source, radiusKm }])!;
    let coveredCells = 0;
    grid.values.forEach((value, index) => {
      if (!value) return;
      coveredCells += 1;
      const x = grid.bounds.minX + (index % grid.width + 0.5) * grid.resolution;
      const y = grid.bounds.maxY - (Math.floor(index / grid.width) + 0.5) * grid.resolution;
      const [latitude, longitude] = unprojectCoveragePosition(x, y);
      const radians = Math.PI / 180;
      const haversine = Math.sin((latitude - source.latitude) * radians / 2) ** 2
        + Math.cos(latitude * radians) * Math.cos(source.latitude * radians)
        * Math.sin((longitude - source.longitude) * radians / 2) ** 2;
      const groundDistance = 2 * 6378137 * Math.asin(Math.sqrt(haversine));
      // Local Mercator circles approximate geodesic circles within 0.1% at these radii.
      expect(groundDistance).toBeLessThanOrEqual(radiusKm * 1000 * 1.001);
    });
    expect(coveredCells).toBeGreaterThan(0);
    expect(sample(grid, source.latitude, source.longitude)).toBeGreaterThan(0.75);
  }
});

test('adds overlapping coverage and keeps its intensity when a distant cluster is included', () => {
  const local = buildCoverageGrid([source])!;
  const overlap = buildCoverageGrid([source, source])!;
  const distant = { ...source, latitude: source.latitude + 0.05, longitude: source.longitude + 0.05 };
  const combined = buildCoverageGrid([source, ...Array.from({ length: 12 }, () => distant)])!;
  const original = sample(local, source.latitude, source.longitude);
  expect(sample(overlap, source.latitude, source.longitude)).toBeCloseTo(2 * original);
  expect(sample(combined, source.latitude, source.longitude)).toBeCloseTo(original);
  expect(sample(combined, distant.latitude, distant.longitude)).toBeGreaterThan(10);
  expect(coverageIntensity(original)).toBeLessThan(coverageIntensity(2 * original));
  expect(coverageIntensity(1)).toBeLessThan(0.3);
  expect(coverageIntensity(10)).toBe(1);
  const center = projectCoveragePosition(source.latitude, source.longitude);
  const restored = unprojectCoveragePosition(center.x, center.y);
  expect(restored[0]).toBeCloseTo(source.latitude, 6);
  expect(restored[1]).toBeCloseTo(source.longitude, 6);
});
