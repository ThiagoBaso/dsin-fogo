
import { useEffect, useState } from "react";
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
    if (ativo) map.invalidateSize();
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

export default function MapaMarilia({ pontos, ativo }) {
  const [selecionado, setSelecionado] = useState(null);

  return (
    <div>
      <MapContainer
        center={ponto_inicial}
        zoom={13}
        style={{ height: "820px", width: "100%" }}
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
              click: () => setSelecionado(ponto),
            }}
          >
            <Popup>
              <strong>{ponto.nome}</strong>
              <p>Situação: {equipmentSituations[ponto.situacao_id]?.label || ponto.situacao}</p>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {selecionado && (
        <section>
          <h3>{selecionado.nome}</h3>
          <p>Situação: {equipmentSituations[selecionado.situacao_id]?.label || selecionado.situacao}</p>
          <p>
            Coordenadas: {selecionado.latitude},
            {" "}{selecionado.longitude}
          </p>
        </section>
      )}
    </div>
  );
}
