import { useState } from 'react';
import type { Agente } from '../types';
import { Field, formatDate } from './equipment-details/EquipmentDetailField';

const shiftLabels: Record<'em_atividade' | 'programado', string> = {
  em_atividade: 'Em atividade',
  programado: 'Programado',
};

const positionSourceLabels: Record<Agente['origem_posicao'], string> = {
  gps_veiculo: 'GPS do veículo vinculado',
  base_veiculo: 'Local cadastrado do veículo',
  base_agente: 'Base cadastrada do agente',
};

const agentDetailTabs = [
  { id: 'identificacao', label: 'Identificação' },
  { id: 'atuacao', label: 'Atuação' },
  { id: 'posicao', label: 'Posição' },
] as const;

type AgentDetailTab = (typeof agentDetailTabs)[number]['id'];

export default function AgentDetails({
  agente,
  agentes,
  onClose,
}: {
  agente: Agente | null;
  agentes: Agente[];
  onClose: () => void;
}) {
  const [abaAtiva, setAbaAtiva] = useState<AgentDetailTab>('identificacao');
  const tabPanelId = 'agent-details-panel';

  if (!agente) {
    return (
      <section className="equipment-details" aria-label="Detalhes do agente">
        <div className="equipment-details-heading">
          <h2>Detalhes do agente</h2>
        </div>
        <p className="equipment-details-hint">Selecione um agente no mapa ou na lista para ver os detalhes.</p>
      </section>
    );
  }

  const cep = agente.cep?.replace(/^(\d{5})(\d{3})$/, '$1-$2');
  const colegas = agente.veiculo_id === null
    ? []
    : agentes.filter((item) => item.id !== agente.id && item.veiculo_id === agente.veiculo_id);

  return (
    <section className="equipment-details" aria-label="Detalhes do agente">
      <div className="equipment-details-heading">
        <h2>Detalhes do agente</h2>
        <button type="button" className="equipment-details-close" aria-label="Fechar detalhes do agente" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="equipment-details-tabs" role="tablist" aria-label="Seções dos detalhes do agente">
        {agentDetailTabs.map((tab, index) => (
          <button
            key={tab.id}
            id={`agent-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={abaAtiva === tab.id}
            aria-controls={tabPanelId}
            tabIndex={abaAtiva === tab.id ? 0 : -1}
            onClick={() => setAbaAtiva(tab.id)}
            onKeyDown={(event) => {
              let nextIndex = index;
              if (event.key === 'ArrowRight') nextIndex = (index + 1) % agentDetailTabs.length;
              if (event.key === 'ArrowLeft') nextIndex = (index - 1 + agentDetailTabs.length) % agentDetailTabs.length;
              if (event.key === 'Home') nextIndex = 0;
              if (event.key === 'End') nextIndex = agentDetailTabs.length - 1;
              if (nextIndex !== index) {
                event.preventDefault();
                const nextTab = agentDetailTabs[nextIndex];
                setAbaAtiva(nextTab.id);
                event.currentTarget.parentElement
                  ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]
                  ?.focus();
              }
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        id={tabPanelId}
        className="equipment-details-tabpanel"
        role="tabpanel"
        aria-labelledby={`agent-tab-${abaAtiva}`}
      >
        {abaAtiva === 'identificacao' && (
          <div className="equipment-detail-group">
            <h3>Identificação</h3>
            <dl>
              <Field label="Nome" value={agente.nome} />
              <Field label="Matrícula" value={agente.matricula} />
              <Field label="Cargo" value={agente.cargo} />
              <Field label="Órgão" value={agente.orgao_nome} />
              <Field label="Cadastro" value={agente.ativo_cadastro ? 'Ativo' : 'Inativo'} />
            </dl>
          </div>
        )}
        {abaAtiva === 'atuacao' && (
          <div className="equipment-detail-group">
            <h3>Turno e equipe</h3>
            <dl>
              <Field label="Turno atual" value={agente.turno_status ? shiftLabels[agente.turno_status] : 'Sem turno atual'} />
              <Field label="Início previsto" value={formatDate(agente.turno_inicio_previsto)} />
              <Field label="Fim previsto" value={formatDate(agente.turno_fim_previsto)} />
              <Field label="Veículo vinculado" value={agente.veiculo_tipo} />
              <Field label="Número de série" value={agente.veiculo_numero_serie} />
              <Field label="Marca e modelo" value={[agente.veiculo_marca, agente.veiculo_modelo].filter(Boolean).join(' ') || null} />
              <Field
                label="Outros agentes no veículo"
                value={colegas.length
                  ? colegas.map((colega) => `${colega.nome} (${colega.cargo})`).join(', ')
                  : 'Sem outros agentes vinculados'}
              />
            </dl>
          </div>
        )}
        {abaAtiva === 'posicao' && (
          <div className="equipment-detail-group">
            <h3>Posição compartilhada</h3>
            <dl>
              <Field label="Origem da posição" value={positionSourceLabels[agente.origem_posicao]} />
              <Field label="Data e hora do GPS" value={formatDate(agente.posicao_registrada_em)} />
              <Field label="Logradouro" value={agente.logradouro} />
              <Field label="Referência" value={agente.referencia} />
              <Field label="Bairro" value={agente.bairro} />
              <Field label="Cidade/UF" value={[agente.cidade, agente.uf].filter(Boolean).join(' / ') || null} />
              <Field label="CEP" value={cep} />
              <Field label="Latitude" value={agente.latitude?.toFixed(7)} />
              <Field label="Longitude" value={agente.longitude?.toFixed(7)} />
            </dl>
          </div>
        )}
      </div>
    </section>
  );
}
