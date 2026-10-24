import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import Map from './components/Map';
import TopBarMap from './components/TopBarMap';
import ItemList from './components/ItemList';
import EquipmentDetails from './components/EquipmentDetails';
import FilterPanel from './components/FilterPanel';
import {
  Aba,
  AttributeFilterOption,
  AttributeFilterState,
  LocationFilters,
  Ponto,
  RotaVeiculo,
} from './types';
import { equipmentSituations, equipmentTypes } from './equipmentCatalog';
import { attributeLabels } from './components/equipment-details/labels';

const equipmentSituationOptions = Object.entries(equipmentSituations).map(([id, situation]) => ({
  id: Number(id),
  label: situation.label,
}));

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

function App() {
  const [abaAtiva, setAbaAtiva] = useState<Aba>('mapa');
  const [exibirContornoBairros, setExibirContornoBairros] = useState(false);
  const [pontos, setPontos] = useState<Ponto[]>([]);
  const [rotas, setRotas] = useState<RotaVeiculo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [erroRotas, setErroRotas] = useState('');
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
  const [detalhesId, setDetalhesId] = useState<number | null>(null);
  const [exibirApenasSelecionados, setExibirApenasSelecionados] = useState(false);
  const [permitirMultisselecao, setPermitirMultisselecao] = useState(false);
  const [filtrosLocalizacao, setFiltrosLocalizacao] = useState<LocationFilters>(emptyLocationFilters);
  const [localizacaoAplicada, setLocalizacaoAplicada] = useState<LocationFilters>(emptyLocationFilters);
  const [posicaoMovel, setPosicaoMovel] = useState<'gps' | 'fixa'>('gps');
  const [modoData, setModoData] = useState<'atual' | 'historico'>('atual');
  const [dataHoraSelecionada, setDataHoraSelecionada] = useState(() => toLocalDateTimeValue(new Date()));
  const [dataHoraAplicada, setDataHoraAplicada] = useState<string | null>(null);
  const [painelExpandido, setPainelExpandido] = useState(true);
  const painelDetalhes = useRef<HTMLElement>(null);

  const opcoesLocalizacao = useMemo(() => {
    const valores = (campo: 'bairro' | 'regiao' | 'cidade' | 'uf') => Array.from(new Set(
      pontos.map((ponto) => ponto[campo]).filter((valor): valor is string => Boolean(valor)),
    )).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    return {
      bairros: valores('bairro'),
      regioes: valores('regiao'),
      cidades: valores('cidade'),
      ufs: valores('uf'),
    };
  }, [pontos]);
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
  const pontosMapa = exibirApenasSelecionados
    ? pontosFiltrados.filter((ponto) => selecionadosIds.includes(ponto.id))
    : pontosFiltrados;
  const pontoDetalhes = pontosFiltrados.find((ponto) => ponto.id === detalhesId) || null;

  function visualizarEquipamento(ponto: Ponto) {
    setDetalhesId(ponto.id);
    painelDetalhes.current?.scrollTo({ top: 0 });
  }

  function selecionarNoMapa(ponto: Ponto) {
    visualizarEquipamento(ponto);
    setSelecionadosIds((selecionados) => {
      if (!permitirMultisselecao) return [ponto.id];
      return selecionados.includes(ponto.id) ? selecionados : [...selecionados, ponto.id];
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
    setFiltrosLocalizacao(emptyLocationFilters);
    setLocalizacaoAplicada(emptyLocationFilters);
    setExibirApenasSelecionados(false);
    setPermitirMultisselecao(false);
    setPosicaoMovel('gps');
    setModoData('atual');
    setDataHoraSelecionada(toLocalDateTimeValue(new Date()));
    setDataHoraAplicada(null);
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

  return (
    <div className={painelExpandido ? 'App' : 'App filters-collapsed'}>
      <FilterPanel
        expanded={painelExpandido}
        onExpandedChange={setPainelExpandido}
        types={{ options: equipmentTypes, selectedIds: tiposSelecionados, onChange: setTiposSelecionados }}
        situations={{ options: equipmentSituationOptions, selectedIds: situacoesSelecionadas, onChange: setSituacoesSelecionadas }}
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
        }}
        onReset={resetarFiltros}
      />
      <div className='center-painel'>
        <TopBarMap
          abaAtiva={abaAtiva}
          onChange={setAbaAtiva}
        />
        {carregando && <p className="api-message" role="status">Carregando equipamentos…</p>}
        {erro && <p className="api-message api-error" role="alert">{erro}</p>}
        {erroRotas && <p className="api-message api-error" role="alert">{erroRotas}</p>}
        <div className="map-panel" hidden={abaAtiva !== 'mapa'}>
          <Map
            pontos={pontosMapa}
            rotas={rotas}
            ativo={abaAtiva === 'mapa'}
            onSelecionar={selecionarNoMapa}
            selecionadosIds={selecionadosIds}
            exibirContornoBairros={exibirContornoBairros}
          />
        </div>
        {abaAtiva === 'lista' && (
          <ItemList
            pontos={pontosFiltrados}
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
        )}
      </div>
      <aside className='rigth-painel' aria-label="Informações do equipamento" ref={painelDetalhes}>
        <EquipmentDetails ponto={pontoDetalhes} dataHora={dataHoraAplicada} onClose={() => setDetalhesId(null)} />
      </aside>
    </div>
  );
}

export default App;
