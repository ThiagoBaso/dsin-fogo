import { useState } from 'react';
import { GeoJSON } from 'react-leaflet';
import bairrosDemo from '../../data/bairros-demo.json';

function configureNeighborhoodTooltip(feature, layer, selectNeighborhood) {
  const nome = feature?.properties?.nome || 'Setor demonstrativo';
  layer.bindTooltip(`${nome} · limite aproximado`, {
    sticky: true,
    className: 'neighborhood-boundary-tooltip',
  });
  layer.on('click', () => selectNeighborhood(feature.properties.id));
}

export default function NeighborhoodLayer({ enabled, dark = false }) {
  const [setorSelecionadoId, setSetorSelecionadoId] = useState(null);
  if (!enabled) return null;

  return (
    <GeoJSON
      key={`bairros-${setorSelecionadoId ?? 'nenhum'}`}
      data={bairrosDemo}
      style={(feature) => {
        const selecionado = feature?.properties?.id === setorSelecionadoId;
        return {
          color: selecionado ? (dark ? '#fecc00' : '#1e2b3a') : (dark ? '#e2e8f0' : '#3c4548'),
          weight: selecionado ? 3 : (dark ? 2 : 1.5),
          opacity: dark ? 1 : 0.95,
          fillColor: '#fecc00',
          fillOpacity: selecionado ? 0.28 : 0.035,
        };
      }}
      onEachFeature={(feature, layer) => configureNeighborhoodTooltip(
        feature,
        layer,
        (id) => setSetorSelecionadoId((atual) => atual === id ? null : id),
      )}
    />
  );
}
