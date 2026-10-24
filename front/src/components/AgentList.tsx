import { useState } from 'react';
import type { Agente } from '../types';

export default function AgentList({
  agents,
  selectedAgentId,
  onSelect,
}: {
  agents: Agente[];
  selectedAgentId: number | null;
  onSelect: (agent: Agente) => void;
}) {
  const [search, setSearch] = useState('');
  const term = search.trim().toLocaleLowerCase('pt-BR');
  const visibleAgents = term
    ? agents.filter((agent) => [agent.nome, agent.matricula, agent.cargo, agent.orgao_nome, agent.veiculo_numero_serie]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('pt-BR')
      .includes(term))
    : agents;

  return (
    <section className="item-list agent-list" aria-label="Lista de agentes">
      <div className="item-list-header">
        <h2>Agentes</h2>
        <input
          className="item-list-search"
          type="search"
          aria-label="Buscar agente por nome, matrícula ou cargo"
          placeholder="Buscar agente"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <span className="agent-list-count" aria-live="polite">{visibleAgents.length}</span>
      </div>
      <ul>
        {visibleAgents.map((agent) => {
          const selected = selectedAgentId === agent.id;
          const shiftLabel = agent.turno_status === 'em_atividade'
            ? 'Em atividade'
            : agent.turno_status === 'programado'
              ? 'Programado'
              : 'Sem turno atual';
          return (
            <li key={agent.id} className={selected ? 'viewing' : ''}>
              <div className="item-row">
                <button
                  type="button"
                  className="item-select"
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => onSelect(agent)}
                >
                  <strong>{agent.nome}</strong>
                  <p>{agent.cargo} · {agent.orgao_sigla || agent.orgao_nome}</p>
                  <p>Turno: {shiftLabel}{agent.veiculo_tipo ? ` · ${agent.veiculo_tipo}` : ''}</p>
                  {agent.latitude !== null && agent.longitude !== null && (
                    <p>Posição: {agent.latitude.toFixed(5)}, {agent.longitude.toFixed(5)}</p>
                  )}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {visibleAgents.length === 0 && <p className="item-list-empty">Nenhum agente encontrado.</p>}
    </section>
  );
}
