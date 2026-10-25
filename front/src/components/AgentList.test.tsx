import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AgentList from './AgentList';
import type { Agente } from '../types';

const agent = {
  id: 17,
  nome: 'Agente de demonstração',
  matricula: 'DEMO-AG-0017',
  cargo: 'Fiscal de trânsito',
  orgao_nome: 'Secretaria de Mobilidade',
  orgao_sigla: 'SM',
  turno_status: 'em_atividade',
  veiculo_marca: 'Marca',
  veiculo_modelo: 'Modelo',
  veiculo_tipo: 'Motocicleta',
} as Agente;

test('checks an agent independently from opening its details', () => {
  const onSelect = jest.fn();

  function ControlledAgentList() {
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    return (
      <AgentList
        visible
        agents={[agent]}
        selectedAgentId={null}
        selectedAgentIds={selectedIds}
        onSelect={onSelect}
        onToggleSelection={(id) => setSelectedIds((current) => current.includes(id)
          ? current.filter((selectedId) => selectedId !== id)
          : [...current, id])}
      />
    );
  }

  const { container } = render(<ControlledAgentList />);
  const checkbox = screen.getByRole('checkbox', { name: 'Selecionar agente DEMO-AG-0017' });
  const row = container.querySelector('li');
  const selectionCount = container.querySelector('.item-list-selection-count');

  expect(selectionCount).toHaveAttribute('aria-label', '0 agentes selecionados de 1 agente exibido');

  fireEvent.click(checkbox);
  expect(checkbox).toBeChecked();
  expect(row).toHaveClass('selected');
  expect(selectionCount).toHaveAttribute('aria-label', '1 agente selecionado de 1 agente exibido');
  expect(onSelect).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: /DEMO-AG-0017/ }));
  expect(onSelect).toHaveBeenCalledWith(agent);
  expect(checkbox).toBeChecked();

  fireEvent.click(checkbox);
  expect(checkbox).not.toBeChecked();
});
