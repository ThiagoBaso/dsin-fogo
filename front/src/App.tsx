import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import Map from './components/Map';
import TopBarMap from './components/TopBarMap';
import ItemList from './components/ItemList';
import EquipmentDetails from './components/EquipmentDetails';
import { Aba, Ponto, RotaVeiculo } from './types';
import { equipmentSituations, equipmentTypes } from './equipmentCatalog';

const equipmentSituationOptions = Object.entries(equipmentSituations).map(([id, situation]) => ({
  id: Number(id),
  label: situation.label,
}));

type LocationFilters = {
  bairro: string;
  regiao: string;
  cidade: string;
  uf: string;
  busca: string;
};

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

function CheckboxFilterGroup({
  title,
  options,
  selectedIds,
  onChange,
}: {
  title: string;
  options: { id: number; label: string }[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}) {
  const todosSelecionados = selectedIds.length === options.length;

  return (
    <details className="equipment-filter-accordion" open>
      <summary>{title}</summary>
      <div className="equipment-filter-options" role="group" aria-label={title}>
        <label className="equipment-filter-option">
          <input
            type="checkbox"
            checked={todosSelecionados}
            onChange={(event) => onChange(event.target.checked ? options.map((option) => option.id) : [])}
          />
          <span>Todos</span>
        </label>
        {options.map((option) => (
          <label className="equipment-filter-option" key={option.id}>
            <input
              type="checkbox"
              checked={selectedIds.includes(option.id)}
              onChange={(event) => onChange(event.target.checked
                ? [...selectedIds, option.id]
                : selectedIds.filter((id) => id !== option.id))}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

function App() {
  const [abaAtiva, setAbaAtiva] = useState<Aba>('mapa');
  const [pontos, setPontos] = useState<Ponto[]>([]);
  const [rotas, setRotas] = useState<RotaVeiculo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [tiposSelecionados, setTiposSelecionados] = useState<number[]>([1]);
  const [tiposAplicados, setTiposAplicados] = useState<number[]>([1]);
  const [situacoesSelecionadas, setSituacoesSelecionadas] = useState<number[]>(
    equipmentSituationOptions.map((situation) => situation.id),
  );
  const [situacoesAplicadas, setSituacoesAplicadas] = useState<number[]>(
    equipmentSituationOptions.map((situation) => situation.id),
  );
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

      return tiposAplicados.includes(ponto.tipo_id)
        && situacoesAplicadas.includes(ponto.situacao_id)
        && correspondeLocalizacao;
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
  }, [pontos, tiposAplicados, situacoesAplicadas, localizacaoAplicada, posicaoMovel]);
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
      return;
    }

    const controller = new AbortController();
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
      .then(setRotas)
      .catch((error: Error) => {
        if (error.name !== 'AbortError') setRotas([]);
      });

    return () => controller.abort();
  }, [selecionadosIds, pontos, dataHoraAplicada]);

  return (
    <div className={painelExpandido ? 'App' : 'App filters-collapsed'}>
      <aside
        id="equipment-filter-panel"
        className='left-painel'
        aria-label="Filtros de equipamentos"
        hidden={!painelExpandido}
      >
        <form
          className="equipment-filters"
          onSubmit={(event) => {
            event.preventDefault();
            setTiposAplicados(tiposSelecionados);
            setSituacoesAplicadas(situacoesSelecionadas);
            setLocalizacaoAplicada(filtrosLocalizacao);
            setDataHoraAplicada(modoData === 'historico' ? dataHoraSelecionada : null);
          }}
        >
          <div className="equipment-filters-content">
            <div className="equipment-filters-heading">
              <h2>Filtros</h2>
              <button type="button" className="equipment-filters-reset" onClick={resetarFiltros}>
                Resetar
              </button>
            </div>
            <section className="equipment-time-filters" aria-label="Período dos equipamentos">
              <h3>Período</h3>
              <label className="equipment-time-option">
                <input
                  type="radio"
                  name="modo-data"
                  value="atual"
                  checked={modoData === 'atual'}
                  onChange={() => setModoData('atual')}
                />
                <span>Atual</span>
              </label>
              <label className="equipment-time-option">
                <input
                  type="radio"
                  name="modo-data"
                  value="historico"
                  checked={modoData === 'historico'}
                  onChange={() => setModoData('historico')}
                />
                <span>Escolher data e hora</span>
              </label>
              {modoData === 'historico' && (
                <label className="equipment-location-control">
                  <span>Data e hora</span>
                  <input
                    type="datetime-local"
                    value={dataHoraSelecionada}
                    max={toLocalDateTimeValue(new Date())}
                    required
                    onChange={(event) => setDataHoraSelecionada(event.target.value)}
                  />
                </label>
              )}
            </section>
            <CheckboxFilterGroup
              title="Tipo de equipamento"
              options={equipmentTypes}
              selectedIds={tiposSelecionados}
              onChange={setTiposSelecionados}
            />
            <CheckboxFilterGroup
              title="Status do equipamento"
              options={equipmentSituationOptions}
              selectedIds={situacoesSelecionadas}
              onChange={setSituacoesSelecionadas}
            />
            <section className="equipment-location-filters" aria-label="Filtros de localização">
              <h3>Localização</h3>
              <label className="equipment-location-control">
                <span>Bairro</span>
                <select value={filtrosLocalizacao.bairro} onChange={(event) => setFiltrosLocalizacao({ ...filtrosLocalizacao, bairro: event.target.value })}>
                  <option value="">Todos os bairros</option>
                  {opcoesLocalizacao.bairros.map((bairro) => <option key={bairro} value={bairro}>{bairro}</option>)}
                </select>
              </label>
              <label className="equipment-location-control">
                <span>Região</span>
                <select value={filtrosLocalizacao.regiao} onChange={(event) => setFiltrosLocalizacao({ ...filtrosLocalizacao, regiao: event.target.value })}>
                  <option value="">Todas as regiões</option>
                  {opcoesLocalizacao.regioes.map((regiao) => <option key={regiao} value={regiao}>{regiao}</option>)}
                </select>
              </label>
              <label className="equipment-location-control">
                <span>Cidade</span>
                <select value={filtrosLocalizacao.cidade} onChange={(event) => setFiltrosLocalizacao({ ...filtrosLocalizacao, cidade: event.target.value })}>
                  <option value="">Todas as cidades</option>
                  {opcoesLocalizacao.cidades.map((cidade) => <option key={cidade} value={cidade}>{cidade}</option>)}
                </select>
              </label>
              <label className="equipment-location-control">
                <span>UF</span>
                <select value={filtrosLocalizacao.uf} onChange={(event) => setFiltrosLocalizacao({ ...filtrosLocalizacao, uf: event.target.value })}>
                  <option value="">Todas as UFs</option>
                  {opcoesLocalizacao.ufs.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                </select>
              </label>
              <label className="equipment-location-control">
                <span>Logradouro, referência ou CEP</span>
                <input
                  type="search"
                  value={filtrosLocalizacao.busca}
                  onChange={(event) => setFiltrosLocalizacao({ ...filtrosLocalizacao, busca: event.target.value })}
                  placeholder="Buscar endereço"
                />
              </label>
            </section>
            <section className="equipment-location-filters" aria-label="Posição de equipamentos móveis">
              <h3>Posição dos equipamentos móveis</h3>
              <label className="equipment-location-control">
                <span>Exibir no mapa</span>
                <select value={posicaoMovel} onChange={(event) => setPosicaoMovel(event.target.value as 'gps' | 'fixa')}>
                  <option value="gps">Última posição no GPS</option>
                  <option value="fixa">Posição fixa cadastrada</option>
                </select>
              </label>
            </section>
            <section className="equipment-display-options" aria-label="Opções de exibição">
              <h3>Opções de exibição</h3>
              <label className="equipment-display-option">
                <input
                  type="checkbox"
                  checked={exibirApenasSelecionados}
                  onChange={(event) => setExibirApenasSelecionados(event.target.checked)}
                />
                <span>Exibir apenas selecionados</span>
              </label>
              <label className="equipment-display-option">
                <input
                  type="checkbox"
                  checked={permitirMultisselecao}
                  onChange={(event) => alterarMultisselecao(event.target.checked)}
                />
                <span>Permitir multisseleção</span>
              </label>
            </section>
          </div>
          <div className="equipment-filters-actions">
            <button type="submit">Atualizar</button>
          </div>
        </form>
      </aside>
      <button
        className="filter-panel-toggle"
        type="button"
        aria-controls="equipment-filter-panel"
        aria-expanded={painelExpandido}
        aria-label={painelExpandido ? 'Recolher painel de filtros' : 'Expandir painel de filtros'}
        title={painelExpandido ? 'Recolher painel de filtros' : 'Expandir painel de filtros'}
        onClick={() => setPainelExpandido((expandido) => !expandido)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={painelExpandido ? 'm14 6-6 6 6 6' : 'm10 6 6 6-6 6'} />
        </svg>
      </button>
      <div className='center-painel'>
        <TopBarMap abaAtiva={abaAtiva} onChange={setAbaAtiva} />
        {carregando && <p className="api-message" role="status">Carregando equipamentos…</p>}
        {erro && <p className="api-message api-error" role="alert">{erro}</p>}
        <div className="map-panel" hidden={abaAtiva !== 'mapa'}>
          <Map pontos={pontosMapa} rotas={rotas} ativo={abaAtiva === 'mapa'} onSelecionar={selecionarNoMapa} />
        </div>
        {abaAtiva === 'lista' && (
          <ItemList
            pontos={pontosFiltrados}
            selecionadosIds={selecionadosIds}
            detalhesId={detalhesId}
            onVisualizar={visualizarEquipamento}
            onAlternarSelecao={alternarSelecao}
            onAlternarTodos={(selecionar) => {
              const idsVisiveis = pontosFiltrados.map((ponto) => ponto.id);
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
