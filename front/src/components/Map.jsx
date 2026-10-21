
import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { equipmentIcons, equipmentSituations } from "../equipmentCatalog";
import "leaflet/dist/leaflet.css";
import "./Map.css";

const ponto_inicial = [-22.217, -49.950];

function AjustarTamanhoMapa({ ativo }) {
  const map = useMap();

  useEffect(() => {
    if (!ativo) return;

    map.invalidateSize();
    const observer = new ResizeObserver(() => map.invalidateSize({ debounceMoveend: true }));
    observer.observe(map.getContainer());

    return () => observer.disconnect();
  }, [ativo, map]);

  return null;
}

const marcadores = new Map();

function criarIcone(ponto) {
  const arquivoIcone = equipmentIcons[ponto.tipo_id] || 'car';
  const situacao = equipmentSituations[ponto.situacao_id] || {
    label: 'Situação desconhecida', symbol: '?', className: 'indisponivel',
  };
  const chave = `${arquivoIcone}-${ponto.situacao_id}`;
  if (!marcadores.has(chave)) {
    marcadores.set(chave, L.divIcon({
      className: 'equipment-div-icon',
      html: `<span class="equipment-marker situation-${situacao.className}" title="${situacao.label}"><img src="/icons/${arquivoIcone}.svg" alt=""/><span class="equipment-state">${situacao.symbol}</span></span>`,
      iconSize: [42, 46],
      iconAnchor: [21, 23],
      popupAnchor: [0, -20],
    }));
  }
  return marcadores.get(chave);
}

export default function MapaMarilia({ pontos, ativo, onSelecionar }) {
  return (
      <MapContainer
        center={ponto_inicial}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
      >
        <AjustarTamanhoMapa ativo={ativo} />
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap contributors'
        />

        {pontos.map((ponto) => (
          <Marker
            key={ponto.id}
            position={[ponto.latitude, ponto.longitude]}
            icon={criarIcone(ponto)}
            eventHandlers={{
              click: () => onSelecionar(ponto),
            }}
          >
            <Popup>
              <strong>{ponto.nome}</strong>
              <p>Situação: {equipmentSituations[ponto.situacao_id]?.label || ponto.situacao}</p>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
  );
}
