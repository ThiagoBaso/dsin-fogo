import { Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { equipmentIcons, equipmentSituations } from '../../equipmentCatalog';

const markerIcons = new Map();

function createMarkerIcon(ponto, selecionado) {
  const arquivoIcone = equipmentIcons[ponto.tipo_id] || 'car';
  const situacao = equipmentSituations[ponto.situacao_id] || {
    label: 'Situação desconhecida', symbol: '?', className: 'indisponivel',
  };
  const chave = `${arquivoIcone}-${ponto.situacao_id}-${selecionado ? 'selecionado' : 'normal'}`;
  if (!markerIcons.has(chave)) {
    markerIcons.set(chave, L.divIcon({
      className: 'equipment-div-icon',
      html: `<span class="equipment-marker${selecionado ? ' is-selected' : ''} situation-${situacao.className}" title="${situacao.label}"><img src="/icons/${arquivoIcone}.svg" alt=""/><span class="equipment-state">${situacao.symbol}</span></span>`,
      iconSize: [42, 46],
      iconAnchor: [21, 23],
      popupAnchor: [0, -20],
    }));
  }
  return markerIcons.get(chave);
}

export default function EquipmentMarkers({ pontos, selecionadosIds, onSelecionar }) {
  return pontos.map((ponto) => (
    <Marker
      key={ponto.id}
      position={[ponto.latitude, ponto.longitude]}
      icon={createMarkerIcon(ponto, selecionadosIds.includes(ponto.id))}
      eventHandlers={{
        click: () => onSelecionar(ponto),
      }}
    >
      <Tooltip direction="top" offset={[0, -18]}>
        <strong>{ponto.nome}</strong>
        <p>Situação: {equipmentSituations[ponto.situacao_id]?.label || ponto.situacao}</p>
      </Tooltip>
    </Marker>
  ));
}
