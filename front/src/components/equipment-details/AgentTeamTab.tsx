import type { Agente } from '../../types';
import { formatDate } from './EquipmentDetailField';

const shiftLabels: Record<'em_atividade' | 'programado', string> = {
  em_atividade: 'Em atividade',
  programado: 'Programado',
};

type AssignedAgent = Agente & { turno_status: 'em_atividade' | 'programado' };

export default function AgentTeamTab({
  equipmentId,
  agents,
  onSelectAgent,
}: {
  equipmentId: number;
  agents: Agente[];
  onSelectAgent: (agent: Agente) => void;
}) {
  const linkedAgents = agents
    .filter((agent): agent is AssignedAgent => agent.veiculo_id === equipmentId && agent.turno_status !== null)
    .sort((a, b) => (a.turno_status === 'em_atividade' ? 0 : 1) - (b.turno_status === 'em_atividade' ? 0 : 1));

  return (
    <div className="equipment-detail-group">
      <h3>Agentes vinculados</h3>
      {linkedAgents.length === 0 ? (
        <p>Nenhum agente vinculado a este veículo neste período.</p>
      ) : (
        <ul className="equipment-agent-crew-list">
          {linkedAgents.map((agent) => (
            <li key={agent.id}>
              <button type="button" className="equipment-agent-crew-card" onClick={() => onSelectAgent(agent)}>
                <span className="equipment-agent-crew-heading">
                  <strong>{agent.matricula}</strong>
                  <span className="equipment-agent-shift-status">{shiftLabels[agent.turno_status]}</span>
                </span>
                <span className="equipment-agent-crew-name">{agent.nome}</span>
                <span className="equipment-agent-crew-role">{agent.cargo} · {agent.orgao_sigla || agent.orgao_nome}</span>
                <span className="equipment-agent-crew-period">
                  {formatDate(agent.turno_inicio_previsto) || 'Início não informado'}
                  {' — '}
                  {formatDate(agent.turno_fim_previsto) || 'fim não informado'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
