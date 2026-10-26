import { render, screen } from '@testing-library/react';
import type { OcorrenciaTendencia } from '../types';
import OccurrenceTrendsPanel from './OccurrenceTrendsPanel';

const resolved: OcorrenciaTendencia = {
  id: 1,
  tipo: 'Incêndio',
  gravidade: 'alta',
  status: 'resolvida',
  ocorrida_em: '2026-01-01T08:00:00',
  resolvida_em: '2026-01-01T10:00:00',
  latitude: -22.217,
  longitude: -49.95,
};

test('shows interval volume and the resolution metric with a period comparison', () => {
  render(
    <OccurrenceTrendsPanel
      occurrences={[resolved, { ...resolved, id: 2, resolvida_em: '2026-01-02T14:00:00' }]}
      mode="tempo_resolucao"
      period={{ mode: 'periodo', start: '2026-01-01T00:00', end: '2026-01-02T23:59' }}
      selectedTypes={null}
      selectedGravities={null}
      loading={false}
      error=""
    />,
  );

  expect(screen.getByRole('heading', { name: 'Tendência do mapa' })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /Ocorrências por intervalo/ })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /Mediana do tempo de resolução/ })).toBeInTheDocument();
  expect(screen.getByText(/Casos agrupados pela data de resolução/)).toBeInTheDocument();
  expect(screen.getByText(/resolução mais lenta/)).toBeInTheDocument();
});

test('spaces long-period date labels evenly while keeping the final month visible', () => {
  render(
    <OccurrenceTrendsPanel
      occurrences={[resolved]}
      mode="quantidade"
      period={{ mode: 'periodo', start: '2024-01-01T00:00', end: '2026-10-26T23:59' }}
      selectedTypes={null}
      selectedGravities={null}
      loading={false}
      error=""
    />,
  );

  const chart = screen.getByRole('img', { name: /Ocorrências por intervalo/ });
  const monthLabels = Array.from(chart.querySelectorAll('.occurrence-trend-axis-label'))
    .map((label) => label.textContent || '')
    .filter((label) => label.includes('/'));

  expect(monthLabels).toHaveLength(6);
  expect(monthLabels[monthLabels.length - 1]).toBe('out/26');
  expect(monthLabels).not.toContain('ago/26');
});

test('explains why current occurrences have no resolution trend', () => {
  render(
    <OccurrenceTrendsPanel
      occurrences={[{ ...resolved, status: 'em_atendimento', resolvida_em: null }]}
      mode="tempo_resolucao"
      period={{ mode: 'atual', start: '2026-01-01T00:00', end: '2026-01-02T23:59' }}
      selectedTypes={null}
      selectedGravities={null}
      loading={false}
      error=""
    />,
  );

  expect(screen.getByText(/O filtro Atuais contém apenas ocorrências abertas ou em atendimento/)).toBeInTheDocument();
});
