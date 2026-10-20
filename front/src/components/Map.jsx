
import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

const ponto_inicial = [-22.217, -49.950];

function AjustarTamanhoMapa({ ativo }) {
  const map = useMap();

  useEffect(() => {
    if (ativo) map.invalidateSize();
  }, [ativo, map]);

  return null;
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
          <CircleMarker
            key={ponto.id}
            center={[ponto.latitude, ponto.longitude]}
            radius={9}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              fillColor:
                ponto.status === "ativo"
                  ? "#22c55e"
                  : "#ef4444",
              fillOpacity: 1,
            }}
            eventHandlers={{
              click: () => setSelecionado(ponto),
            }}
          >
            <Popup>
              <strong>{ponto.nome}</strong>
              <p>Status: {ponto.status}</p>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {selecionado && (
        <section>
          <h3>{selecionado.nome}</h3>
          <p>Status: {selecionado.status}</p>
          <p>
            Coordenadas: {selecionado.latitude},
            {" "}{selecionado.longitude}
          </p>
        </section>
      )}
    </div>
  );
}
