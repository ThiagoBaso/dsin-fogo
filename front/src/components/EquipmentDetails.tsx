import { useCallback, useEffect, useRef, useState } from 'react';
import { AtributoEquipamento, DetalhesEquipamento, OcorrenciaEquipamento, Ponto, RotaVeiculo } from '../types';
import { equipmentSituations, equipmentTypes } from '../equipmentCatalog';

const attributeLabels: Record<string, string> = {
  limite_velocidade: 'Limite de velocidade',
  modalidade: 'Modalidade de fiscalização',
  resolucao: 'Resolução',
  visao_noturna: 'Visão noturna',
  largura_m: 'Largura',
  vagas_monitoradas: 'Vagas monitoradas',
  capacidade_ton: 'Capacidade',
  autonomia_km: 'Autonomia',
  cilindrada_cc: 'Cilindrada',
  tracao: 'Tração',
};

const occurrenceStatusLabels: Record<OcorrenciaEquipamento['status'], string> = {
  aberta: 'Aberta',
  em_atendimento: 'Em atendimento',
  resolvida: 'Resolvida',
  cancelada: 'Cancelada',
};

const occurrenceSeverityLabels: Record<OcorrenciaEquipamento['gravidade'], string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  critica: 'Crítica',
};

const routeStatusLabels: Record<RotaVeiculo['situacao'], string> = {
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  interrompida: 'Interrompida',
};

const routePageSize = 10;

const detailTabs = [
  { id: 'identificacao', label: 'Identificação' },
  { id: 'posicao', label: 'Posição' },
  { id: 'atributos', label: 'Atributos' },
  { id: 'ocorrencias', label: 'Ocorrências' },
  { id: 'historico', label: 'Histórico de rotas' },
] as const;

type DetailTab = (typeof detailTabs)[number]['id'];

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="equipment-detail-field">
      <dt>{label}</dt>
      <dd>{value === null || value === undefined || value === '' ? 'Não informado' : value}</dd>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString('pt-BR');
}

function formatAttribute(attribute: AtributoEquipamento) {
  if (attribute.valor === null) return null;
  if (attribute.tipo_valor === 'booleano') return attribute.valor ? 'Sim' : 'Não';
  const value = typeof attribute.valor === 'number'
    ? attribute.valor.toLocaleString('pt-BR')
    : String(attribute.valor);
  const unit = attribute.unidade || (attribute.nome === 'cilindrada_cc' ? 'cm³' : '');
  return unit ? `${value} ${unit}` : value;
}

function RoutePreview({ rota }: { rota: RotaVeiculo }) {
  const width = 320;
  const height = 108;
  const padding = 14;

  if (rota.posicoes.length < 2) {
    return <div className="route-preview-empty">Traçado indisponível</div>;
  }

  const latitudes = rota.posicoes.map((position) => position.latitude);
  const latitudeMedia = latitudes.reduce((total, latitude) => total + latitude, 0) / latitudes.length;
  const fatorLongitude = Math.cos((latitudeMedia * Math.PI) / 180);
  const coordenadas = rota.posicoes.map((position) => ({
    x: position.longitude * fatorLongitude,
    y: -position.latitude,
  }));
  const minX = Math.min(...coordenadas.map((point) => point.x));
  const maxX = Math.max(...coordenadas.map((point) => point.x));
  const minY = Math.min(...coordenadas.map((point) => point.y));
  const maxY = Math.max(...coordenadas.map((point) => point.y));
  const scale = Math.min(
    (width - padding * 2) / Math.max(maxX - minX, 0.000001),
    (height - padding * 2) / Math.max(maxY - minY, 0.000001),
  );
  const contentWidth = (maxX - minX) * scale;
  const contentHeight = (maxY - minY) * scale;
  const points = coordenadas.map((point) => ({
    x: padding + (width - padding * 2 - contentWidth) / 2 + (point.x - minX) * scale,
    y: padding + (height - padding * 2 - contentHeight) / 2 + (point.y - minY) * scale,
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const inicio = points[0];
  const fim = points[points.length - 1];

  return (
    <svg className="route-preview" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Mini mapa da rota ${rota.id}`}>
      <rect width={width} height={height} rx="8" fill="#f1f4f2" />
      <path d="M0 27H320 M0 81H320 M80 0V108 M160 0V108 M240 0V108" stroke="#e0e6e3" strokeWidth="1" />
      <polyline points={line} fill="none" stroke="#3c4548" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={line} fill="none" stroke="#fecc00" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={inicio.x} cy={inicio.y} r="5" fill="#fff" stroke="#3c4548" strokeWidth="2" />
      <circle cx={fim.x} cy={fim.y} r="5" fill="#fecc00" stroke="#3c4548" strokeWidth="2" />
    </svg>
  );
}

function formatDistance(metros: number) {
  return `${(metros / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
}

export default function EquipmentDetails({ ponto, dataHora, onClose }: { ponto: Ponto | null; dataHora: string | null; onClose: () => void }) {
  const [detalhes, setDetalhes] = useState<DetalhesEquipamento | null>(null);
  const [ocorrencias, setOcorrencias] = useState<OcorrenciaEquipamento[] | null>(null);
  const [rotasHistorico, setRotasHistorico] = useState<RotaVeiculo[]>([]);
  const [erro, setErro] = useState('');
  const [erroOcorrencias, setErroOcorrencias] = useState('');
  const [erroRotas, setErroRotas] = useState('');
  const [carregandoRotas, setCarregandoRotas] = useState(false);
  const [rotasOffset, setRotasOffset] = useState(0);
  const [temMaisRotas, setTemMaisRotas] = useState(true);
  const [tentativa, setTentativa] = useState(0);
  const [abaAtiva, setAbaAtiva] = useState<DetailTab>('identificacao');
  const requestRotas = useRef<AbortController | null>(null);
  const equipamentoId = ponto?.id;

  const carregarHistorico = useCallback((offset: number, substituir = false) => {
    if (equipamentoId === undefined) return;
    requestRotas.current?.abort();
    const controller = new AbortController();
    requestRotas.current = controller;
    setCarregandoRotas(true);
    setErroRotas('');
    fetch(`${process.env.REACT_APP_API_URL || ''}/api/equipamentos/${equipamentoId}/viagens?limit=${routePageSize}&offset=${offset}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`API respondeu ${response.status}`);
        return response.json() as Promise<RotaVeiculo[]>;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setRotasHistorico((rotas) => substituir ? data : rotas.concat(data));
        setRotasOffset(offset + data.length);
        setTemMaisRotas(data.length === routePageSize);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted && error.name !== 'AbortError') {
          setErroRotas('Não foi possível carregar o histórico de rotas.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCarregandoRotas(false);
      });
  }, [equipamentoId]);

  useEffect(() => {
    setDetalhes(null);
    setErro('');
    if (equipamentoId === undefined) return;
    const controller = new AbortController();
    const queryData = dataHora ? `?em=${encodeURIComponent(dataHora)}` : '';
    fetch(`${process.env.REACT_APP_API_URL || ''}/api/equipamentos/${equipamentoId}${queryData}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`API respondeu ${response.status}`);
        return response.json() as Promise<DetalhesEquipamento>;
      })
      .then((data) => {
        if (!controller.signal.aborted) setDetalhes(data);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted && error.name !== 'AbortError') setErro('Não foi possível carregar os detalhes do equipamento.');
      });
    return () => controller.abort();
  }, [equipamentoId, dataHora, tentativa]);

  useEffect(() => {
    setOcorrencias(null);
    setErroOcorrencias('');
    if (equipamentoId === undefined) return;
    const controller = new AbortController();
    const queryData = dataHora ? `?em=${encodeURIComponent(dataHora)}` : '';
    fetch(`${process.env.REACT_APP_API_URL || ''}/api/equipamentos/${equipamentoId}/ocorrencias${queryData}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`API respondeu ${response.status}`);
        return response.json() as Promise<OcorrenciaEquipamento[]>;
      })
      .then((data) => {
        if (!controller.signal.aborted) setOcorrencias(data);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted && error.name !== 'AbortError') {
          setErroOcorrencias('Não foi possível carregar as ocorrências deste equipamento.');
        }
      });
    return () => controller.abort();
  }, [equipamentoId, dataHora, tentativa]);

  const atual = detalhes?.id === equipamentoId ? detalhes : null;

  useEffect(() => {
    requestRotas.current?.abort();
    setRotasHistorico([]);
    setRotasOffset(0);
    setTemMaisRotas(true);
    setErroRotas('');
    setCarregandoRotas(false);
  }, [equipamentoId]);

  useEffect(() => {
    if (abaAtiva !== 'historico' || atual?.mobilidade !== 'movel') return undefined;
    setRotasHistorico([]);
    setRotasOffset(0);
    setTemMaisRotas(true);
    setErroRotas('');
    carregarHistorico(0, true);
    return () => requestRotas.current?.abort();
  }, [abaAtiva, atual?.mobilidade, carregarHistorico]);

  const tabPanelId = 'equipment-details-panel';

  return (
    <section className="equipment-details" aria-label="Detalhes do equipamento">
      <div className="equipment-details-heading">
        <h2>Detalhes do equipamento</h2>
        {ponto && <button type="button" className="equipment-details-close" aria-label="Fechar detalhes do equipamento" onClick={onClose}>×</button>}
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
              <>
                <div className="equipment-detail-group">
                  <h3>Identificação</h3>
                  <dl>
                    <Field label="Tipo" value={equipmentTypes.find((type) => type.id === atual.tipo_id)?.label || atual.tipo} />
                    <Field label="Número de série" value={atual.numero_serie} />
                    <Field label="Marca" value={atual.marca} />
                    <Field label="Modelo" value={atual.modelo} />
                  </dl>
                </div>
                <div className="equipment-detail-group">
                  <h3>Responsável</h3>
                  <dl>
                    <Field label="Órgão" value={atual.orgao_nome} />
                    <Field label="Sigla" value={atual.orgao_sigla} />
                  </dl>
                </div>
                <div className="equipment-detail-group">
                  <h3>Condição</h3>
                  <dl>
                    <Field label={dataHora ? 'Situação no período' : 'Situação atual'} value={equipmentSituations[atual.situacao_id]?.label || atual.situacao} />
                    <Field label="Mobilidade" value={atual.mobilidade === 'fixo' ? 'Fixo' : 'Móvel'} />
                  </dl>
                </div>
                <div className="equipment-detail-group">
                  <h3>Datas</h3>
                  <dl>
                    <Field label="Cadastro" value={formatDate(atual.cadastrado_em)} />
                    <Field label="Instalação" value={formatDate(atual.instalado_em)} />
                  </dl>
                </div>
              </>
            )}
            {abaAtiva === 'posicao' && (
              <>
                <div className="equipment-detail-group">
                  <h3>Local cadastrado</h3>
                  <dl>
                    <Field label="Logradouro" value={atual.logradouro} />
                    <Field label="Referência" value={atual.referencia} />
                    <Field label="Bairro" value={atual.bairro} />
                    <Field label="Região" value={atual.regiao} />
                    <Field label="Cidade" value={atual.cidade} />
                    <Field label="UF" value={atual.uf} />
                    <Field label="CEP" value={atual.cep?.replace(/^(\d{5})(\d{3})$/, '$1-$2')} />
                  </dl>
                </div>
                <div className="equipment-detail-group">
                  <h3>Posição exibida no mapa</h3>
                  <dl>
                    <Field label="Latitude" value={ponto.latitude.toFixed(7)} />
                    <Field label="Longitude" value={ponto.longitude.toFixed(7)} />
                  </dl>
                </div>
                {atual.mobilidade === 'movel' && (
                  <div className="equipment-detail-group">
                    <h3>Dados de GPS</h3>
                    <dl>
                      <Field label="Data e hora da posição" value={formatDate(atual.posicao_registrada_em)} />
                      <Field label="Última velocidade registrada" value={atual.velocidade_kmh === null ? null : `${atual.velocidade_kmh.toLocaleString('pt-BR')} km/h`} />
                    </dl>
                  </div>
                )}
              </>
            )}
            {abaAtiva === 'atributos' && (
              <div className="equipment-detail-group">
                <h3>Atributos específicos</h3>
                {atual.atributos.length ? (
                  <dl>
                    {atual.atributos.map((attribute) => (
                      <Field key={attribute.id} label={attributeLabels[attribute.nome] || attribute.nome.replace(/_/g, ' ')} value={formatAttribute(attribute)} />
                    ))}
                  </dl>
                ) : <p>Não informado</p>}
              </div>
            )}
            {abaAtiva === 'ocorrencias' && (
              <div className="equipment-detail-group">
                <h3>Ocorrências vinculadas</h3>
                {erroOcorrencias ? (
                  <p role="alert">{erroOcorrencias}</p>
                ) : ocorrencias === null ? (
                  <p role="status">Carregando ocorrências…</p>
                ) : ocorrencias.length === 0 ? (
                  <p>Nenhuma ocorrência vinculada a este equipamento.</p>
                ) : (
                  <ul className="equipment-occurrence-list">
                    {ocorrencias.map((ocorrencia) => (
                      <li className="equipment-occurrence" key={ocorrencia.id}>
                        <div className="equipment-occurrence-heading">
                          <strong>{ocorrencia.tipo}</strong>
                          <span className={`equipment-occurrence-severity severity-${ocorrencia.gravidade}`}>
                            {occurrenceSeverityLabels[ocorrencia.gravidade]}
                          </span>
                        </div>
                        <dl>
                          <Field label="Status" value={occurrenceStatusLabels[ocorrencia.status]} />
                          <Field label="Data e hora" value={formatDate(ocorrencia.ocorrida_em)} />
                          {ocorrencia.descricao && <Field label="Descrição" value={ocorrencia.descricao} />}
                          <Field label="Local" value={[ocorrencia.logradouro, ocorrencia.bairro, ocorrencia.cidade, ocorrencia.uf].filter(Boolean).join(', ')} />
                        </dl>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {abaAtiva === 'historico' && (
              <div className="equipment-detail-group route-history-group">
                <h3>Histórico de rotas</h3>
                {atual.mobilidade !== 'movel' ? (
                  <p>O histórico de rotas está disponível apenas para equipamentos móveis.</p>
                ) : (
                  <>
                <p className="route-history-note">Na base de demonstração, os trajetos podem ser simulados.</p>
                {erroRotas ? (
                  <div role="alert" className="route-history-error">
                    <p>{erroRotas}</p>
                    <button type="button" onClick={() => carregarHistorico(0, true)}>Tentar novamente</button>
                  </div>
                ) : rotasHistorico.length === 0 && carregandoRotas ? (
                  <p role="status">Carregando histórico…</p>
                ) : rotasHistorico.length === 0 ? (
                  <p>Nenhuma rota registrada para este veículo.</p>
                ) : (
                  <>
                    <ul className="route-history-list">
                      {rotasHistorico.map((rota) => (
                        <li className="route-history-item" key={rota.id}>
                          <div className="route-history-item-heading">
                            <strong>Viagem #{rota.id}</strong>
                            <span className={`route-history-status route-status-${rota.situacao}`}>
                              {routeStatusLabels[rota.situacao]}
                            </span>
                          </div>
                          <RoutePreview rota={rota} />
                          <dl className="route-history-meta">
                            <Field label="Partida" value={formatDate(rota.inicio_em)} />
                            <Field label="Chegada" value={rota.fim_em ? formatDate(rota.fim_em) : 'Em andamento'} />
                            <Field label="Distância" value={formatDistance(rota.distancia_m)} />
                          </dl>
                        </li>
                      ))}
                    </ul>
                    {carregandoRotas && <p role="status">Carregando mais rotas…</p>}
                    {temMaisRotas && !carregandoRotas && (
                      <button
                        type="button"
                        className="route-history-more"
                        onClick={() => carregarHistorico(rotasOffset)}
                      >
                        Carregar mais rotas
                      </button>
                    )}
                  </>
                )}
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
