import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';

jest.mock('./components/Map', () => ({
  __esModule: true,
  default: () => null,
}));

beforeEach(() => {
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
  expect(mapCounts).toHaveLength(2);
  expect(mapCounts[0]).toHaveAttribute('aria-label', '0 itens selecionados de 0 exibidos');
  expect(mapCounts[1]).toHaveAttribute('aria-label', '0 agentes selecionados de 0 exibidos');
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
