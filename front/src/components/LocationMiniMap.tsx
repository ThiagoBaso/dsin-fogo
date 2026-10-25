import { useEffect, useState, type ComponentType, type CSSProperties, type ReactNode } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import EquipmentMarkers from './map/EquipmentMarkers';
import AgentMarkers from './map/AgentMarkers';

interface MiniMapContainerProps {
  center: [number, number];
  zoom: number;
  zoomControl: boolean;
  scrollWheelZoom: boolean;
  doubleClickZoom: boolean;
  dragging: boolean;
  touchZoom: boolean;
  boxZoom: boolean;
  keyboard: boolean;
  style: CSSProperties;
  children?: ReactNode;
}

const MiniMapContainer = MapContainer as unknown as ComponentType<MiniMapContainerProps>;
const MiniMapTileLayer = TileLayer as unknown as ComponentType<{ url: string; attribution?: string }>;
const MiniMapAgentMarkers = AgentMarkers as unknown as ComponentType<Record<string, unknown>>;

function MiniMapViewport({ position, dark }: { position: [number, number]; dark: boolean }) {
  const map = useMap();
  const latitude = position[0];
  const longitude = position[1];

  useEffect(() => {
    map.setView([latitude, longitude], 16, { animate: false });
  }, [latitude, longitude, map]);

  useEffect(() => {
    const tilePane = map.getPane('tilePane');
    tilePane?.classList.toggle('map-theme-dark', dark);
  }, [dark, map]);

  return null;
}

export default function LocationMiniMap({
  position,
  dark,
  children,
}: {
  position: [number, number] | null;
  dark: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <section className="location-mini-map">
      <button
        type="button"
        className="location-mini-map-toggle"
        aria-expanded={expanded}
        aria-controls="location-mini-map-panel"
        onClick={() => setExpanded((current) => !current)}
      >
        <span>{"Mapa da posi\u00e7\u00e3o"}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div id="location-mini-map-panel" className="location-mini-map-panel" hidden={!expanded}>
        {expanded && (position ? (
          <div className="location-mini-map-canvas">
            <MiniMapContainer
              center={position}
              zoom={16}
              zoomControl={false}
              scrollWheelZoom={false}
              doubleClickZoom={false}
              dragging={false}
              touchZoom={false}
              boxZoom={false}
              keyboard={false}
              style={{ height: '100%', width: '100%' }}
            >
              <MiniMapViewport position={position} dark={dark} />
              <MiniMapTileLayer
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap contributors"
              />
              {children}
            </MiniMapContainer>
          </div>
        ) : (
          <p className="location-mini-map-unavailable">
            {"N\u00e3o h\u00e1 coordenadas dispon\u00edveis para exibir o mapa."}
          </p>
        ))}
      </div>
    </section>
  );
}

export function EquipmentLocationMiniMap({
  ponto,
  dark,
}: {
  ponto: import('../types').Ponto;
  dark: boolean;
}) {
  return (
    <LocationMiniMap position={[ponto.latitude, ponto.longitude]} dark={dark}>
      <EquipmentMarkers pontos={[ponto]} selecionadosIds={[ponto.id]} onSelecionar={() => undefined} />
    </LocationMiniMap>
  );
}

export function AgentLocationMiniMap({
  agente,
  dark,
}: {
  agente: import('../types').Agente;
  dark: boolean;
}) {
  const position = agente.latitude === null || agente.longitude === null
    ? null
    : [agente.latitude, agente.longitude] as [number, number];

  return (
    <LocationMiniMap position={position} dark={dark}>
      <MiniMapAgentMarkers
        agents={[agente]}
        selectedAgentId={agente.id}
        selectedAgentIds={[agente.id]}
        onSelect={() => undefined}
      />
    </LocationMiniMap>
  );
}
