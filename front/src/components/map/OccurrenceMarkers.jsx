import { Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';

const icons = new Map();

function getIcon(selected, severity) {
  const key = `${severity}-${selected ? 'selected' : 'normal'}`;
  if (!icons.has(key)) {
    icons.set(key, L.divIcon({
      className: 'occurrence-div-icon',
      html: `<span class="occurrence-marker severity-${severity}${selected ? ' is-selected' : ''}" aria-hidden="true"><span>!</span></span>`,
      iconSize: [24, 28],
      iconAnchor: [12, 25],
      popupAnchor: [0, -23],
    }));
  }
  return icons.get(key);
}

const severityLabels = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  critica: 'Crítica',
};

export default function OccurrenceMarkers({ occurrences, selectedId, onSelect }) {
  return occurrences.map((occurrence) => (
    <Marker
      key={occurrence.id}
      position={[occurrence.latitude, occurrence.longitude]}
      icon={getIcon(occurrence.id === selectedId, occurrence.gravidade)}
      eventHandlers={{ click: () => onSelect(occurrence) }}
    >
      <Tooltip direction="top" offset={[0, -24]}>
        <strong>{occurrence.tipo}</strong>
        <br />
        {severityLabels[occurrence.gravidade] || occurrence.gravidade} · {new Date(occurrence.ocorrida_em).toLocaleString('pt-BR')}
      </Tooltip>
    </Marker>
  ));
}
