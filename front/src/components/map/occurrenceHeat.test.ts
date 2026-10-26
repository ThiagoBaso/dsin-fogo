import {
  buildOccurrenceHeatGrid, collectOccurrenceHeatSources, countOccurrencePeriodDays, occurrenceHeatPixel,
  summarizeOccurrenceResolution,
} from './occurrenceHeat';

const occurrence = {
  latitude: -22.217,
  longitude: -49.95,
  gravidade: 'baixa' as const,
  status: 'aberta' as const,
  tipo: 'trânsito',
  ocorrida_em: '2024-01-01T08:00:00',
  resolvida_em: null,
};

function peak(values: Float32Array) {
  let maximum = 0;
  values.forEach((value) => { maximum = Math.max(maximum, value); });
  return maximum;
}

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
  expect(peak(two.countValues)).toBeCloseTo(2 * peak(one.countValues));
  expect(peak(two.severityValues)).toBeCloseTo(2 * peak(one.severityValues));
  expect(two.quantityScaleMaximum).toBeGreaterThan(one.quantityScaleMaximum);
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
  const fixedQuantityScale = occurrenceHeatPixel(10, 10, 'quantidade');
  const adaptiveQuantityScale = occurrenceHeatPixel(10, 10, 'quantidade', 0, 0, 1, 100);
  expect(fixedQuantityScale.slice(0, 3)).toEqual([220, 38, 38]);
  expect(adaptiveQuantityScale[0]).toBeLessThan(fixedQuantityScale[0]);
  expect(occurrenceHeatPixel(0, 0, 'quantidade')[3]).toBe(0);
});

test('recurrence counts distinct days of the same type within 350 meters', () => {
  const twoDays = collectOccurrenceHeatSources([
    occurrence,
    { ...occurrence, ocorrida_em: '2024-01-08T11:00:00' },
  ]);
  const twoDayPeak = peak(buildOccurrenceHeatGrid(twoDays.sources, true, 8)!.recurrenceValues!);
  expect(twoDayPeak).toBeGreaterThan(0);
  expect(twoDayPeak).toBeCloseTo(2 / 8, 1);

  const repeated = collectOccurrenceHeatSources([
    occurrence,
    { ...occurrence, ocorrida_em: '2024-01-08T11:00:00' },
    { ...occurrence, latitude: -22.218, ocorrida_em: '2024-01-15T09:00:00' },
  ]);
  const grid = buildOccurrenceHeatGrid(repeated.sources, true, 15)!;
  const recurrencePeak = peak(grid.recurrenceValues!);
  const longerPeriodPeak = peak(buildOccurrenceHeatGrid(repeated.sources, true, 30)!.recurrenceValues!);

  expect(recurrencePeak).toBeCloseTo(3 / 15, 1);
  expect(longerPeriodPeak).toBeCloseTo(3 / 30, 1);
  expect(recurrencePeak).toBeGreaterThan(longerPeriodPeak);
  expect(occurrenceHeatPixel(0, 0, 'recorrencia', recurrencePeak)[3]).toBeGreaterThan(0);
  expect(occurrenceHeatPixel(0, 0, 'recorrencia', 0.15)[3])
    .toBeGreaterThan(occurrenceHeatPixel(0, 0, 'recorrencia', 0.03)[3]);
});

test('counts inclusive calendar days for the recurrence period', () => {
  expect(countOccurrencePeriodDays('2024-01-01T12:00', '2024-01-01T23:59')).toBe(1);
  expect(countOccurrencePeriodDays('2024-01-01T00:00', '2024-01-08T23:59')).toBe(8);
  expect(countOccurrencePeriodDays('2024-02-28T00:00', '2024-03-01T23:59')).toBe(3);
  expect(countOccurrencePeriodDays('2024-01-08T00:00', '2024-01-01T00:00')).toBe(1);
});

test('does not call same-day events, different types, or distant events recurrent', () => {
  const sameDay = collectOccurrenceHeatSources([
    occurrence,
    { ...occurrence, latitude: -22.218, ocorrida_em: '2024-01-01T18:00:00' },
  ]);
  const differentTypes = collectOccurrenceHeatSources([
    occurrence,
    { ...occurrence, tipo: 'obstrução', ocorrida_em: '2024-01-08T11:00:00' },
  ]);
  const distant = collectOccurrenceHeatSources([
    occurrence,
    { ...occurrence, latitude: -22.223, ocorrida_em: '2024-01-08T11:00:00' },
  ]);

  expect(peak(buildOccurrenceHeatGrid(sameDay.sources, true)!.recurrenceValues!)).toBe(0);
  expect(peak(buildOccurrenceHeatGrid(differentTypes.sources, true)!.recurrenceValues!)).toBe(0);
  expect(peak(buildOccurrenceHeatGrid(distant.sources, true)!.recurrenceValues!)).toBe(0);
  expect(occurrenceHeatPixel(1, 1, 'recorrencia', 0)).toEqual([0, 0, 0, 0]);
});

test('builds resolution heat from resolved events using a local median', () => {
  const events = [
    { ...occurrence, status: 'resolvida' as const, resolvida_em: '2024-01-01T09:00:00' },
    { ...occurrence, status: 'resolvida' as const, resolvida_em: '2024-01-01T13:00:00' },
    { ...occurrence, status: 'resolvida' as const, resolvida_em: '2024-01-01T12:00:00' },
    { ...occurrence, status: 'em_atendimento' as const, resolvida_em: null },
  ];
  const sources = collectOccurrenceHeatSources(events).sources;
  const summary = summarizeOccurrenceResolution(sources);
  const grid = buildOccurrenceHeatGrid(sources, false, 1, true)!;

  expect(sources.map((source) => source.resolutionHours)).toEqual([1, 5, 4, null]);
  expect(summary).toEqual({ resolvedCount: 3, areaCount: 1, maximumHours: 4 });
  expect(peak(grid.resolutionValues!)).toBeCloseTo(4);
  expect(buildOccurrenceHeatGrid(sources.slice(0, 2), false, 1, true)).toBeNull();
});

test('uses blue for faster resolution and red for slower resolution', () => {
  const fast = occurrenceHeatPixel(0, 0, 'tempo_resolucao', 0, 0.25, 10);
  const slow = occurrenceHeatPixel(0, 0, 'tempo_resolucao', 0, 10, 10);

  expect(fast.slice(0, 3)).toEqual([28, 74, 178]);
  expect(slow.slice(0, 3)).toEqual([220, 38, 38]);
  expect(slow[3]).toBeGreaterThan(fast[3]);
  expect(occurrenceHeatPixel(0, 0, 'tempo_resolucao', 0, 0, 10)[3]).toBe(0);
});
