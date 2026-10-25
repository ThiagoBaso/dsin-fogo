import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import Map from './components/Map';
import type { Agente, Ponto } from './types';

jest.mock('./components/Map', () => ({
  __esModule: true,
  default: jest.fn(() => null),
}));

jest.mock('./components/LocationMiniMap', () => ({
  EquipmentLocationMiniMap: () => null,
  AgentLocationMiniMap: () => null,
}));

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(global, 'fetch', {
    configurable: true,
    writable: true,
    value: jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }),
  });
});

test('renders the filter panel and view switch', async () => {
  const { container } = render(<App />);

  expect(screen.getByRole('heading', { name: 'Filtros' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Atualizar' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Mapa' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Lista' })).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());

  const mapCounts = container.querySelectorAll('.map-selection-summary .item-list-selection-count');
  expect(mapCounts).toHaveLength(3);
  expect(mapCounts[0]).toHaveAttribute('aria-label', '0 itens selecionados de 0 exibidos');
  expect(mapCounts[1]).toHaveAttribute('aria-label', '0 agentes selecionados de 0 exibidos');
});

test('includes agents in coverage only through filters, while hiding markers preserves coverage', async () => {
  const equipment = {
    id: 1, nome: 'Radar', numero_serie: 'DEMO-1', tipo_id: 1, situacao_id: 1, mobilidade: 'fixo',
    latitude: -22.217, longitude: -49.95,
    atributos: [{ id: 1, nome: 'raio_cobertura_km', tipo_valor: 'numero', unidade: 'km', valor: 0.2 }],
  } as Ponto;
  const agent = {
    id: 2, nome: 'Agente', cargo: 'fiscal', orgao_id: 1, orgao_nome: 'SMU', ativo_cadastro: true,
    latitude: -22.22, longitude: -49.95, raio_atuacao_km: 3,
  } as Agente;
  (fetch as jest.Mock).mockImplementation((url: string) => Promise.resolve({
    ok: true,
    json: async () => url.endsWith('/equipamentos') ? [equipment] : url.endsWith('/agentes') ? [agent] : [],
  }));
  const mapProps = () => (Map as jest.Mock).mock.calls.slice(-1)[0][0];
  const { container } = render(<App />);
  await waitFor(() => expect(mapProps().coverageSources).toHaveLength(1));
  fireEvent.click(screen.getByLabelText('Aplicar mapa de calor de cobertura'));
  expect(mapProps().coverageHeatEnabled).toBe(true);
  const filter = within(container.querySelector('.equipment-agent-filters') as HTMLElement)
    .getByLabelText('Exibir agentes no mapa');
  expect(filter).not.toBeChecked();
  expect(mapProps().agents).toHaveLength(0);
  fireEvent.click(filter);
  expect(mapProps().coverageSources).toHaveLength(2);
  expect(mapProps().showAgents).toBe(true);
  const sources = mapProps().coverageSources;
  const visibility = within(container.querySelector('.map-selection-summary') as HTMLElement);
  fireEvent.click(visibility.getByLabelText('Exibir agentes no mapa'));
  fireEvent.click(visibility.getByLabelText('Exibir itens no mapa'));
  expect(mapProps().showAgents).toBe(false);
  expect(mapProps().pontos).toHaveLength(0);
  expect(mapProps().coverageSources).toBe(sources);
  fireEvent.click(filter);
  expect(mapProps().coverageSources).toHaveLength(1);
  expect(mapProps().agents).toHaveLength(0);
});

test('preserves each list scroll position while switching views', async () => {
  const { container } = render(<App />);
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());

  const equipmentList = container.querySelector('.equipment-list') as HTMLElement;
  const agentList = container.querySelector('.agent-list') as HTMLElement;

  fireEvent.click(screen.getByRole('button', { name: 'Lista' }));
  equipmentList.scrollTop = 240;

  fireEvent.click(screen.getByRole('button', { name: 'Lista de agentes' }));
  expect(equipmentList).toHaveAttribute('hidden');
  expect(equipmentList.scrollTop).toBe(240);
  agentList.scrollTop = 120;

  fireEvent.click(screen.getByRole('button', { name: 'Mapa' }));
  expect(agentList).toHaveAttribute('hidden');
  expect(agentList.scrollTop).toBe(120);

  fireEvent.click(screen.getByRole('button', { name: 'Lista' }));
  expect(equipmentList.scrollTop).toBe(240);

  fireEvent.click(screen.getByRole('button', { name: 'Lista de agentes' }));
  expect(agentList.scrollTop).toBe(120);
});
