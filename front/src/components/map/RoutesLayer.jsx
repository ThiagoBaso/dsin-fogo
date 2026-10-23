import { Fragment } from 'react';
import { CircleMarker, Polyline, Popup } from 'react-leaflet';

export default function RoutesLayer({ rotas }) {
  return rotas.filter((rota) => rota.posicoes.length > 1).map((rota) => {
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
  });
}
