import {
  buildOccurrenceHeatGrid, collectOccurrenceHeatSources, occurrenceHeatPixel,
} from './occurrenceHeat';

const occurrence = { latitude: -22.217, longitude: -49.95, gravidade: 'baixa' as const };

test('maps severity categories to increasing weights', () => {
  const events = [
    occurrence,
    { ...occurrence, gravidade: 'media' as const },
    { ...occurrence, gravidade: 'alta' as const },
    { ...occurrence, gravidade: 'critica' as const },
  ];

  expect(collectOccurrenceHeatSources(events).sources.map((source) => source.severityWeight)).toEqual([1, 2, 3, 4]);
});

test('ignores invalid coordinates and preserves the full filtered point set', () => {
  const result = collectOccurrenceHeatSources([
    occurrence,
    { ...occurrence, latitude: Number.NaN },
    { ...occurrence, longitude: 181 },
  ]);

  expect(result.sources).toHaveLength(1);
  expect(result.excludedCount).toBe(2);
  expect(buildOccurrenceHeatGrid(result.sources)).not.toBeNull();
  expect(buildOccurrenceHeatGrid([])).toBeNull();
});

test('adds overlapping events to the same fixed-radius heat grid', () => {
  const point = collectOccurrenceHeatSources([occurrence]).sources[0];
  const one = buildOccurrenceHeatGrid([point])!;
  const two = buildOccurrenceHeatGrid([point, point])!;
  expect(two.bounds).toEqual(one.bounds);
  expect(Number.isFinite(one.bounds.maxX)).toBe(true);
  expect(two.countValues.length).toBe(one.countValues.length);
  const peak = (values: Float32Array) => {
    let maximum = 0;
    values.forEach((value) => { maximum = Math.max(maximum, value); });
    return maximum;
  };
  expect(peak(two.countValues)).toBeCloseTo(2 * peak(one.countValues));
  expect(peak(two.severityValues)).toBeCloseTo(2 * peak(one.severityValues));
});

test('uses gravity colors and intensity, while combined mode separates hue from count', () => {
  const fourLow = occurrenceHeatPixel(4, 4, 'gravidade');
  const fourCritical = occurrenceHeatPixel(4, 16, 'gravidade');
  expect(fourLow.slice(0, 3)).toEqual([21, 128, 61]);
  expect(fourCritical.slice(0, 3)).toEqual([220, 38, 38]);
  expect(fourCritical[3]).toBeGreaterThan(fourLow[3]);

  const fourLowCombined = occurrenceHeatPixel(4, 4, 'ambos');
  const fourCriticalCombined = occurrenceHeatPixel(4, 16, 'ambos');
  expect(fourLowCombined.slice(0, 3)).not.toEqual(fourCriticalCombined.slice(0, 3));
  expect(fourLowCombined[3]).toBe(fourCriticalCombined[3]);

  expect(occurrenceHeatPixel(4, 4, 'quantidade')).toEqual(occurrenceHeatPixel(4, 16, 'quantidade'));
  expect(occurrenceHeatPixel(0, 0, 'quantidade')[3]).toBe(0);
});
