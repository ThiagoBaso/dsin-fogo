import type { Agente } from '../types';

export default function AgentList({
  agents,
  selectedAgentId,
  selectedAgentIds,
  onSelect,
  onToggleSelection,
  visible,
}: {
  agents: Agente[];
  selectedAgentId: number | null;
  selectedAgentIds: number[];
  onSelect: (agent: Agente) => void;
  onToggleSelection: (agentId: number) => void;
  visible: boolean;
}) {
  const visibleAgents = agents;
  const quantidadeSelecionada = visibleAgents.filter((agent) => selectedAgentIds.includes(agent.id)).length;
  const agentesSelecionados = quantidadeSelecionada === 1 ? '1 agente selecionado' : `${quantidadeSelecionada} agentes selecionados`;
  const agentesExibidos = visibleAgents.length === 1 ? '1 agente exibido' : `${visibleAgents.length} agentes exibidos`;
  const rotuloContagem = `${agentesSelecionados} de ${agentesExibidos}`;

  return (
    <section className="item-list agent-list" aria-label="Lista de agentes" hidden={!visible}>
      <div className="item-list-header">
        <div className="item-list-title">
          <h2>Agentes</h2>
          <span className="item-list-selection-count" aria-label={rotuloContagem} title={rotuloContagem} aria-live="polite">
            <strong>{quantidadeSelecionada}</strong>
            <span aria-hidden="true">/</span>
            <span>{visibleAgents.length}</span>
          </span>
        </div>
      </div>
      <div className="agent-list-columns" aria-hidden="true">
        <span />
        <span>{"Matr\u00edcula / nome"}</span>
        <span>{"Cargo / \u00f3rg\u00e3o"}</span>
        <span>Marca e modelo</span>
        <span>Turno atual</span>
      </div>
      <ul>
        {visibleAgents.map((agent) => {
          const selected = selectedAgentIds.includes(agent.id);
          const viewing = selectedAgentId === agent.id;
          const shiftLabel = agent.turno_status === 'em_atividade'
            ? 'Em atividade'
            : agent.turno_status === 'programado'
              ? 'Programado'
              : 'Sem turno atual';
          const shiftClass = agent.turno_status === 'em_atividade'
            ? 'is-active'
            : agent.turno_status === 'programado'
              ? 'is-scheduled'
              : 'is-unassigned';
          const vehicleMakeModel = [agent.veiculo_marca, agent.veiculo_modelo]
            .filter(Boolean)
            .join(' ');
          return (
            <li key={agent.id} className={`${selected ? 'selected ' : ''}${viewing ? 'viewing' : ''}`.trim()}>
              <div className="item-row">
                <label className="item-selection-control">
                  <input
                    type="checkbox"
                    aria-label={`Selecionar agente ${agent.matricula}`}
                    checked={selected}
                    onChange={() => onToggleSelection(agent.id)}
                  />
                </label>
                <button
                  type="button"
                  className="item-select agent-list-select"
                  aria-current={viewing ? 'true' : undefined}
                  onClick={() => onSelect(agent)}
                >
                  <span className="agent-list-cell agent-list-identification">
                    <strong className="agent-list-primary">{agent.matricula}</strong>
                    <span className="agent-list-secondary">{agent.nome}</span>
                  </span>
                  <span className="agent-list-cell agent-list-role">
                    <strong className="agent-list-primary">{agent.cargo}</strong>
                    <span className="agent-list-secondary">{agent.orgao_sigla || agent.orgao_nome}</span>
                  </span>
                  <span className="agent-list-cell agent-list-vehicle">
                    <strong className="agent-list-primary">
                      {vehicleMakeModel || (agent.veiculo_tipo ? 'Marca/modelo n\u00e3o informado' : 'Sem ve\u00edculo vinculado')}
                    </strong>
                    {agent.veiculo_tipo && <span className="agent-list-secondary">{agent.veiculo_tipo}</span>}
                  </span>
                  <span className="agent-list-cell agent-list-shift-cell">
                    <span className={`agent-list-shift ${shiftClass}`}>{shiftLabel}</span>
                  </span>
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
