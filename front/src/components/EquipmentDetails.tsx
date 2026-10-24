import { useEffect, useState } from 'react';
import type { Agente, Ponto } from '../types';
import EquipmentInformationTab from './equipment-details/EquipmentInformationTab';
import AgentTeamTab from './equipment-details/AgentTeamTab';
import MaintenanceTab from './equipment-details/MaintenanceTab';
import OccurrencesTab from './equipment-details/OccurrencesTab';
import RouteHistoryTab from './equipment-details/RouteHistoryTab';
import { useEquipmentDetailsData } from './equipment-details/useEquipmentDetailsData';
import { useEquipmentRouteHistory } from './equipment-details/useEquipmentRouteHistory';
import { detailTabs, type DetailTab } from './equipment-details/tabs';

const agentVehicleTypeIds = [2, 8, 9, 10, 11];

export default function EquipmentDetails({
  ponto,
  dataHora,
  agentes,
  onSelectAgent,
  onClose,
}: {
  ponto: Ponto | null;
  dataHora: string | null;
  agentes: Agente[];
  onSelectAgent: (agent: Agente) => void;
  onClose: () => void;
}) {
  const equipamentoId = ponto?.id;
  const showCrewTab = ponto !== null && agentVehicleTypeIds.includes(ponto.tipo_id);
  const [tentativa, setTentativa] = useState(0);
  const [abaAtiva, setAbaAtiva] = useState<DetailTab>('identificacao');
  const abasVisiveis = showCrewTab ? detailTabs : detailTabs.filter((tab) => tab.id !== 'equipe');
  const abaExibida = !showCrewTab && abaAtiva === 'equipe' ? 'identificacao' : abaAtiva;
  const {
    detalhes,
    ocorrencias,
    manutencoes,
    erro,
    erroOcorrencias,
    erroManutencoes,
  } = useEquipmentDetailsData(equipamentoId, dataHora, abaAtiva, tentativa);
  const atual = detalhes?.id === equipamentoId ? detalhes : null;
  const historicoAtivo = abaAtiva === 'historico' && atual?.mobilidade === 'movel';
  const {
    rotas,
    erro: erroRotas,
    carregando: carregandoRotas,
    offset: rotasOffset,
    temMais: temMaisRotas,
    carregar: carregarHistorico,
  } = useEquipmentRouteHistory(equipamentoId, historicoAtivo);
  const tabPanelId = 'equipment-details-panel';

  useEffect(() => {
    if (!showCrewTab && abaAtiva === 'equipe') setAbaAtiva('identificacao');
  }, [showCrewTab, abaAtiva]);

  return (
    <section className="equipment-details" aria-label="Detalhes do equipamento">
      <div className="equipment-details-heading">
        <h2>Detalhes do equipamento</h2>
        {ponto && (
          <button type="button" className="equipment-details-close" aria-label="Fechar detalhes do equipamento" onClick={onClose}>
            ×
          </button>
        )}
      </div>
      {!ponto ? (
        <p className="equipment-details-hint">Selecione um equipamento no mapa ou na lista para ver os detalhes.</p>
      ) : erro ? (
        <div role="alert">
          <p>{erro}</p>
          <button type="button" onClick={() => setTentativa((value) => value + 1)}>Tentar novamente</button>
        </div>
      ) : !atual ? (
        <p role="status">Carregando detalhes…</p>
      ) : (
        <>
          <div className="equipment-details-tabs" role="tablist" aria-label="Seções dos detalhes do equipamento">
            {abasVisiveis.map((tab) => (
              <button
                key={tab.id}
                id={`equipment-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={abaExibida === tab.id}
                aria-controls={tabPanelId}
                tabIndex={abaExibida === tab.id ? 0 : -1}
                onClick={() => setAbaAtiva(tab.id)}
                onKeyDown={(event) => {
                  const atualIndex = abasVisiveis.findIndex((item) => item.id === abaExibida);
                  let proximoIndex = atualIndex;
                  if (event.key === 'ArrowRight') proximoIndex = (atualIndex + 1) % abasVisiveis.length;
                  if (event.key === 'ArrowLeft') proximoIndex = (atualIndex - 1 + abasVisiveis.length) % abasVisiveis.length;
                  if (event.key === 'Home') proximoIndex = 0;
                  if (event.key === 'End') proximoIndex = abasVisiveis.length - 1;
                  if (proximoIndex !== atualIndex) {
                    event.preventDefault();
                    const proximaAba = abasVisiveis[proximoIndex];
                    setAbaAtiva(proximaAba.id);
                    event.currentTarget.parentElement
                      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[proximoIndex]
                      ?.focus();
                  }
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div id={tabPanelId} className="equipment-details-tabpanel" role="tabpanel" aria-labelledby={`equipment-tab-${abaExibida}`}>
            {abaExibida === 'identificacao' && (
              <EquipmentInformationTab tab="identificacao" ponto={ponto} detalhes={atual} dataHora={dataHora} />
            )}
            {abaExibida === 'posicao' && (
              <EquipmentInformationTab tab="posicao" ponto={ponto} detalhes={atual} dataHora={dataHora} />
            )}
            {abaExibida === 'atributos' && (
              <EquipmentInformationTab tab="atributos" ponto={ponto} detalhes={atual} dataHora={dataHora} />
            )}
            {abaExibida === 'equipe' && (
              <AgentTeamTab equipmentId={atual.id} agents={agentes} onSelectAgent={onSelectAgent} />
            )}
            {abaExibida === 'ocorrencias' && (
              <OccurrencesTab ocorrencias={ocorrencias} erro={erroOcorrencias} />
            )}
            {abaExibida === 'manutencao' && (
              <MaintenanceTab
                manutencoes={manutencoes}
                erro={erroManutencoes}
                onRetry={() => setTentativa((value) => value + 1)}
              />
            )}
            {abaExibida === 'historico' && (
              <RouteHistoryTab
                mobilidade={atual.mobilidade}
                rotas={rotas}
                erro={erroRotas}
                carregando={carregandoRotas}
                offset={rotasOffset}
                temMais={temMaisRotas}
                onLoad={carregarHistorico}
              />
            )}
          </div>
        </>
      )}
    </section>
  );
}
