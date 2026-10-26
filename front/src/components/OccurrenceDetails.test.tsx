import { render, screen } from '@testing-library/react';
import type { OcorrenciaMapa } from '../types';
import OccurrenceDetails from './OccurrenceDetails';

const baseOccurrence: OcorrenciaMapa = {
  id: 1,
  tipo: 'Trânsito',
  gravidade: 'media',
  status: 'resolvida',
  descricao: null,
  ocorrida_em: '2026-10-20T10:00:00',
  resolvida_em: '2026-10-20T12:30:00',
  logradouro: 'Rua Teste',
  bairro: 'Centro',
  cidade: 'Marília',
  uf: 'SP',
  latitude: -22.217,
  longitude: -49.95,
  orgao_nome: 'SMU',
  equipamento_nome: null,
};

test('shows the resolution date when the occurrence has been resolved', () => {
  render(<OccurrenceDetails occurrence={baseOccurrence} loading={false} error="" onClose={() => {}} />);

  expect(screen.getByText('Resolvida em')).toBeInTheDocument();
});

test('does not show a resolution date for an unresolved occurrence', () => {
  render(
    <OccurrenceDetails
      occurrence={{ ...baseOccurrence, status: 'em_atendimento', resolvida_em: null }}
      loading={false}
      error=""
      onClose={() => {}}
    />,
  );

  expect(screen.queryByText('Resolvida em')).not.toBeInTheDocument();
});
