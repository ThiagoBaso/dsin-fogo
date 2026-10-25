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
  const visibleAgents = agents;

  return (
    <section className="item-list agent-list" aria-label="Lista de agentes">
      <div className="item-list-header">
        <h2>Agentes</h2>
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
