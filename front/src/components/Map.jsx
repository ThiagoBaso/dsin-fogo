
import { Fragment, useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Tooltip,
  Polyline,
  CircleMarker,
  GeoJSON,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { equipmentIcons, equipmentSituations } from "../equipmentCatalog";
import bairrosDemo from "../data/bairros-demo.json";
import "leaflet/dist/leaflet.css";
import "./Map.css";

const ponto_inicial = [-22.217, -49.950];

function configurarTooltipSetor(feature, layer, selecionarSetor) {
  const nome = feature?.properties?.nome || "Setor demonstrativo";
  layer.bindTooltip(`${nome} · limite aproximado`, {
    sticky: true,
    className: "neighborhood-boundary-tooltip",
  });
  layer.on("click", () => selecionarSetor(feature.properties.id));
}

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

function criarIcone(ponto, selecionado) {
  const arquivoIcone = equipmentIcons[ponto.tipo_id] || 'car';
  const situacao = equipmentSituations[ponto.situacao_id] || {
    label: 'Situação desconhecida', symbol: '?', className: 'indisponivel',
  };
  const chave = `${arquivoIcone}-${ponto.situacao_id}-${selecionado ? 'selecionado' : 'normal'}`;
  if (!marcadores.has(chave)) {
    marcadores.set(chave, L.divIcon({
      className: 'equipment-div-icon',
      html: `<span class="equipment-marker${selecionado ? ' is-selected' : ''} situation-${situacao.className}" title="${situacao.label}"><img src="/icons/${arquivoIcone}.svg" alt=""/><span class="equipment-state">${situacao.symbol}</span></span>`,
      iconSize: [42, 46],
      iconAnchor: [21, 23],
      popupAnchor: [0, -20],
    }));
  }
  return marcadores.get(chave);
}

export default function MapaMarilia({ pontos, rotas = [], ativo, onSelecionar, selecionadosIds = [], exibirContornoBairros = false }) {
  const [setorSelecionadoId, setSetorSelecionadoId] = useState(null);

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

        {exibirContornoBairros && (
          <GeoJSON
            key={`bairros-${setorSelecionadoId ?? "nenhum"}`}
            data={bairrosDemo}
            style={(feature) => {
              const selecionado = feature?.properties?.id === setorSelecionadoId;
              return {
                color: selecionado ? "#1e2b3a" : "#3c4548",
                weight: selecionado ? 3 : 1.5,
                opacity: 0.95,
                fillColor: "#fecc00",
                fillOpacity: selecionado ? 0.28 : 0.035,
              };
            }}
            onEachFeature={(feature, layer) => configurarTooltipSetor(
              feature,
              layer,
              (id) => setSetorSelecionadoId((atual) => atual === id ? null : id),
            )}
          />
        )}

        {rotas.filter((rota) => rota.posicoes.length > 1).map((rota) => {
          const caminho = rota.posicoes.map((posicao) => [posicao.latitude, posicao.longitude]);
          const inicio = caminho[0];
          const atual = caminho[caminho.length - 1];
          return (
            <Fragment key={`route-${rota.id}`}>
              <Polyline positions={caminho} pathOptions={{ color: '#3c4548', weight: 8, opacity: 0.9 }} />
              <Polyline positions={caminho} pathOptions={{ color: '#fecc00', weight: 4, opacity: 1 }}>
                <Popup>Rota simulada do equipamento {rota.id_equipamento}</Popup>
              </Polyline>
              <CircleMarker center={inicio} radius={6} pathOptions={{ color: '#3c4548', weight: 2, fillColor: '#fff', fillOpacity: 1 }}>
                <Popup>Base simulada</Popup>
              </CircleMarker>
              <CircleMarker center={atual} radius={6} pathOptions={{ color: '#3c4548', weight: 2, fillColor: '#fecc00', fillOpacity: 1 }}>
                <Popup>Última posição GPS</Popup>
              </CircleMarker>
            </Fragment>
          );
        })}

        {pontos.map((ponto) => (
          <Marker
            key={ponto.id}
            position={[ponto.latitude, ponto.longitude]}
            icon={criarIcone(ponto, selecionadosIds.includes(ponto.id))}
            eventHandlers={{
              click: () => onSelecionar(ponto),
            }}
          >
            <Tooltip direction="top" offset={[0, -18]}>
              <strong>{ponto.nome}</strong>
              <p>Situação: {equipmentSituations[ponto.situacao_id]?.label || ponto.situacao}</p>
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
  );
}
