import { useRef } from 'react';
import { Marker, Popup, Tooltip, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

const agentIcons = new Map();

function createAgentIcon(count, selected) {
  const key = `${count}-${selected ? 'selected' : 'normal'}`;
  if (!agentIcons.has(key)) {
    const countBadge = count > 1 ? `<span class="agent-marker-count">${count}</span>` : '';
    agentIcons.set(key, L.divIcon({
      className: 'agent-div-icon',
      html: `<span class="agent-marker${selected ? ' is-selected' : ''}" title="${count} agente${count === 1 ? '' : 's'}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="3"/><path d="M5 20v-1a7 7 0 0 1 14 0v1M12 13v4"/></svg>${countBadge}</span>`,
      iconSize: [34, 34],
      iconAnchor: [0, 17],
    }));
  }
  return agentIcons.get(key);
}

function groupAgentsByVehicle(agents) {
  const groups = new Map();
  agents.forEach((agent) => {
    if (typeof agent.latitude !== 'number' || typeof agent.longitude !== 'number') return;
    const key = agent.veiculo_id === null ? `agent-${agent.id}` : `vehicle-${agent.veiculo_id}`;
    const group = groups.get(key) ?? [];
    group.push(agent);
    groups.set(key, group);
  });
  return Array.from(groups.values());
}

export default function AgentMarkers({ agents, selectedAgentId, onSelect }) {
  const selectorOpen = useRef(false);
  useMapEvents({
    popupopen: (event) => {
      const className = event.popup?.options?.className;
      selectorOpen.current = typeof className === 'string' && className.includes('agent-selector-popup');
      if (selectorOpen.current) event.popup?._source?.closeTooltip();
    },
    popupclose: (event) => {
      const className = event.popup?.options?.className;
      if (typeof className === 'string' && className.includes('agent-selector-popup')) {
        selectorOpen.current = false;
      }
    },
    tooltipopen: (event) => {
      if (selectorOpen.current) event.tooltip?.close();
    },
  });

  return groupAgentsByVehicle(agents).map((crew) => {
    const representative = crew[0];
    const selectedAgent = crew.find((agent) => agent.id === selectedAgentId) ?? representative;
    const vehicleTitle = representative.veiculo_tipo || 'Agente sem veículo vinculado';
    return (
      <Marker
        key={representative.veiculo_id ?? `agent-${representative.id}`}
        position={[representative.latitude, representative.longitude]}
        icon={createAgentIcon(crew.length, crew.some((agent) => agent.id === selectedAgentId))}
        zIndexOffset={400}
        eventHandlers={{ click: () => onSelect(selectedAgent) }}
      >
        <Tooltip direction="top" offset={[10, -16]}>
          <strong>{crew.length > 1 ? `${crew.length} agentes no veículo` : representative.nome}</strong>
          {crew.map((agent) => (
            <p key={agent.id}>
              {agent.nome} · {agent.cargo} · {
                agent.turno_status === 'em_atividade'
                  ? 'Em atividade'
                  : agent.turno_status === 'programado' ? 'Programado' : 'Sem turno'
              }
            </p>
          ))}
          <p>{vehicleTitle}</p>
        </Tooltip>
        {crew.length > 1 && (
          <Popup className="agent-selector-popup" minWidth={176} maxWidth={224} offset={[17, 0]}>
            <div className="agent-selector">
              <div className="agent-selector-options" role="group" aria-label="Agentes vinculados a este veículo">
                {crew.map((agent) => (
                  <button
                    type="button"
                    key={agent.id}
                    aria-pressed={agent.id === selectedAgentId}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(agent);
                    }}
                  >
                    <span className="agent-selector-registration">{agent.matricula}</span>
                    <small>{agent.cargo} · {agent.turno_status === 'em_atividade' ? 'Em atividade' : 'Programado'}</small>
                  </button>
                ))}
              </div>
            </div>
          </Popup>
        )}
      </Marker>
    );
  });
}
