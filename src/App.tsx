import { useState } from 'react';
import './App.css';
import Map from './components/Map';
import TopBarMap from './components/TopBarMap';
import ItemList from './components/ItemList';
import { Aba, Ponto } from './types';

const pontos: Ponto[] = [
  { id: 1, nome: 'Ponto A', latitude: -22.217, longitude: -49.950, status: 'ativo' },
  { id: 2, nome: 'Ponto B', latitude: -22.224, longitude: -49.943, status: 'inativo' },
];

function App() {
  const [abaAtiva, setAbaAtiva] = useState<Aba>('mapa');

  return (
    <div className="App">
      <div className='left-painel'></div>
      <div className='center-painel'>
        <TopBarMap abaAtiva={abaAtiva} onChange={setAbaAtiva} />
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
