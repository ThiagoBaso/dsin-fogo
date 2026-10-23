import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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
  render(<App />);

  expect(screen.getByRole('heading', { name: 'Filtros' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Atualizar' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Mapa' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Lista' })).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
});
