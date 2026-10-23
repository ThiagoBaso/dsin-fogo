import { MapContainer, TileLayer } from 'react-leaflet';
import MapResizeObserver from './map/MapResizeObserver';
import EquipmentMarkers from './map/EquipmentMarkers';
import NeighborhoodLayer from './map/NeighborhoodLayer';
import RoutesLayer from './map/RoutesLayer';
import 'leaflet/dist/leaflet.css';
import './Map.css';

const initialMapCenter = [-22.217, -49.950];

export default function MapaMarilia({
  pontos,
  rotas = [],
  ativo,
  onSelecionar,
  selecionadosIds = [],
  exibirContornoBairros = false,
}) {
  return (
    <MapContainer
      center={initialMapCenter}
      zoom={13}
      style={{ height: '100%', width: '100%' }}
    >
      <MapResizeObserver ativo={ativo} />
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      <NeighborhoodLayer enabled={exibirContornoBairros} />
      <RoutesLayer rotas={rotas} ativo={ativo} />
      <EquipmentMarkers
        pontos={pontos}
        selecionadosIds={selecionadosIds}
        onSelecionar={onSelecionar}
      />
    </MapContainer>
  );
}
