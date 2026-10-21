import { useEffect, useMemo, useState } from 'react';
import './App.css';
import Map from './components/Map';
import TopBarMap from './components/TopBarMap';
import ItemList from './components/ItemList';
import { Aba, Ponto } from './types';
import { equipmentTypes } from './equipmentCatalog';

function App() {
  const [abaAtiva, setAbaAtiva] = useState<Aba>('mapa');
  const [pontos, setPontos] = useState<Ponto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [tipoSelecionado, setTipoSelecionado] = useState('1');
  const [tipoAplicado, setTipoAplicado] = useState('1');
  const [painelExpandido, setPainelExpandido] = useState(true);

  const pontosFiltrados = useMemo(
    () => tipoAplicado === 'todos'
      ? pontos
      : pontos.filter((ponto) => ponto.tipo_id === Number(tipoAplicado)),
    [pontos, tipoAplicado],
  );

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
            setTipoAplicado(tipoSelecionado);
          }}
        >
          <div className="equipment-filters-content">
            <h2>Filtros</h2>
            <label htmlFor="equipment-type">Tipo de equipamento</label>
            <select
              id="equipment-type"
              value={tipoSelecionado}
              onChange={(event) => setTipoSelecionado(event.target.value)}
            >
              <option value="todos">Todos</option>
              {equipmentTypes.map((tipo) => (
                <option key={tipo.id} value={tipo.id}>{tipo.label}</option>
              ))}
            </select>
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
        <div hidden={abaAtiva !== 'mapa'}>
          <Map pontos={pontosFiltrados} ativo={abaAtiva === 'mapa'} />
        </div>
        {abaAtiva === 'lista' && <ItemList pontos={pontosFiltrados} />}
      </div>
      <div className='rigth-painel'></div>
    </div>
  );
}

export default App;
