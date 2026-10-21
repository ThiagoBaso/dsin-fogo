import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import Map from './components/Map';
import TopBarMap from './components/TopBarMap';
import ItemList from './components/ItemList';
import EquipmentDetails from './components/EquipmentDetails';
import { Aba, Ponto } from './types';
import { equipmentSituations, equipmentTypes } from './equipmentCatalog';

const equipmentSituationOptions = Object.entries(equipmentSituations).map(([id, situation]) => ({
  id: Number(id),
  label: situation.label,
}));

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
  const [painelExpandido, setPainelExpandido] = useState(true);
  const [selecionadoId, setSelecionadoId] = useState<number | null>(null);
  const painelDetalhes = useRef<HTMLElement>(null);

  const pontosFiltrados = useMemo(
    () => pontos.filter((ponto) => (
      tiposAplicados.includes(ponto.tipo_id) && situacoesAplicadas.includes(ponto.situacao_id)
    )),
    [pontos, tiposAplicados, situacoesAplicadas],
  );
  const pontoSelecionado = pontosFiltrados.find((ponto) => ponto.id === selecionadoId) || null;

  function selecionarEquipamento(ponto: Ponto) {
    setSelecionadoId(ponto.id);
    painelDetalhes.current?.scrollTo({ top: 0 });
  }

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${process.env.REACT_APP_API_URL || ''}/api/equipamentos`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`API respondeu ${response.status}`);
        return response.json() as Promise<Ponto[]>;
      })
      .then(setPontos)
      .catch((error: Error) => {
        if (error.name !== 'AbortError') setErro('Não foi possível carregar os equipamentos da API.');
      })
      .finally(() => setCarregando(false));

    return () => controller.abort();
  }, []);

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
            if (pontoSelecionado && (
              !tiposSelecionados.includes(pontoSelecionado.tipo_id)
              || !situacoesSelecionadas.includes(pontoSelecionado.situacao_id)
            )) {
              setSelecionadoId(null);
            }
          }}
        >
          <div className="equipment-filters-content">
            <h2>Filtros</h2>
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
          <Map pontos={pontosFiltrados} ativo={abaAtiva === 'mapa'} onSelecionar={selecionarEquipamento} />
        </div>
        {abaAtiva === 'lista' && <ItemList pontos={pontosFiltrados} selecionadoId={selecionadoId} onSelecionar={selecionarEquipamento} />}
      </div>
      <aside className='rigth-painel' aria-label="Informações do equipamento" ref={painelDetalhes}>
        <EquipmentDetails ponto={pontoSelecionado} onClose={() => setSelecionadoId(null)} />
      </aside>
    </div>
  );
}

export default App;
