import { useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import MapResizeObserver from './map/MapResizeObserver';
import EquipmentMarkers from './map/EquipmentMarkers';
import AgentMarkers from './map/AgentMarkers';
import NeighborhoodLayer from './map/NeighborhoodLayer';
import RoutesLayer from './map/RoutesLayer';
import 'leaflet/dist/leaflet.css';
import './Map.css';

const initialMapCenter = [-22.217, -49.950];

function MapTheme({ dark }) {
  const map = useMap();

  useEffect(() => {
    const tilePane = map.getPane('tilePane');
    tilePane?.classList.toggle('map-theme-dark', dark);
  }, [dark, map]);

  return null;
}

export default function MapaMarilia({
  pontos,
  rotas = [],
  ativo,
  onSelecionar,
  agents = [],
  showAgents = false,
  selectedAgentId = 0,
  onSelectAgent,
  selecionadosIds = [],
  exibirContornoBairros = false,
  temaEscuro = false,
}) {
  return (
    <MapContainer
      center={initialMapCenter}
      zoom={13}
      style={{ height: '100%', width: '100%' }}
    >
      <MapTheme dark={temaEscuro} />
      <MapResizeObserver ativo={ativo} />
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      <NeighborhoodLayer enabled={exibirContornoBairros} />
      <RoutesLayer rotas={rotas} />
      <EquipmentMarkers
        pontos={pontos}
        selecionadosIds={selecionadosIds}
        onSelecionar={onSelecionar}
      />
      {showAgents && (
        <AgentMarkers agents={agents} selectedAgentId={selectedAgentId} onSelect={onSelectAgent} />
      )}
    </MapContainer>
  );
}
