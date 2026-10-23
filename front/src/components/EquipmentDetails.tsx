import { useState } from 'react';
import type { Ponto } from '../types';
import EquipmentInformationTab from './equipment-details/EquipmentInformationTab';
import MaintenanceTab from './equipment-details/MaintenanceTab';
import OccurrencesTab from './equipment-details/OccurrencesTab';
import RouteHistoryTab from './equipment-details/RouteHistoryTab';
import { useEquipmentDetailsData } from './equipment-details/useEquipmentDetailsData';
import { useEquipmentRouteHistory } from './equipment-details/useEquipmentRouteHistory';
import { detailTabs, type DetailTab } from './equipment-details/tabs';

export default function EquipmentDetails({
  ponto,
  dataHora,
  onClose,
}: {
  ponto: Ponto | null;
  dataHora: string | null;
  onClose: () => void;
}) {
  const equipamentoId = ponto?.id;
  const [tentativa, setTentativa] = useState(0);
  const [abaAtiva, setAbaAtiva] = useState<DetailTab>('identificacao');
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
            {detailTabs.map((tab) => (
              <button
                key={tab.id}
                id={`equipment-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={abaAtiva === tab.id}
                aria-controls={tabPanelId}
                tabIndex={abaAtiva === tab.id ? 0 : -1}
                onClick={() => setAbaAtiva(tab.id)}
                onKeyDown={(event) => {
                  const atualIndex = detailTabs.findIndex((item) => item.id === abaAtiva);
                  let proximoIndex = atualIndex;
                  if (event.key === 'ArrowRight') proximoIndex = (atualIndex + 1) % detailTabs.length;
                  if (event.key === 'ArrowLeft') proximoIndex = (atualIndex - 1 + detailTabs.length) % detailTabs.length;
                  if (event.key === 'Home') proximoIndex = 0;
                  if (event.key === 'End') proximoIndex = detailTabs.length - 1;
                  if (proximoIndex !== atualIndex) {
                    event.preventDefault();
                    const proximaAba = detailTabs[proximoIndex];
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
          <div id={tabPanelId} className="equipment-details-tabpanel" role="tabpanel" aria-labelledby={`equipment-tab-${abaAtiva}`}>
            {abaAtiva === 'identificacao' && (
              <EquipmentInformationTab tab="identificacao" ponto={ponto} detalhes={atual} dataHora={dataHora} />
            )}
            {abaAtiva === 'posicao' && (
              <EquipmentInformationTab tab="posicao" ponto={ponto} detalhes={atual} dataHora={dataHora} />
            )}
            {abaAtiva === 'atributos' && (
              <EquipmentInformationTab tab="atributos" ponto={ponto} detalhes={atual} dataHora={dataHora} />
            )}
            {abaAtiva === 'ocorrencias' && (
              <OccurrencesTab ocorrencias={ocorrencias} erro={erroOcorrencias} />
            )}
            {abaAtiva === 'manutencao' && (
              <MaintenanceTab
                manutencoes={manutencoes}
                erro={erroManutencoes}
                onRetry={() => setTentativa((value) => value + 1)}
              />
            )}
            {abaAtiva === 'historico' && (
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
