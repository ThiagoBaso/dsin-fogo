import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import Map from './components/Map';
import TopBarMap from './components/TopBarMap';
import ItemList from './components/ItemList';
import AgentList from './components/AgentList';
import AgentDetails from './components/AgentDetails';
import EquipmentDetails from './components/EquipmentDetails';
import OccurrenceDetails from './components/OccurrenceDetails';
import OccurrenceTrendsPanel from './components/OccurrenceTrendsPanel';
import OccurrencePredictionPanel from './components/OccurrencePredictionPanel';
import FilterPanel from './components/FilterPanel';
import {
  buildOccurrenceHeatGrid, collectOccurrenceHeatSources, countOccurrencePeriodDays, occurrenceRecurrenceGradient,
  occurrenceResolutionGradient, occurrenceSeverityGradient, OccurrenceHeatMode,
  summarizeOccurrenceResolution,
} from './components/map/occurrenceHeat';
import {
  Aba,
  Agente,
  AgentFilterState,
  AttributeFilterOption,
  AttributeFilterState,
  LocationFilters,
  OcorrenciaMapa,
  OcorrenciaTendencia,
  Ponto,
  PrevisaoAreaFeatureCollection,
  PrevisaoOcorrencias,
  RotaVeiculo,
  SetorCensitarioFeatureCollection,
} from './types';
import { equipmentSituations, equipmentTypes } from './equipmentCatalog';
import { attributeLabels } from './components/equipment-details/labels';
import { collectCoverageSources, coverageGradient } from './components/map/coverage';

const equipmentSituationOptions = Object.entries(equipmentSituations).map(([id, situation]) => ({
  id: Number(id),
  label: situation.label,
}));

const occurrenceSeverityOptions = [
  { id: 'baixa', label: 'Baixa' },
  { id: 'media', label: 'Média' },
  { id: 'alta', label: 'Alta' },
  { id: 'critica', label: 'Crítica' },
];

const occurrencePredictionGradient = 'linear-gradient(90deg, #2563eb, #22c55e, #eab308, #f97316, #dc2626)';

const emptyLocationFilters: LocationFilters = {
  bairro: '',
  regiao: '',
  cidade: '',
  uf: '',
  busca: '',
};

function toLocalDateTimeValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function formatResolutionHours(hours: number) {
  if (hours >= 24) return `${(hours / 24).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} d`;
  if (hours >= 1) return `${hours.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
  return `${Math.round(hours * 60)} min`;
}

function formatQuantityScale(value: number) {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

function formatProbabilityScale(value: number) {
  return `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function startOfTodayValue() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return toLocalDateTimeValue(today);
}

function getStoredTheme(): 'light' | 'dark' {
  try {
    return window.localStorage.getItem('fogo-theme') === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function getNumeroSerie(ponto: Ponto) {
  const numeroSerie = typeof ponto.numero_serie === 'string' ? ponto.numero_serie.trim() : '';
  if (numeroSerie) return numeroSerie;

  const prefixo = `${ponto.tipo} `;
  return ponto.nome.toLocaleLowerCase('pt-BR').startsWith(prefixo.toLocaleLowerCase('pt-BR'))
    ? ponto.nome.slice(prefixo.length).trim()
    : '';
}

function App() {
  const [abaAtiva, setAbaAtiva] = useState<Aba>('mapa');
  const [tema, setTema] = useState<'light' | 'dark'>(getStoredTheme);
  const [buscaSerieMapa, setBuscaSerieMapa] = useState('');
  const [buscaEquipamentos, setBuscaEquipamentos] = useState('');
  const [buscaAgentes, setBuscaAgentes] = useState('');
  const [exibirContornoBairros, setExibirContornoBairros] = useState(false);
  const [setoresCensitariosGeoJson, setSetoresCensitariosGeoJson] = useState<SetorCensitarioFeatureCollection | null>(null);
  const [erroSetoresCensitarios, setErroSetoresCensitarios] = useState('');
  const [areasPrevisaoGeoJson, setAreasPrevisaoGeoJson] = useState<PrevisaoAreaFeatureCollection | null>(null);
  const [erroAreasPrevisao, setErroAreasPrevisao] = useState('');
  const [pontos, setPontos] = useState<Ponto[]>([]);
  const [agentes, setAgentes] = useState<Agente[]>([]);
  const [erroAgentes, setErroAgentes] = useState('');
  const [rotas, setRotas] = useState<RotaVeiculo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [erroRotas, setErroRotas] = useState('');
  const [ocorrencias, setOcorrencias] = useState<OcorrenciaMapa[]>([]);
  const [ocorrenciasTendencia, setOcorrenciasTendencia] = useState<OcorrenciaTendencia[]>([]);
  const [carregandoTendencias, setCarregandoTendencias] = useState(false);
  const [erroTendencias, setErroTendencias] = useState('');
  const [previsaoAtiva, setPrevisaoAtiva] = useState(false);
  const [previsaoOcorrencias, setPrevisaoOcorrencias] = useState<PrevisaoOcorrencias | null>(null);
  const [carregandoPrevisao, setCarregandoPrevisao] = useState(false);
  const [erroPrevisao, setErroPrevisao] = useState('');
  const [metricaPrevisao, setMetricaPrevisao] = useState<'quantidade' | 'probabilidade'>('quantidade');
  const [areaPrevisaoSelecionadaId, setAreaPrevisaoSelecionadaId] = useState<number | null>(null);
  const [tiposOcorrenciaSelecionados, setTiposOcorrenciaSelecionados] = useState<string[] | null>(null);
  const [tiposOcorrenciaAplicados, setTiposOcorrenciaAplicados] = useState<string[] | null>(null);
  const [gravidadesOcorrenciaSelecionadas, setGravidadesOcorrenciaSelecionadas] = useState<string[] | null>(null);
  const [gravidadesOcorrenciaAplicadas, setGravidadesOcorrenciaAplicadas] = useState<string[] | null>(null);
  const [carregandoOcorrencias, setCarregandoOcorrencias] = useState(true);
  const [erroOcorrencias, setErroOcorrencias] = useState('');
  const [tiposSelecionados, setTiposSelecionados] = useState<number[]>([1]);
  const [tiposAplicados, setTiposAplicados] = useState<number[]>([1]);
  const [situacoesSelecionadas, setSituacoesSelecionadas] = useState<number[]>(
    equipmentSituationOptions.map((situation) => situation.id),
  );
  const [situacoesAplicadas, setSituacoesAplicadas] = useState<number[]>(
    equipmentSituationOptions.map((situation) => situation.id),
  );
  const [atributosSelecionados, setAtributosSelecionados] = useState<AttributeFilterState>({});
  const [atributosAplicados, setAtributosAplicados] = useState<AttributeFilterState>({});
  const [selecionadosIds, setSelecionadosIds] = useState<number[]>([]);
  const [agentesSelecionadosIds, setAgentesSelecionadosIds] = useState<number[]>([]);
  const [detalhesId, setDetalhesId] = useState<number | null>(null);
  const [detalhesAgenteId, setDetalhesAgenteId] = useState<number | null>(null);
  const [ocorrenciaDetalhes, setOcorrenciaDetalhes] = useState<OcorrenciaMapa | null>(null);
  const [filtrosAgentes, setFiltrosAgentes] = useState<AgentFilterState>({
    showOnMap: false,
    organizationIds: null,
    roles: null,
    registrationStatuses: null,
    shiftStatuses: null,
  });
  const [exibirApenasSelecionados, setExibirApenasSelecionados] = useState(false);
  const [exibirItensMapa, setExibirItensMapa] = useState(true);
  const [exibirAgentesMapa, setExibirAgentesMapa] = useState(true);
  const [mapaCalorCobertura, setMapaCalorCobertura] = useState(false);
  const [mapaCalorOcorrencias, setMapaCalorOcorrencias] = useState(false);
  const [modoCalorOcorrencias, setModoCalorOcorrencias] = useState<OccurrenceHeatMode>('quantidade');
  const [incluirOcorrenciasMapa, setIncluirOcorrenciasMapa] = useState(false);
  const [exibirMarcadoresOcorrencias, setExibirMarcadoresOcorrencias] = useState(true);
  const [permitirMultisselecao, setPermitirMultisselecao] = useState(false);
  const [filtrosLocalizacao, setFiltrosLocalizacao] = useState<LocationFilters>(emptyLocationFilters);
  const [localizacaoAplicada, setLocalizacaoAplicada] = useState<LocationFilters>(emptyLocationFilters);
  const [posicaoMovel, setPosicaoMovel] = useState<'gps' | 'fixa'>('gps');
  const [modoData, setModoData] = useState<'atual' | 'historico'>('atual');
  const [dataHoraSelecionada, setDataHoraSelecionada] = useState(() => toLocalDateTimeValue(new Date()));
  const [dataHoraAplicada, setDataHoraAplicada] = useState<string | null>(null);
  const [modoPeriodoOcorrencias, setModoPeriodoOcorrencias] = useState<'atual' | 'periodo'>('atual');
  const [inicioOcorrencias, setInicioOcorrencias] = useState(startOfTodayValue);
  const [fimOcorrencias, setFimOcorrencias] = useState(() => toLocalDateTimeValue(new Date()));
  const [periodoOcorrenciasAplicado, setPeriodoOcorrenciasAplicado] = useState({
    mode: 'atual' as 'atual' | 'periodo',
    start: startOfTodayValue(),
    end: toLocalDateTimeValue(new Date()),
  });
  const [painelExpandido, setPainelExpandido] = useState(true);
  const painelDetalhes = useRef<HTMLElement>(null);
  const scrollDetalhesPendente = useRef<number | null>(null);
  const restaurarScrollDetalhes = useCallback(() => {
    const scrollTop = scrollDetalhesPendente.current;
    const painel = painelDetalhes.current;
    if (scrollTop === null || !painel) return;
    painel.scrollTop = scrollTop;
    scrollDetalhesPendente.current = null;
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = tema;
    try {
      window.localStorage.setItem('fogo-theme', tema);
    } catch {
      // O tema ainda funciona durante esta sessão se o armazenamento estiver indisponível.
    }
  }, [tema]);

  const opcoesLocalizacao = useMemo(() => {
    const locations = [...pontos, ...agentes];
    const valores = (campo: 'bairro' | 'regiao' | 'cidade' | 'uf') => Array.from(new Set(
      locations.map((item) => item[campo]).filter((valor): valor is string => Boolean(valor)),
    )).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    return {
      bairros: valores('bairro'),
      regioes: valores('regiao'),
      cidades: valores('cidade'),
      ufs: valores('uf'),
    };
  }, [pontos, agentes]);
  const opcoesOrgaosAgentes = useMemo(() => agentes.reduce<{ id: number; label: string }[]>((options, agente) => {
    if (!options.some((option) => option.id === agente.orgao_id)) {
      options.push({ id: agente.orgao_id, label: agente.orgao_sigla || agente.orgao_nome });
    }
    return options;
  }, []).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')), [agentes]);
  const opcoesCargosAgentes = useMemo(() => Array.from(new Set(
    agentes.map((agente) => agente.cargo),
  )).sort((a, b) => a.localeCompare(b, 'pt-BR')), [agentes]);
  const opcoesAtributos = useMemo<AttributeFilterOption[]>(() => {
    const attributes: Record<string, AttributeFilterOption> = {};
    pontos.forEach((ponto) => {
      (ponto.atributos ?? []).forEach((atributo) => {
        if (atributo.valor === null) return;
        const key = `${ponto.tipo_id}:${atributo.nome}`;
        const option = attributes[key] ?? {
          key,
          typeId: ponto.tipo_id,
          typeLabel: equipmentTypes.find((type) => type.id === ponto.tipo_id)?.label ?? ponto.tipo,
          name: atributo.nome,
          label: attributeLabels[atributo.nome] ?? atributo.nome.replace(/_/g, ' '),
          typeValue: atributo.tipo_valor,
          unit: atributo.unidade,
          values: [],
        };
        if (atributo.tipo_valor !== 'numero'
          && !option.values.includes(atributo.valor as string | boolean)) {
          option.values.push(atributo.valor as string | boolean);
        }
        attributes[key] = option;
      });
    });
    return Object.values(attributes)
      .map((option) => ({ ...option, values: option.values.sort((a, b) => String(a).localeCompare(String(b), 'pt-BR')) }))
      .sort((a, b) => a.typeId - b.typeId || a.label.localeCompare(b.label, 'pt-BR'));
  }, [pontos]);
  const pontosFiltrados = useMemo(() => {
    const busca = localizacaoAplicada.busca.trim().toLocaleLowerCase('pt-BR');

    return pontos.filter((ponto) => {
      const correspondeLocalizacao = (!localizacaoAplicada.bairro || ponto.bairro === localizacaoAplicada.bairro)
        && (!localizacaoAplicada.regiao || ponto.regiao === localizacaoAplicada.regiao)
        && (!localizacaoAplicada.cidade || ponto.cidade === localizacaoAplicada.cidade)
        && (!localizacaoAplicada.uf || ponto.uf === localizacaoAplicada.uf)
        && (!busca || [ponto.logradouro, ponto.referencia, ponto.cep]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('pt-BR')
          .includes(busca));
      const correspondeAtributos = Object.entries(atributosAplicados).every(([key, selection]) => {
        const [typeId, ...attributeNameParts] = key.split(':');
        if (Number(typeId) !== ponto.tipo_id) return true;
        const hasDiscreteSelection = selection.selectedValues.length > 0;
        const minimum = selection.minimum === '' ? null : Number(selection.minimum);
        const maximum = selection.maximum === '' ? null : Number(selection.maximum);
        if (!hasDiscreteSelection && minimum === null && maximum === null) return true;
        const attributeName = attributeNameParts.join(':');
        const attribute = ponto.atributos?.find((item) => item.nome === attributeName);
        if (!attribute || attribute.valor === null) return false;
        if (attribute.tipo_valor === 'numero') {
          if (typeof attribute.valor !== 'number') return false;
          return (minimum === null || attribute.valor >= minimum)
            && (maximum === null || attribute.valor <= maximum);
        }
        return hasDiscreteSelection
          && selection.selectedValues.includes(attribute.valor as string | boolean);
      });

      return tiposAplicados.includes(ponto.tipo_id)
        && situacoesAplicadas.includes(ponto.situacao_id)
        && correspondeLocalizacao
        && correspondeAtributos;
    }).map((ponto) => {
      if (ponto.mobilidade !== 'movel') return ponto;
      const latitude = posicaoMovel === 'fixa'
        ? ponto.latitude_fixa ?? ponto.latitude
        : ponto.latitude_gps ?? ponto.latitude_fixa ?? ponto.latitude;
      const longitude = posicaoMovel === 'fixa'
        ? ponto.longitude_fixa ?? ponto.longitude
        : ponto.longitude_gps ?? ponto.longitude_fixa ?? ponto.longitude;
      return { ...ponto, latitude, longitude };
    });
  }, [pontos, tiposAplicados, situacoesAplicadas, localizacaoAplicada, atributosAplicados, posicaoMovel]);
  useEffect(() => {
    const pontosVisiveisIds = new Set(pontosFiltrados.map((ponto) => ponto.id));
    setSelecionadosIds((selecionados) => {
      const restantes = selecionados.filter((id) => pontosVisiveisIds.has(id));
      return restantes.length === selecionados.length ? selecionados : restantes;
    });
    setDetalhesId((id) => id !== null && !pontosVisiveisIds.has(id) ? null : id);
  }, [pontosFiltrados]);
  const pontosMapa = useMemo(() => {
    const equipamentosExibidos = exibirApenasSelecionados
      ? pontosFiltrados.filter((ponto) => selecionadosIds.includes(ponto.id))
      : pontosFiltrados;
    const termo = buscaSerieMapa.trim().toLocaleLowerCase('pt-BR');
    return termo
      ? equipamentosExibidos.filter((ponto) => getNumeroSerie(ponto).toLocaleLowerCase('pt-BR').includes(termo))
      : equipamentosExibidos;
  }, [exibirApenasSelecionados, pontosFiltrados, selecionadosIds, buscaSerieMapa]);
  const pontoDetalhes = pontosFiltrados.find((ponto) => ponto.id === detalhesId) || null;
  const agentesFiltrados = useMemo(() => {
    const busca = localizacaoAplicada.busca.trim().toLocaleLowerCase('pt-BR');
    return agentes.filter((agente) => {
      const shiftStatus = agente.turno_status ?? 'sem_turno';
      const correspondeLocalizacao = (!localizacaoAplicada.bairro || agente.bairro === localizacaoAplicada.bairro)
        && (!localizacaoAplicada.regiao || agente.regiao === localizacaoAplicada.regiao)
        && (!localizacaoAplicada.cidade || agente.cidade === localizacaoAplicada.cidade)
        && (!localizacaoAplicada.uf || agente.uf === localizacaoAplicada.uf)
        && (!busca || [agente.logradouro, agente.referencia, agente.cep]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('pt-BR')
          .includes(busca));
      return (filtrosAgentes.organizationIds === null || filtrosAgentes.organizationIds.includes(agente.orgao_id))
        && (filtrosAgentes.roles === null || filtrosAgentes.roles.includes(agente.cargo))
        && (filtrosAgentes.registrationStatuses === null
          || filtrosAgentes.registrationStatuses.includes(agente.ativo_cadastro ? 'ativo' : 'inativo'))
        && (filtrosAgentes.shiftStatuses === null || filtrosAgentes.shiftStatuses.includes(shiftStatus))
        && correspondeLocalizacao;
    });
  }, [agentes, filtrosAgentes, localizacaoAplicada]);
  const equipamentosNaLista = useMemo(() => {
    const termo = buscaEquipamentos.trim().toLocaleLowerCase('pt-BR');
    return termo
      ? pontosFiltrados.filter((ponto) => ponto.nome.toLocaleLowerCase('pt-BR').includes(termo))
      : pontosFiltrados;
  }, [pontosFiltrados, buscaEquipamentos]);
  const agentesNaLista = useMemo(() => {
    const termo = buscaAgentes.trim().toLocaleLowerCase('pt-BR');
    return termo
      ? agentesFiltrados.filter((agente) => [agente.nome, agente.matricula, agente.cargo, agente.orgao_nome, agente.veiculo_numero_serie]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('pt-BR')
        .includes(termo))
      : agentesFiltrados;
  }, [agentesFiltrados, buscaAgentes]);
  const agentesMapa = useMemo(() => filtrosAgentes.showOnMap ? agentesFiltrados : [],
    [filtrosAgentes.showOnMap, agentesFiltrados]);
  const cobertura = useMemo(() => collectCoverageSources(pontosMapa, agentesMapa), [pontosMapa, agentesMapa]);
  const opcoesTiposOcorrencia = useMemo(() => Array.from(new Set(
    ocorrencias.map((ocorrencia) => ocorrencia.tipo),
  )).sort((a, b) => a.localeCompare(b, 'pt-BR')).map((tipo) => ({ id: tipo, label: tipo })), [ocorrencias]);
  const ocorrenciasFiltradas = useMemo(() => ocorrencias.filter((ocorrencia) =>
    (tiposOcorrenciaAplicados === null || tiposOcorrenciaAplicados.includes(ocorrencia.tipo))
      && (gravidadesOcorrenciaAplicadas === null || gravidadesOcorrenciaAplicadas.includes(ocorrencia.gravidade)),
  ), [ocorrencias, tiposOcorrenciaAplicados, gravidadesOcorrenciaAplicadas]);
  const diasPeriodoRecorrencia = useMemo(() => {
    if (periodoOcorrenciasAplicado.mode === 'periodo') {
      return countOccurrencePeriodDays(periodoOcorrenciasAplicado.start, periodoOcorrenciasAplicado.end);
    }
    const occurrenceDays = ocorrencias
      .map((ocorrencia) => ocorrencia.ocorrida_em.slice(0, 10))
      .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day))
      .sort();
    if (!occurrenceDays.length) return 1;
    return countOccurrencePeriodDays(occurrenceDays[0], occurrenceDays[occurrenceDays.length - 1]);
  }, [ocorrencias, periodoOcorrenciasAplicado]);
  const ocorrenciasIncluidasMapa = useMemo(
    () => incluirOcorrenciasMapa ? ocorrenciasFiltradas : [],
    [incluirOcorrenciasMapa, ocorrenciasFiltradas],
  );
  const calorOcorrencias = useMemo(
    () => collectOccurrenceHeatSources(ocorrenciasFiltradas),
    [ocorrenciasFiltradas],
  );
  const resumoCalorResolucao = useMemo(
    () => summarizeOccurrenceResolution(calorOcorrencias.sources),
    [calorOcorrencias.sources],
  );
  const gradeCalorOcorrencias = useMemo(
    () => mapaCalorOcorrencias
      ? buildOccurrenceHeatGrid(
        calorOcorrencias.sources,
        modoCalorOcorrencias === 'recorrencia',
        diasPeriodoRecorrencia,
        modoCalorOcorrencias === 'tempo_resolucao',
      )
      : null,
    [mapaCalorOcorrencias, calorOcorrencias.sources, modoCalorOcorrencias, diasPeriodoRecorrencia],
  );
  const agenteDetalhes = agentes.find((agente) => agente.id === detalhesAgenteId) || null;
  const mostrarTendenciasMapa = abaAtiva === 'mapa' && mapaCalorOcorrencias;
  const mostrarPrevisaoMapa = abaAtiva === 'mapa' && previsaoAtiva;
  const carregandoCamadaPrevisao = carregandoPrevisao
    || (previsaoAtiva && !areasPrevisaoGeoJson && !erroAreasPrevisao);
  const erroCamadaPrevisao = erroPrevisao || (previsaoAtiva ? erroAreasPrevisao : '');
  const quantidadeMaximaPrevisao = useMemo(() => {
    const quantities = previsaoOcorrencias?.areas.map((area) => area.quantidade_esperada).sort((a, b) => a - b) || [];
    if (quantities.length === 0) return 0;
    return quantities[Math.min(quantities.length - 1, Math.ceil(quantities.length * 0.9) - 1)];
  }, [previsaoOcorrencias]);
  const probabilidadeMaximaPrevisao = useMemo(() => {
    const probabilities = previsaoOcorrencias?.areas
      .map((area) => area.probabilidade_grave_24h)
      .sort((a, b) => a - b) || [];
    if (probabilities.length === 0) return 0.01;
    return Math.max(0.01, probabilities[Math.min(probabilities.length - 1, Math.ceil(probabilities.length * 0.9) - 1)]);
  }, [previsaoOcorrencias]);

  function visualizarEquipamento(ponto: Ponto) {
    if (detalhesAgenteId !== null || ocorrenciaDetalhes !== null || detalhesId !== ponto.id) {
      scrollDetalhesPendente.current = painelDetalhes.current?.scrollTop ?? 0;
    }
    setDetalhesAgenteId(null);
    setOcorrenciaDetalhes(null);
    setDetalhesId(ponto.id);
  }

  function visualizarAgente(agente: Agente) {
    if (detalhesId !== null || ocorrenciaDetalhes !== null || detalhesAgenteId !== agente.id) {
      scrollDetalhesPendente.current = painelDetalhes.current?.scrollTop ?? 0;
    }
    setDetalhesId(null);
    setOcorrenciaDetalhes(null);
    setDetalhesAgenteId(agente.id);
  }

  function visualizarOcorrencia(ocorrencia: OcorrenciaMapa) {
    scrollDetalhesPendente.current = painelDetalhes.current?.scrollTop ?? 0;
    setDetalhesId(null);
    setDetalhesAgenteId(null);
    setOcorrenciaDetalhes(ocorrencia);
  }

  function selecionarAgenteNoMapa(agente: Agente) {
    setAgentesSelecionadosIds((ids) => ids.includes(agente.id) ? ids : [...ids, agente.id]);
    visualizarAgente(agente);
  }

  function alternarSelecaoAgente(agenteId: number) {
    setAgentesSelecionadosIds((ids) => ids.includes(agenteId)
      ? ids.filter((id) => id !== agenteId)
      : [...ids, agenteId]);
  }

  function selecionarNoMapa(ponto: Ponto) {
    if (selecionadosIds.includes(ponto.id)) {
      setSelecionadosIds((selecionados) => selecionados.filter((id) => id !== ponto.id));
      return;
    }
    visualizarEquipamento(ponto);
    setSelecionadosIds((selecionados) => {
      if (!permitirMultisselecao) return [ponto.id];
      return [...selecionados, ponto.id];
    });
  }

  function alternarSelecao(pontoId: number) {
    setSelecionadosIds((selecionados) => {
      if (selecionados.includes(pontoId)) {
        return selecionados.filter((id) => id !== pontoId);
      }
      return permitirMultisselecao ? [...selecionados, pontoId] : [pontoId];
    });
  }

  function alterarMultisselecao(permitida: boolean) {
    setPermitirMultisselecao(permitida);
    if (!permitida) setSelecionadosIds((selecionados) => selecionados.slice(-1));
  }

  function resetarFiltros() {
    const tiposPadrao = [1];
    const situacoesPadrao = equipmentSituationOptions.map((situation) => situation.id);

    setTiposSelecionados(tiposPadrao);
    setTiposAplicados(tiposPadrao);
    setSituacoesSelecionadas(situacoesPadrao);
    setSituacoesAplicadas(situacoesPadrao);
    setAtributosSelecionados({});
    setAtributosAplicados({});
    setFiltrosAgentes({
      showOnMap: false,
      organizationIds: null,
      roles: null,
      registrationStatuses: null,
      shiftStatuses: null,
    });
    setFiltrosLocalizacao(emptyLocationFilters);
    setLocalizacaoAplicada(emptyLocationFilters);
    setExibirApenasSelecionados(false);
    setPermitirMultisselecao(false);
    setPosicaoMovel('gps');
    setModoData('atual');
    setDataHoraSelecionada(toLocalDateTimeValue(new Date()));
    setDataHoraAplicada(null);
    setModoPeriodoOcorrencias('atual');
    setInicioOcorrencias(startOfTodayValue());
    setFimOcorrencias(toLocalDateTimeValue(new Date()));
    setIncluirOcorrenciasMapa(false);
    setTiposOcorrenciaSelecionados(null);
    setTiposOcorrenciaAplicados(null);
    setGravidadesOcorrenciaSelecionadas(null);
    setGravidadesOcorrenciaAplicadas(null);
    setPeriodoOcorrenciasAplicado({
      mode: 'atual',
      start: startOfTodayValue(),
      end: toLocalDateTimeValue(new Date()),
    });
    setSelecionadosIds((selecionados) => selecionados.slice(-1));

    const equipamentoDetalhado = pontos.find((ponto) => ponto.id === detalhesId);
    if (equipamentoDetalhado && !tiposPadrao.includes(equipamentoDetalhado.tipo_id)) {
      setDetalhesId(null);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const queryData = dataHoraAplicada
      ? `?em=${encodeURIComponent(dataHoraAplicada)}`
      : '';

    setCarregando(true);
    setErro('');
    fetch(`${process.env.REACT_APP_API_URL || ''}/api/equipamentos${queryData}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`API respondeu ${response.status}`);
        return response.json() as Promise<Ponto[]>;
      })
      .then((dados) => {
        setPontos(dados);
        setDetalhesId((idAtual) => idAtual !== null && dados.some((ponto) => ponto.id === idAtual) ? idAtual : null);
      })
      .catch((error: Error) => {
        if (error.name !== 'AbortError') setErro('Não foi possível carregar os equipamentos da API.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setCarregando(false);
      });

    return () => controller.abort();
  }, [dataHoraAplicada]);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ modo: periodoOcorrenciasAplicado.mode });
    if (periodoOcorrenciasAplicado.mode === 'periodo') {
      query.set('inicio', periodoOcorrenciasAplicado.start);
      query.set('fim', periodoOcorrenciasAplicado.end);
    }

    setCarregandoOcorrencias(true);
    setErroOcorrencias('');
    fetch(`${process.env.REACT_APP_API_URL || ''}/api/ocorrencias?${query.toString()}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`API respondeu ${response.status}`);
        return response.json() as Promise<OcorrenciaMapa[]>;
      })
      .then((dados) => {
        if (!controller.signal.aborted) {
          setOcorrencias(dados);
          setCarregandoOcorrencias(false);
        }
      })
      .catch((error: Error) => {
        if (error.name !== 'AbortError') {
          setOcorrencias([]);
          setCarregandoOcorrencias(false);
          setErroOcorrencias('Não foi possível carregar as ocorrências do mapa.');
        }
      });

    return () => controller.abort();
  }, [periodoOcorrenciasAplicado]);

  useEffect(() => {
    if (!mapaCalorOcorrencias) {
      setOcorrenciasTendencia([]);
      setCarregandoTendencias(false);
      setErroTendencias('');
      return undefined;
    }

    const controller = new AbortController();
    const query = new URLSearchParams({ modo: periodoOcorrenciasAplicado.mode });
    if (periodoOcorrenciasAplicado.mode === 'periodo') {
      query.set('inicio', periodoOcorrenciasAplicado.start);
      query.set('fim', periodoOcorrenciasAplicado.end);
    }
    setCarregandoTendencias(true);
    setErroTendencias('');
    fetch(`${process.env.REACT_APP_API_URL || ''}/api/ocorrencias/analise?${query.toString()}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`API respondeu ${response.status}`);
        return response.json() as Promise<OcorrenciaTendencia[]>;
      })
      .then((dados) => {
        if (!controller.signal.aborted) setOcorrenciasTendencia(dados);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted && error.name !== 'AbortError') {
          setOcorrenciasTendencia([]);
          setErroTendencias('Não foi possível carregar as tendências das ocorrências.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCarregandoTendencias(false);
      });

    return () => controller.abort();
  }, [mapaCalorOcorrencias, periodoOcorrenciasAplicado]);

  useEffect(() => {
    if (!exibirContornoBairros) return undefined;
    if (setoresCensitariosGeoJson) return undefined;

    const controller = new AbortController();
    setErroSetoresCensitarios('');
    fetch(`${process.env.REACT_APP_API_URL || ''}/api/setores-censitarios`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`API respondeu ${response.status}`);
        return response.json() as Promise<SetorCensitarioFeatureCollection>;
      })
      .then((geoJson) => {
        if (!controller.signal.aborted) setSetoresCensitariosGeoJson(geoJson);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted && error.name !== 'AbortError') {
          setErroSetoresCensitarios('Não foi possível carregar os setores censitários do IBGE.');
        }
      });

    return () => controller.abort();
  }, [exibirContornoBairros, setoresCensitariosGeoJson]);

  useEffect(() => {
    if (!previsaoAtiva || areasPrevisaoGeoJson) return undefined;

    const controller = new AbortController();
    setErroAreasPrevisao('');
    fetch(`${process.env.REACT_APP_API_URL || ''}/api/areas-previsao`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`API respondeu ${response.status}`);
        return response.json() as Promise<PrevisaoAreaFeatureCollection>;
      })
      .then((geoJson) => {
        if (!controller.signal.aborted) setAreasPrevisaoGeoJson(geoJson);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted && error.name !== 'AbortError') {
          setErroAreasPrevisao('Não foi possível carregar as áreas agrupadas da previsão.');
        }
      });

    return () => controller.abort();
  }, [previsaoAtiva, areasPrevisaoGeoJson]);

  useEffect(() => {
    if (!previsaoAtiva) {
      setCarregandoPrevisao(false);
      setErroPrevisao('');
      return undefined;
    }

    const controller = new AbortController();
    setCarregandoPrevisao(true);
    setErroPrevisao('');
    fetch(`${process.env.REACT_APP_API_URL || ''}/api/previsoes/ocorrencias`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`API respondeu ${response.status}`);
        return response.json() as Promise<PrevisaoOcorrencias>;
      })
      .then((dados) => {
        if (controller.signal.aborted) return;
        setPrevisaoOcorrencias(dados);
        if (dados.areas.length > 0) {
          setAreaPrevisaoSelecionadaId((atual) => (
            atual !== null && dados.areas.some((area) => area.id === atual)
              ? atual
              : [...dados.areas].sort((left, right) => right.probabilidade_grave_24h - left.probabilidade_grave_24h)[0].id
          ));
        }
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted && error.name !== 'AbortError') {
          setPrevisaoOcorrencias(null);
          setErroPrevisao('Não foi possível calcular a previsão de ocorrências.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCarregandoPrevisao(false);
      });

    return () => controller.abort();
  }, [previsaoAtiva]);

  useEffect(() => {
    const controller = new AbortController();
    const query = dataHoraAplicada
      ? `?em=${encodeURIComponent(dataHoraAplicada)}`
      : '';

    setErroAgentes('');
    fetch(`${process.env.REACT_APP_API_URL || ''}/api/agentes${query}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`API respondeu ${response.status}`);
        return response.json() as Promise<Agente[]>;
      })
      .then((dados) => {
        setAgentes(dados);
        setDetalhesAgenteId((idAtual) => idAtual !== null && dados.some((agente) => agente.id === idAtual) ? idAtual : null);
      })
      .catch((error: Error) => {
        if (error.name !== 'AbortError') {
          setAgentes([]);
          setErroAgentes('Não foi possível carregar os agentes da API.');
        }
      });

    return () => controller.abort();
  }, [dataHoraAplicada]);

  useEffect(() => {
    const idsMoveisSelecionados = selecionadosIds.filter((id) =>
      pontos.some((ponto) => ponto.id === id && ponto.mobilidade === 'movel'),
    );
    if (idsMoveisSelecionados.length === 0) {
      setRotas([]);
      setErroRotas('');
      return;
    }

    const controller = new AbortController();
    setErroRotas('');
    const query = new URLSearchParams();
    idsMoveisSelecionados.forEach((id) => query.append('equipamento_ids', String(id)));
    if (dataHoraAplicada) query.set('em', dataHoraAplicada);

    fetch(`${process.env.REACT_APP_API_URL || ''}/api/viagens/rotas-ativas?${query.toString()}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`API respondeu ${response.status}`);
        return response.json() as Promise<RotaVeiculo[]>;
      })
      .then((dados) => {
        setRotas(dados);
        setErroRotas('');
      })
      .catch((error: Error) => {
        if (error.name !== 'AbortError') {
          setRotas([]);
          setErroRotas('Não foi possível carregar as rotas dos equipamentos selecionados.');
        }
      });

    return () => controller.abort();
  }, [selecionadosIds, pontos, dataHoraAplicada]);

  const quantidadeEquipamentosSelecionadosNoMapa = pontosMapa.filter((ponto) => selecionadosIds.includes(ponto.id)).length;
  const quantidadeAgentesSelecionadosNoMapa = agentesMapa.filter((agente) => agentesSelecionadosIds.includes(agente.id)).length;

  return (
    <div className={painelExpandido ? 'App' : 'App filters-collapsed'}>
      <FilterPanel
        expanded={painelExpandido}
        onExpandedChange={setPainelExpandido}
        types={{ options: equipmentTypes, selectedIds: tiposSelecionados, onChange: setTiposSelecionados }}
        situations={{ options: equipmentSituationOptions, selectedIds: situacoesSelecionadas, onChange: setSituacoesSelecionadas }}
        agents={{
          value: filtrosAgentes,
          organizations: opcoesOrgaosAgentes,
          roles: opcoesCargosAgentes,
          onChange: setFiltrosAgentes,
        }}
        location={{ value: filtrosLocalizacao, options: opcoesLocalizacao, onChange: setFiltrosLocalizacao }}
        attributes={{
          options: opcoesAtributos,
          visibleTypeIds: tiposSelecionados,
          value: atributosSelecionados,
          onChange: setAtributosSelecionados,
        }}
        position={{ value: posicaoMovel, onChange: setPosicaoMovel }}
        period={{
          mode: modoData,
          onModeChange: setModoData,
          value: dataHoraSelecionada,
          onValueChange: setDataHoraSelecionada,
          maxValue: toLocalDateTimeValue(new Date()),
        }}
        occurrencePeriod={{
          includeOnMap: incluirOcorrenciasMapa,
          onIncludeOnMapChange: setIncluirOcorrenciasMapa,
          mode: modoPeriodoOcorrencias,
          onModeChange: setModoPeriodoOcorrencias,
          start: inicioOcorrencias,
          onStartChange: setInicioOcorrencias,
          end: fimOcorrencias,
          onEndChange: setFimOcorrencias,
          maxValue: toLocalDateTimeValue(new Date()),
        }}
        occurrenceFilters={{
          types: opcoesTiposOcorrencia,
          gravities: occurrenceSeverityOptions,
          selectedTypes: tiposOcorrenciaSelecionados,
          onTypesChange: setTiposOcorrenciaSelecionados,
          selectedGravities: gravidadesOcorrenciaSelecionadas,
          onGravitiesChange: setGravidadesOcorrenciaSelecionadas,
        }}
        display={{
          onlySelected: exibirApenasSelecionados,
          onOnlySelectedChange: setExibirApenasSelecionados,
          multiSelection: permitirMultisselecao,
          onMultiSelectionChange: alterarMultisselecao,
          neighborhoodBoundaries: exibirContornoBairros,
          onNeighborhoodBoundariesChange: setExibirContornoBairros,
        }}
        onApply={() => {
          setTiposAplicados(tiposSelecionados);
          setSituacoesAplicadas(situacoesSelecionadas);
          setAtributosAplicados(atributosSelecionados);
          setLocalizacaoAplicada(filtrosLocalizacao);
          setDataHoraAplicada(modoData === 'historico' ? dataHoraSelecionada : null);
          setPeriodoOcorrenciasAplicado({
            mode: modoPeriodoOcorrencias,
            start: inicioOcorrencias,
            end: fimOcorrencias,
          });
          setTiposOcorrenciaAplicados(tiposOcorrenciaSelecionados);
          setGravidadesOcorrenciaAplicadas(gravidadesOcorrenciaSelecionadas);
        }}
        onReset={resetarFiltros}
      />
      <div className='center-painel'>
        <TopBarMap
          abaAtiva={abaAtiva}
          onChange={setAbaAtiva}
          tema={tema}
          onToggleTema={() => setTema((atual) => atual === 'dark' ? 'light' : 'dark')}
          busca={abaAtiva === 'mapa'
            ? buscaSerieMapa
            : abaAtiva === 'lista'
              ? buscaEquipamentos
              : buscaAgentes}
          onBuscaChange={abaAtiva === 'mapa'
            ? setBuscaSerieMapa
            : abaAtiva === 'lista'
              ? setBuscaEquipamentos
              : setBuscaAgentes}
        />
        {erroAgentes && <p className="api-message api-error" role="alert">{erroAgentes}</p>}
        {carregando && <p className="api-message" role="status">Carregando equipamentos…</p>}
        {erro && <p className="api-message api-error" role="alert">{erro}</p>}
        {erroRotas && <p className="api-message api-error" role="alert">{erroRotas}</p>}
        {erroOcorrencias && <p className="api-message api-error" role="alert">{erroOcorrencias}</p>}
        <div className={`map-panel${mapaCalorCobertura || mapaCalorOcorrencias || previsaoAtiva ? ' map-heat-active' : ''}`} hidden={abaAtiva !== 'mapa'}>
          <Map
            pontos={exibirItensMapa ? pontosMapa : []}
            rotas={rotas}
            ativo={abaAtiva === 'mapa'}
            onSelecionar={selecionarNoMapa}
            agents={agentesMapa}
            showAgents={filtrosAgentes.showOnMap && exibirAgentesMapa}
            occurrences={ocorrenciasIncluidasMapa}
            showOccurrences={incluirOcorrenciasMapa && exibirMarcadoresOcorrencias}
            selectedOccurrenceId={ocorrenciaDetalhes?.id ?? 0}
            onSelectOccurrence={visualizarOcorrencia}
            selectedAgentId={detalhesAgenteId ?? 0}
            selectedAgentIds={agentesSelecionadosIds}
            onSelectAgent={selecionarAgenteNoMapa}
            selecionadosIds={selecionadosIds}
            exibirContornoBairros={exibirContornoBairros}
            censusSectorGeoJson={setoresCensitariosGeoJson}
            predictionAreaGeoJson={areasPrevisaoGeoJson}
            temaEscuro={tema === 'dark'}
            coverageHeatEnabled={mapaCalorCobertura}
            coverageSources={cobertura.sources}
            occurrenceHeatEnabled={mapaCalorOcorrencias}
            occurrenceHeatGrid={gradeCalorOcorrencias}
            occurrenceHeatMode={modoCalorOcorrencias}
            occurrenceHeatResolutionSummary={resumoCalorResolucao}
            occurrencePredictionEnabled={previsaoAtiva && previsaoOcorrencias?.status === 'ok' && Boolean(areasPrevisaoGeoJson)}
            occurrencePredictions={previsaoOcorrencias?.areas ?? []}
            occurrencePredictionMetric={metricaPrevisao}
            selectedPredictionAreaId={areaPrevisaoSelecionadaId}
            onSelectPredictionArea={setAreaPrevisaoSelecionadaId}
            occurrencePredictionGeneratedAt={previsaoOcorrencias?.gerada_em ?? ''}
          />
          <div className="map-heat-control" role="group" aria-label="Filtros de mapa de calor">
            <strong>Mapa de calor</strong>
            {exibirContornoBairros && erroSetoresCensitarios && (
              <p className="map-heat-description is-error" role="alert">{erroSetoresCensitarios}</p>
            )}
            <label className="map-heat-option">
              <input
                type="checkbox"
                checked={mapaCalorCobertura}
                onChange={(event) => {
                  setMapaCalorCobertura(event.target.checked);
                  if (event.target.checked) setPrevisaoAtiva(false);
                }}
                aria-label="Aplicar mapa de calor de cobertura"
              />
              <span>Cobertura</span>
            </label>
            <label className="map-heat-option">
              <input
                type="checkbox"
                checked={mapaCalorOcorrencias}
                onChange={(event) => {
                  setMapaCalorOcorrencias(event.target.checked);
                  if (event.target.checked) setPrevisaoAtiva(false);
                }}
                aria-label="Aplicar mapa de calor de ocorrências"
              />
              <span>Ocorrências</span>
            </label>
            {mapaCalorCobertura && (
              <>
                <p className="map-heat-description" aria-live="polite">
                  {cobertura.equipmentCount} equipamentos · {cobertura.agentCount} agentes.
                  {' '}Inclui pontos fora da tela e marcadores ocultos.
                </p>
                {cobertura.excludedCount > 0 && (
                  <p className="map-heat-description">{cobertura.excludedCount} sem posição ou alcance válido.</p>
                )}
                <div className="map-heat-legend" aria-label="Sobreposição de cobertura: escala de cores fixa">
                  <span>Sobreposição de cobertura</span>
                  <span className="map-heat-legend-scale" style={{ background: coverageGradient }} aria-hidden="true" />
                  <div><span>Menor</span><span>Maior</span></div>
                </div>
              </>
            )}
            {mapaCalorOcorrencias && (
              <>
                <label className="map-heat-mode">
                  <span>Visualizar por</span>
                  <select
                    value={modoCalorOcorrencias}
                    onChange={(event) => setModoCalorOcorrencias(event.target.value as OccurrenceHeatMode)}
                    aria-label="Visualizar mapa de calor de ocorrências por"
                  >
                    <option value="quantidade">Quantidade</option>
                    <option value="gravidade">Gravidade</option>
                    <option value="ambos">Quantidade + gravidade</option>
                    <option value="recorrencia">Recorrência</option>
                    <option value="tempo_resolucao">Tempo de resolução</option>
                  </select>
                </label>
                <p className="map-heat-description" aria-live="polite">
                  {modoCalorOcorrencias === 'tempo_resolucao'
                    ? `${resumoCalorResolucao.resolvedCount} ocorrências resolvidas com duração válida.`
                    : `${calorOcorrencias.sources.length} ocorrências filtradas, inclusive ocultas ou fora da tela.`}
                </p>
                <p className="map-heat-description">
                  {modoCalorOcorrencias === 'quantidade' && 'As cores mais quentes indicam mais ocorrências.'}
                  {modoCalorOcorrencias === 'gravidade' && 'Cor indica gravidade média; opacidade acumula gravidade.'}
                  {modoCalorOcorrencias === 'ambos' && 'Cor indica gravidade; opacidade indica quantidade.'}
                  {modoCalorOcorrencias === 'recorrencia' && `Percentual de dias do período (${diasPeriodoRecorrencia} dias) em que o mesmo tipo ocorreu em 350 m.`}
                  {modoCalorOcorrencias === 'tempo_resolucao' && resumoCalorResolucao.areaCount > 0
                    && `Azul indica resolução mais rápida e vermelho, mais lenta. Mediana em 350 m; escala até ${formatResolutionHours(resumoCalorResolucao.maximumHours)} (percentil 90), incluindo pontos ocultos e fora da tela.`}
                  {modoCalorOcorrencias === 'quantidade' && gradeCalorOcorrencias
                    && `Escala ajustada ao percentil 95 das contribuições locais; vermelho indica ${formatQuantityScale(gradeCalorOcorrencias.quantityScaleMaximum)} ou mais no total do período.`}
                  {modoCalorOcorrencias === 'ambos' && gradeCalorOcorrencias
                    && `A opacidade usa escala dinâmica: máxima a partir do P95 (${formatQuantityScale(gradeCalorOcorrencias.quantityScaleMaximum)} contribuições locais).`}
                </p>
                {modoCalorOcorrencias === 'tempo_resolucao' && resumoCalorResolucao.areaCount === 0 && (
                  <p className="map-heat-description" role="status">
                    {resumoCalorResolucao.resolvedCount === 0 && periodoOcorrenciasAplicado.mode === 'atual'
                      ? 'O filtro Atuais só traz ocorrências abertas ou em atendimento. Escolha um período para analisar as resolvidas.'
                      : resumoCalorResolucao.resolvedCount === 0
                        ? 'Não há ocorrências resolvidas com duração válida nos filtros atuais.'
                        : 'Nenhuma área tem pelo menos 3 ocorrências resolvidas em um raio de 350 m.'}
                  </p>
                )}
                {calorOcorrencias.excludedCount > 0 && (
                  <p className="map-heat-description">{calorOcorrencias.excludedCount} sem coordenada válida.</p>
                )}
                {(modoCalorOcorrencias !== 'tempo_resolucao' || resumoCalorResolucao.areaCount > 0) && (
                  <div className="map-heat-legend" aria-label="Escala de cores do mapa de calor de ocorrências">
                    <span>
                      {modoCalorOcorrencias === 'quantidade' ? 'Quantidade de ocorrências'
                        : modoCalorOcorrencias === 'recorrencia' ? '% de dias com o mesmo tipo'
                          : modoCalorOcorrencias === 'tempo_resolucao' ? 'Mediana do tempo de resolução'
                            : 'Gravidade média'}
                    </span>
                    <span
                      className="map-heat-legend-scale"
                      style={{ background: modoCalorOcorrencias === 'quantidade' ? coverageGradient
                        : modoCalorOcorrencias === 'recorrencia' ? occurrenceRecurrenceGradient
                          : modoCalorOcorrencias === 'tempo_resolucao' ? occurrenceResolutionGradient : occurrenceSeverityGradient }}
                      aria-hidden="true"
                    />
                    <div>
                      {modoCalorOcorrencias === 'quantidade'
                        ? gradeCalorOcorrencias
                          ? <><span>0</span><span>P95+ ({formatQuantityScale(gradeCalorOcorrencias.quantityScaleMaximum)})</span></>
                          : <><span>0</span><span>Sem dados</span></>
                        : modoCalorOcorrencias === 'recorrencia'
                          ? <><span>0%</span><span>15%+</span></>
                          : modoCalorOcorrencias === 'tempo_resolucao'
                            ? <><span>0 min</span><span>{formatResolutionHours(resumoCalorResolucao.maximumHours)}+</span></>
                            : <><span>Baixa</span><span>Crítica</span></>}
                    </div>
                  </div>
                )}
              </>
            )}
            <label className="map-heat-option">
              <input
                type="checkbox"
                checked={previsaoAtiva}
                onChange={(event) => {
                  setPrevisaoAtiva(event.target.checked);
                  if (event.target.checked) {
                    setMapaCalorCobertura(false);
                    setMapaCalorOcorrencias(false);
                  }
                }}
                aria-label="Exibir previsão de ocorrências nas próximas 24 horas"
              />
              <span>Previsão (24 h)</span>
            </label>
            {previsaoAtiva && (
              <>
                <label className="map-heat-mode">
                  <span>Visualizar por</span>
                  <select
                    value={metricaPrevisao}
                    onChange={(event) => setMetricaPrevisao(event.target.value as 'quantidade' | 'probabilidade')}
                    aria-label="Visualizar previsão por"
                  >
                    <option value="quantidade">Quantidade esperada</option>
                    <option value="probabilidade">Chance de ocorrência grave</option>
                  </select>
                </label>
                {carregandoCamadaPrevisao && <p className="map-heat-description" role="status">{carregandoPrevisao ? 'Calculando previsão…' : 'Carregando áreas agrupadas…'}</p>}
                {erroCamadaPrevisao && <p className="map-heat-description is-error" role="alert">{erroCamadaPrevisao}</p>}
                {!carregandoCamadaPrevisao && !erroCamadaPrevisao && previsaoOcorrencias?.status === 'ok' && (
                  <>
                    <p className="map-heat-description">
                      {previsaoOcorrencias.quantidade_areas} áreas agrupadas · {previsaoOcorrencias.quantidade_setores} setores · {previsaoOcorrencias.periodo_historico_semanas} semanas comparáveis. Não depende dos filtros de ocorrências.
                    </p>
                    <div className="map-heat-legend" aria-label="Escala da previsão de ocorrências">
                      <span>{metricaPrevisao === 'quantidade' ? 'Ocorrências esperadas nas próximas 24 h' : 'Chance de ocorrência grave nas próximas 24 h'}</span>
                      <span className="map-heat-legend-scale" style={{ background: occurrencePredictionGradient }} aria-hidden="true" />
                      <div>
                        {metricaPrevisao === 'quantidade'
                          ? <><span>0</span><span>P90+ ({formatQuantityScale(quantidadeMaximaPrevisao)})</span></>
                          : <><span>0%</span><span>P90+ ({formatProbabilityScale(probabilidadeMaximaPrevisao)})</span></>}
                      </div>
                    </div>
                  </>
                )}
                {!carregandoCamadaPrevisao && previsaoOcorrencias?.status === 'sem_historico' && (
                  <p className="map-heat-description">Histórico insuficiente para estimar ocorrências.</p>
                )}
              </>
            )}
          </div>
          <div className="map-selection-summary" aria-label="Contagem de selecao no mapa" aria-live="polite">
            <div className="map-selection-count-row">
              <label className="map-selection-visibility">
                <input
                  type="checkbox"
                  checked={exibirItensMapa}
                  onChange={(event) => setExibirItensMapa(event.target.checked)}
                  aria-label="Exibir itens no mapa"
                  title="Exibir itens no mapa"
                />
                <span>Itens</span>
              </label>
              <span
                className="item-list-selection-count"
                aria-label={`${quantidadeEquipamentosSelecionadosNoMapa} itens selecionados de ${pontosMapa.length} exibidos`}
                title={`${quantidadeEquipamentosSelecionadosNoMapa} itens selecionados de ${pontosMapa.length} exibidos`}
              >
                <strong>{quantidadeEquipamentosSelecionadosNoMapa}</strong>
                <span aria-hidden="true">/</span>
                <span>{pontosMapa.length}</span>
              </span>
            </div>
            <div className="map-selection-count-row">
              <label className="map-selection-visibility">
                <input
                  type="checkbox"
                  checked={exibirAgentesMapa}
                  onChange={(event) => setExibirAgentesMapa(event.target.checked)}
                  aria-label="Exibir agentes no mapa"
                  title="Exibir agentes no mapa"
                />
                <span>Agentes</span>
              </label>
              <span
                className="item-list-selection-count"
                aria-label={`${quantidadeAgentesSelecionadosNoMapa} agentes selecionados de ${agentesMapa.length} exibidos`}
                title={`${quantidadeAgentesSelecionadosNoMapa} agentes selecionados de ${agentesMapa.length} exibidos`}
              >
                <strong>{quantidadeAgentesSelecionadosNoMapa}</strong>
                <span aria-hidden="true">/</span>
                <span>{agentesMapa.length}</span>
              </span>
            </div>
            <div className="map-selection-count-row">
              <label className="map-selection-visibility">
                <input
                  type="checkbox"
                  checked={exibirMarcadoresOcorrencias}
                  onChange={(event) => setExibirMarcadoresOcorrencias(event.target.checked)}
                  aria-label="Exibir marcadores de ocorrências no mapa"
                  title="Exibir marcadores de ocorrências no mapa"
                />
                <span>Ocorrências</span>
              </label>
              <span
                className="item-list-selection-count"
                aria-label={`${ocorrenciasIncluidasMapa.length} ocorrências incluídas`}
                title={`${ocorrenciasIncluidasMapa.length} ocorrências incluídas`}
              >
                <span>{ocorrenciasIncluidasMapa.length}</span>
              </span>
            </div>
          </div>
        </div>
        <ItemList
          visible={abaAtiva === 'lista'}
          pontos={equipamentosNaLista}
          selecionadosIds={selecionadosIds}
          detalhesId={detalhesId}
          onVisualizar={visualizarEquipamento}
          onAlternarSelecao={alternarSelecao}
          onAlternarTodos={(selecionar, idsVisiveis) => {
            if (selecionar) setPermitirMultisselecao(true);
            setSelecionadosIds((selecionados) =>
              selecionar
                ? selecionados.filter((id) => !idsVisiveis.includes(id)).concat(idsVisiveis)
                : selecionados.filter((id) => !idsVisiveis.includes(id)),
            );
          }}
        />
        <AgentList
          visible={abaAtiva === 'agentes'}
          agents={agentesNaLista}
          selectedAgentId={detalhesAgenteId}
          selectedAgentIds={agentesSelecionadosIds}
          onSelect={visualizarAgente}
          onToggleSelection={alternarSelecaoAgente}
        />
      </div>
      <aside
        className='rigth-painel'
        aria-label={mostrarPrevisaoMapa
          ? 'Previsão de ocorrências e detalhes'
          : mostrarTendenciasMapa ? 'Tendências do mapa e detalhes'
          : detalhesAgenteId !== null ? 'Informações do agente'
            : ocorrenciaDetalhes !== null ? 'Informações da ocorrência' : 'Informações do equipamento'}
        ref={painelDetalhes}
      >
        {mostrarPrevisaoMapa && (
          <OccurrencePredictionPanel
            forecast={previsaoOcorrencias}
            selectedAreaId={areaPrevisaoSelecionadaId}
            onSelectArea={setAreaPrevisaoSelecionadaId}
            loading={carregandoCamadaPrevisao}
            error={erroCamadaPrevisao}
          />
        )}
        {mostrarTendenciasMapa && (
          <OccurrenceTrendsPanel
            occurrences={ocorrenciasTendencia}
            mode={modoCalorOcorrencias}
            period={periodoOcorrenciasAplicado}
            selectedTypes={tiposOcorrenciaAplicados}
            selectedGravities={gravidadesOcorrenciaAplicadas}
            loading={carregandoTendencias}
            error={erroTendencias}
          />
        )}
        {detalhesAgenteId !== null
          ? <AgentDetails agente={agenteDetalhes} agentes={agentes} dark={tema === 'dark'} onDetailsReady={restaurarScrollDetalhes} onClose={() => setDetalhesAgenteId(null)} />
          : ocorrenciaDetalhes !== null
            ? <OccurrenceDetails
              occurrence={ocorrenciaDetalhes}
              loading={carregandoOcorrencias}
              error={erroOcorrencias}
              onClose={() => setOcorrenciaDetalhes(null)}
            />
            : (!mostrarTendenciasMapa && !mostrarPrevisaoMapa) || pontoDetalhes
              ? <EquipmentDetails
            ponto={pontoDetalhes}
            dataHora={dataHoraAplicada}
            agentes={agentes}
            dark={tema === 'dark'}
            onDetailsReady={restaurarScrollDetalhes}
            onSelectAgent={visualizarAgente}
            onClose={() => setDetalhesId(null)}
                />
              : null}
      </aside>
    </div>
  );
}

export default App;
