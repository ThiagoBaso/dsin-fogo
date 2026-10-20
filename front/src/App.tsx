import { useEffect, useState } from 'react';
import './App.css';
import Map from './components/Map';
import TopBarMap from './components/TopBarMap';
import ItemList from './components/ItemList';
import { Aba, Ponto } from './types';

function App() {
  const [abaAtiva, setAbaAtiva] = useState<Aba>('mapa');
  const [pontos, setPontos] = useState<Ponto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

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
    <div className="App">
      <div className='left-painel'></div>
      <div className='center-painel'>
        <TopBarMap abaAtiva={abaAtiva} onChange={setAbaAtiva} />
        {carregando && <p className="api-message" role="status">Carregando equipamentos…</p>}
        {erro && <p className="api-message api-error" role="alert">{erro}</p>}
        <div hidden={abaAtiva !== 'mapa'}>
          <Map pontos={pontos} ativo={abaAtiva === 'mapa'} />
        </div>
        {abaAtiva === 'lista' && <ItemList pontos={pontos} />}
      </div>
      <div className='rigth-painel'></div>
    </div>
  );
}

export default App;
