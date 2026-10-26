import { OcorrenciaTendencia } from '../../types';
import { buildOccurrenceTrends } from './occurrenceTrends';

const occurrence = (overrides: Partial<OcorrenciaTendencia> = {}): OcorrenciaTendencia => ({
  id: 1,
  tipo: 'Incêndio',
  gravidade: 'alta',
  status: 'resolvida',
  ocorrida_em: '2026-01-01T08:00:00',
  resolvida_em: '2026-01-01T10:00:00',
  latitude: -22.217,
  longitude: -49.95,
  ...overrides,
});

test('adapts chart intervals to the selected period length', () => {
  const records = [occurrence()];
  expect(buildOccurrenceTrends(records, 'quantidade', {
    mode: 'periodo', start: '2026-01-01T00:00', end: '2026-01-20T23:59',
  })?.granularity).toBe('dia');
  expect(buildOccurrenceTrends(records, 'quantidade', {
    mode: 'periodo', start: '2026-01-01T00:00', end: '2026-05-31T23:59',
  })?.granularity).toBe('semana');
  expect(buildOccurrenceTrends(records, 'quantidade', {
    mode: 'periodo', start: '2024-01-01T00:00', end: '2026-01-01T23:59',
  })?.granularity).toBe('mês');
});

test('shows the exact date range for each weekly interval', () => {
  const trends = buildOccurrenceTrends([occurrence()], 'quantidade', {
    mode: 'periodo', start: '2026-01-01T00:00', end: '2026-05-31T23:59',
  })!;

  expect(trends.volume[0].fullLabel).toBe('Semana de 29/12/2025 a 04/01/2026');
  expect(trends.volume[0].label).toBe('29/12–04/01');
});

test('identifies partial end intervals and includes years in the displayed range', () => {
  const trends = buildOccurrenceTrends([occurrence()], 'quantidade', {
    mode: 'periodo', start: '2025-10-20T00:00', end: '2026-10-26T10:30',
  })!;

  expect(trends.granularity).toBe('mês');
  expect(trends.startLabel).toBe('20/10/2025');
  expect(trends.endLabel).toBe('26/10/2026');
  expect(trends.volume[0].complete).toBe(false);
  expect(trends.volume[trends.volume.length - 1].complete).toBe(false);
  expect(trends.volume[trends.volume.length - 2]?.complete).toBe(true);
});

test('groups resolution medians by resolution date, including cases opened before the period', () => {
  const records = [
    occurrence({ id: 1, ocorrida_em: '2025-12-29T08:00:00', resolvida_em: '2026-01-02T08:00:00' }),
    occurrence({ id: 2, ocorrida_em: '2026-01-10T08:00:00', resolvida_em: '2026-01-20T08:00:00' }),
    occurrence({ id: 3, ocorrida_em: '2026-01-15T08:00:00', resolvida_em: null, status: 'em_atendimento' }),
  ];
  const trends = buildOccurrenceTrends(records, 'tempo_resolucao', {
    mode: 'periodo', start: '2026-01-01T00:00', end: '2026-01-31T23:59',
  })!;

  expect(trends.totalOccurrences).toBe(2);
  expect(trends.metric.reduce((total, point) => total + point.count, 0)).toBe(2);
  expect(trends.metric.find((point) => point.label === '02/01')?.value).toBe(96);
  expect(trends.metric.find((point) => point.label === '20/01')?.value).toBe(240);
});

test('breaks down occurrences by type and severity using their occurrence dates', () => {
  const records = [
    occurrence({
      id: 1,
      tipo: 'Trânsito',
      gravidade: 'baixa',
      ocorrida_em: '2025-12-29T08:00:00',
      resolvida_em: '2026-01-02T08:00:00',
    }),
    occurrence({
      id: 2,
      tipo: 'trânsito',
      gravidade: 'alta',
      ocorrida_em: '2026-01-10T08:00:00',
      resolvida_em: '2026-01-20T08:00:00',
    }),
    occurrence({
      id: 3,
      tipo: 'Incêndio',
      gravidade: 'critica',
      status: 'em_atendimento',
      ocorrida_em: '2026-01-15T08:00:00',
      resolvida_em: null,
    }),
  ];
  const trends = buildOccurrenceTrends(records, 'tempo_resolucao', {
    mode: 'periodo', start: '2026-01-01T00:00', end: '2026-01-31T23:59',
  })!;

  expect(trends.totalOccurrences).toBe(2);
  expect(trends.byType).toEqual([
    { label: 'Incêndio', count: 1 },
    { label: 'Trânsito', count: 1 },
  ]);
  expect(trends.bySeverity).toEqual([
    { label: 'Crítica', count: 1 },
    { label: 'Alta', count: 1 },
  ]);
  expect(trends.metric.reduce((total, point) => total + point.count, 0)).toBe(2);
});

test('counts recurring events only for the same type and nearby places on different days', () => {
  const records = [
    occurrence({ id: 1, ocorrida_em: '2026-01-01T08:00:00' }),
    occurrence({ id: 2, ocorrida_em: '2026-01-03T08:00:00' }),
    occurrence({ id: 3, tipo: 'Trânsito', ocorrida_em: '2026-01-04T08:00:00' }),
    occurrence({ id: 4, latitude: -22.23, ocorrida_em: '2026-01-05T08:00:00' }),
  ];
  const trends = buildOccurrenceTrends(records, 'recorrencia', {
    mode: 'periodo', start: '2026-01-01T00:00', end: '2026-01-31T23:59',
  })!;

  expect(trends.metric.reduce((total, point) => total + point.count, 0)).toBe(2);
});
