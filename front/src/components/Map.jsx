import { useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import MapResizeObserver from './map/MapResizeObserver';
import EquipmentMarkers from './map/EquipmentMarkers';
import AgentMarkers from './map/AgentMarkers';
import NeighborhoodLayer from './map/NeighborhoodLayer';
import RoutesLayer from './map/RoutesLayer';
import OccurrenceMarkers from './map/OccurrenceMarkers';
import CoverageHeatLayer from './map/CoverageHeatLayer';
import OccurrenceHeatLayer from './map/OccurrenceHeatLayer';
import OccurrencePredictionLayer from './map/OccurrencePredictionLayer';
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
  selectedAgentIds = [],
  onSelectAgent,
  selecionadosIds = [],
  exibirContornoBairros = false,
  censusSectorGeoJson,
  predictionAreaGeoJson,
  temaEscuro = false,
  occurrences = [],
  showOccurrences = true,
  selectedOccurrenceId,
  onSelectOccurrence,
  coverageHeatEnabled = false,
  coverageSources = [],
  occurrenceHeatEnabled = false,
  occurrenceHeatGrid,
  occurrenceHeatMode = 'quantidade',
  occurrenceHeatResolutionSummary,
  occurrencePredictionEnabled = false,
  occurrencePredictions = [],
  occurrencePredictionMetric = 'quantidade',
  selectedPredictionAreaId = /** @type {number | null} */ (null),
  onSelectPredictionArea = /** @type {(areaId: number) => void} */ (() => {}),
  occurrencePredictionGeneratedAt = '',
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
      <NeighborhoodLayer enabled={exibirContornoBairros && !occurrencePredictionEnabled} dark={temaEscuro} geoJson={censusSectorGeoJson} />
      <OccurrencePredictionLayer
        enabled={occurrencePredictionEnabled}
        areas={occurrencePredictions}
        geoJson={predictionAreaGeoJson}
        metric={occurrencePredictionMetric}
        selectedAreaId={selectedPredictionAreaId}
        onSelectArea={onSelectPredictionArea}
        dark={temaEscuro}
        generatedAt={occurrencePredictionGeneratedAt}
      />
      <RoutesLayer rotas={rotas} />
      <CoverageHeatLayer
        enabled={coverageHeatEnabled}
        sources={coverageSources}
      />
      <OccurrenceHeatLayer
        enabled={occurrenceHeatEnabled}
        grid={occurrenceHeatGrid}
        mode={occurrenceHeatMode}
        resolutionSummary={occurrenceHeatResolutionSummary}
      />
      <EquipmentMarkers
        pontos={pontos}
        selecionadosIds={selecionadosIds}
        onSelecionar={onSelecionar}
      />
      {showAgents && (
        <AgentMarkers
          agents={agents}
          selectedAgentId={selectedAgentId}
          selectedAgentIds={selectedAgentIds}
          onSelect={onSelectAgent}
        />
      )}
      {showOccurrences && (
        <OccurrenceMarkers
          occurrences={occurrences}
          selectedId={selectedOccurrenceId}
          onSelect={onSelectOccurrence}
        />
      )}
    </MapContainer>
  );
}
