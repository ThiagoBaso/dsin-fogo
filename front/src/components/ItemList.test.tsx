import React from 'react';
import { render } from '@testing-library/react';
import ItemList from './ItemList';
import type { Ponto } from '../types';

const points = [1, 2].map((id) => ({
  id,
  nome: `Radar ${id}`,
  numero_serie: `RAD-${id}`,
  tipo: 'Radar fixo',
  tipo_id: 1,
  modelo: 'Modelo de teste',
  orgao_nome: 'Secretaria de Mobilidade',
  orgao_sigla: 'SM',
  situacao: 'operacional',
  situacao_id: 1,
} as Ponto));

test('counts selected equipment within the items currently displayed', () => {
  const { container } = render(
    <ItemList
      visible
      pontos={points}
      selecionadosIds={[points[0].id, 99]}
      detalhesId={null}
      onVisualizar={() => undefined}
      onAlternarSelecao={() => undefined}
      onAlternarTodos={() => undefined}
    />,
  );

  expect(container.querySelector('.item-list-selection-count'))
    .toHaveAttribute('aria-label', '1 item selecionado de 2 itens exibidos');
});
