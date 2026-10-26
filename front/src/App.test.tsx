import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import Map from './components/Map';
import type { Agente, OcorrenciaMapa, Ponto } from './types';

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

test('renders occurrence heat separately and keeps filtered points when occurrence markers are hidden', async () => {
  const occurrences: OcorrenciaMapa[] = [
    {
      id: 11, tipo: 'Acidente', gravidade: 'critica', status: 'aberta', descricao: null,
      ocorrida_em: '2026-10-25T10:00:00', logradouro: null, bairro: 'Centro', cidade: 'Marília', uf: 'SP',
      latitude: -22.217, longitude: -49.95, orgao_nome: 'SMU', equipamento_nome: null,
    },
    {
      id: 12, tipo: 'Incêndio', gravidade: 'media', status: 'em_atendimento', descricao: null,
      ocorrida_em: '2026-10-25T10:10:00', logradouro: null, bairro: 'Centro', cidade: 'Marília', uf: 'SP',
      latitude: -22.218, longitude: -49.951, orgao_nome: 'SMU', equipamento_nome: null,
    },
  ];
  (fetch as jest.Mock).mockImplementation((input: string) => Promise.resolve({
    ok: true,
    json: async () => String(input).includes('/api/ocorrencias') ? occurrences : [],
  }));
  const mapProps = () => (Map as jest.Mock).mock.calls.slice(-1)[0][0];
  const { container } = render(<App />);

  const occurrenceFilters = container.querySelector('.equipment-occurrence-filters') as HTMLElement;
  fireEvent.click(within(occurrenceFilters).getByText('Ocorrências'));
  await waitFor(() => expect(mapProps().occurrenceHeatSources).toHaveLength(2));
  expect(mapProps().occurrenceHeatPeriodDays).toBe(1);
  expect(mapProps().occurrences).toEqual([]);
  expect(mapProps().occurrenceHeatEnabled).toBe(false);

  fireEvent.click(screen.getByLabelText('Aplicar mapa de calor de ocorrências'));
  expect(mapProps().coverageHeatEnabled).toBe(false);
  expect(mapProps().occurrenceHeatEnabled).toBe(true);
  expect(mapProps().occurrenceHeatMode).toBe('quantidade');
  expect(mapProps().occurrenceHeatSources.map((source: { severityWeight: number }) => source.severityWeight)).toEqual([4, 2]);

  fireEvent.click(within(occurrenceFilters).getByLabelText('Exibir ocorrências no mapa'));
  await waitFor(() => expect(mapProps().occurrences).toEqual(occurrences));

  fireEvent.change(screen.getByLabelText('Visualizar mapa de calor de ocorrências por'), {
    target: { value: 'gravidade' },
  });
  expect(mapProps().occurrenceHeatMode).toBe('gravidade');
  expect(mapProps().occurrenceHeatSources.map((source: { severityWeight: number }) => source.severityWeight)).toEqual([4, 2]);

  fireEvent.change(screen.getByLabelText('Visualizar mapa de calor de ocorrências por'), {
    target: { value: 'recorrencia' },
  });
  expect(mapProps().occurrenceHeatMode).toBe('recorrencia');

  const visibility = within(container.querySelector('.map-selection-summary') as HTMLElement);
  fireEvent.click(visibility.getByLabelText('Exibir marcadores de ocorrências no mapa'));
  expect(mapProps().showOccurrences).toBe(false);
  expect(mapProps().occurrenceHeatEnabled).toBe(true);
  expect(mapProps().occurrenceHeatSources).toHaveLength(2);
});

test('clicking a selected vehicle marker deselects it and removes its route', async () => {
  const vehicle = {
    id: 9, nome: 'Viatura DEMO-00009', numero_serie: 'DEMO-00009', modelo: 'Modelo-01',
    orgao_nome: 'Polícia Militar', orgao_sigla: 'PM', tipo_id: 9, tipo: 'Viatura policial', mobilidade: 'movel',
    situacao_id: 1, situacao: 'operacional', latitude: -22.217, longitude: -49.95,
    latitude_fixa: -22.217, longitude_fixa: -49.95, latitude_gps: -22.217, longitude_gps: -49.95,
    logradouro: null, referencia: null, bairro: null, regiao: null, cidade: null, uf: 'SP', cep: null,
    status: 'ativo', atributos: [],
  } as Ponto;
  const route = {
    id: 1, id_equipamento: vehicle.id, numero_serie: vehicle.numero_serie, inicio_em: '2026-01-01T08:00:00',
    fim_em: null, distancia_m: 1200, situacao: 'em_andamento',
    posicoes: [{ latitude: -22.217, longitude: -49.95, registrado_em: '2026-01-01T08:00:00' }],
  };
  (fetch as jest.Mock).mockImplementation((input: string) => {
    const url = String(input);
    const data = url.endsWith('/api/equipamentos') ? [vehicle]
      : url.includes('/api/viagens/rotas-ativas') ? [route]
        : url.includes(`/api/equipamentos/${vehicle.id}`) ? vehicle : [];
    return Promise.resolve({ ok: true, json: async () => data });
  });
  const mapProps = () => (Map as jest.Mock).mock.calls.slice(-1)[0][0];
  const { container } = render(<App />);
  await waitFor(() => expect(mapProps().pontos).toHaveLength(0));

  const typeFilters = within(container.querySelector('[role="group"][aria-label="Tipo de equipamento"]') as HTMLElement);
  fireEvent.click(typeFilters.getByLabelText('Radar fixo'));
  fireEvent.click(typeFilters.getByLabelText('Viatura policial'));
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
  await waitFor(() => expect(mapProps().pontos).toEqual([vehicle]));

  act(() => mapProps().onSelecionar(vehicle));
  await waitFor(() => expect(mapProps().rotas).toEqual([route]));
  expect(mapProps().selecionadosIds).toEqual([vehicle.id]);

  act(() => mapProps().onSelecionar(vehicle));
  await waitFor(() => expect(mapProps().rotas).toEqual([]));
  expect(mapProps().selecionadosIds).toEqual([]);
});

test('applying filters removes a selected item that is no longer visible', async () => {
  const equipment = {
    id: 1, nome: 'Radar', numero_serie: 'DEMO-1', tipo_id: 1, situacao_id: 1, mobilidade: 'fixo',
    latitude: -22.217, longitude: -49.95,
    atributos: [{ id: 1, nome: 'raio_cobertura_km', tipo_valor: 'numero', unidade: 'km', valor: 0.2 }],
  } as Ponto;
  (fetch as jest.Mock).mockImplementation((input: string) => Promise.resolve({
    ok: true,
    json: async () => String(input).endsWith('/api/equipamentos') ? [equipment] : [],
  }));
  const mapProps = () => (Map as jest.Mock).mock.calls.slice(-1)[0][0];
  const { container } = render(<App />);
  await waitFor(() => expect(mapProps().pontos).toEqual([equipment]));
  act(() => mapProps().onSelecionar(equipment));
  await waitFor(() => expect(mapProps().selecionadosIds).toEqual([equipment.id]));

  const typeFilters = within(container.querySelector('[role="group"][aria-label="Tipo de equipamento"]') as HTMLElement);
  fireEvent.click(typeFilters.getByLabelText('Radar fixo'));
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));

  await waitFor(() => expect(mapProps().selecionadosIds).toEqual([]));
  expect(mapProps().pontos).toEqual([]);
  expect(screen.getByText('Selecione um equipamento no mapa ou na lista para ver os detalhes.')).toBeInTheDocument();
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
