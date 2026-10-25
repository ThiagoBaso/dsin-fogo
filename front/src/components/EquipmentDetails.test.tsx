import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import EquipmentDetails from './EquipmentDetails';
import type { DetalhesEquipamento, Ponto } from '../types';

const ponto: Ponto = {
  id: 7,
  nome: 'Radar de teste',
  numero_serie: 'SERIE-007',
  tipo_id: 1,
  tipo: 'Radar de velocidade',
  mobilidade: 'movel',
  situacao_id: 1,
  situacao: 'operacional',
  latitude: -22.21,
  longitude: -49.95,
  latitude_fixa: -22.22,
  longitude_fixa: -49.96,
  latitude_gps: -22.21,
  longitude_gps: -49.95,
  logradouro: 'Rua de teste',
  referencia: 'Próximo à praça',
  bairro: 'Centro',
  regiao: 'Central',
  cidade: 'Marília',
  uf: 'SP',
  cep: '17500000',
  status: 'ativo',
};

const detalhes: DetalhesEquipamento = {
  id: ponto.id,
  tipo_id: ponto.tipo_id,
  tipo: ponto.tipo,
  numero_serie: 'SERIE-007',
  marca: 'DSIN',
  modelo: 'Modelo de teste',
  mobilidade: 'movel',
  situacao_id: ponto.situacao_id,
  situacao: ponto.situacao,
  orgao_nome: 'Secretaria de Mobilidade',
  orgao_sigla: 'SM',
  logradouro: ponto.logradouro,
  referencia: ponto.referencia,
  bairro: ponto.bairro,
  regiao: ponto.regiao,
  cidade: ponto.cidade,
  uf: ponto.uf,
  cep: ponto.cep,
  latitude: ponto.latitude,
  longitude: ponto.longitude,
  posicao_registrada_em: '2026-10-23T12:00:00',
  velocidade_kmh: 35,
  cadastrado_em: '2026-01-01T12:00:00',
  instalado_em: '2026-02-01T12:00:00',
  atributos: [{
    id: 1,
    nome: 'visao_noturna',
    tipo_valor: 'booleano',
    unidade: null,
    valor: true,
  }],
};

beforeEach(() => {
  Object.defineProperty(global, 'fetch', {
    configurable: true,
    writable: true,
    value: jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const data = url.endsWith('/ocorrencias') || url.endsWith('/manutencoes') || url.includes('/viagens?')
        ? []
        : detalhes;
      return Promise.resolve({
        ok: true,
        json: async () => data,
      });
    }),
  });
});

test('renders each equipment detail tab and its loaded content', async () => {
  render(<EquipmentDetails ponto={ponto} dataHora={null} agentes={[]} onSelectAgent={() => undefined} onClose={() => undefined} />);

  expect(await screen.findByText('SERIE-007')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Responsável' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('tab', { name: 'Posição' }));
  expect(screen.getByRole('heading', { name: 'Local cadastrado' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('tab', { name: 'Atributos' }));
  expect(screen.getByText('Visão noturna')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('tab', { name: 'Ocorrências' }));
  expect(await screen.findByText('Nenhuma ocorrência vinculada a este equipamento.')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('tab', { name: 'Manutenção' }));
  expect(await screen.findByText('Nenhuma manutenção registrada para este equipamento.')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('tab', { name: 'Histórico de rotas' }));
  expect(await screen.findByText('Nenhuma rota registrada para este veículo.')).toBeInTheDocument();
});
