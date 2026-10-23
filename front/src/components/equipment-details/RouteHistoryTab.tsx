import type { RotaVeiculo } from '../../types';
import { Field, formatDate, formatDistance } from './EquipmentDetailField';
import { routeStatusLabels } from './labels';

function RoutePreview({ rota }: { rota: RotaVeiculo }) {
  const width = 320;
  const height = 108;
  const padding = 14;

  if (rota.posicoes.length < 2) {
    return <div className="route-preview-empty">Traçado indisponível</div>;
  }

  const latitudes = rota.posicoes.map((position) => position.latitude);
  const latitudeMedia = latitudes.reduce((total, latitude) => total + latitude, 0) / latitudes.length;
  const fatorLongitude = Math.cos((latitudeMedia * Math.PI) / 180);
  const coordenadas = rota.posicoes.map((position) => ({
    x: position.longitude * fatorLongitude,
    y: -position.latitude,
  }));
  const minX = Math.min(...coordenadas.map((point) => point.x));
  const maxX = Math.max(...coordenadas.map((point) => point.x));
  const minY = Math.min(...coordenadas.map((point) => point.y));
  const maxY = Math.max(...coordenadas.map((point) => point.y));
  const scale = Math.min(
    (width - padding * 2) / Math.max(maxX - minX, 0.000001),
    (height - padding * 2) / Math.max(maxY - minY, 0.000001),
  );
  const contentWidth = (maxX - minX) * scale;
  const contentHeight = (maxY - minY) * scale;
  const points = coordenadas.map((point) => ({
    x: padding + (width - padding * 2 - contentWidth) / 2 + (point.x - minX) * scale,
    y: padding + (height - padding * 2 - contentHeight) / 2 + (point.y - minY) * scale,
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const inicio = points[0];
  const fim = points[points.length - 1];

  return (
    <svg className="route-preview" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Mini mapa da rota ${rota.id}`}>
      <rect width={width} height={height} rx="8" fill="#f1f4f2" />
      <path d="M0 27H320 M0 81H320 M80 0V108 M160 0V108 M240 0V108" stroke="#e0e6e3" strokeWidth="1" />
      <polyline points={line} fill="none" stroke="#3c4548" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={line} fill="none" stroke="#fecc00" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={inicio.x} cy={inicio.y} r="5" fill="#fff" stroke="#3c4548" strokeWidth="2" />
      <circle cx={fim.x} cy={fim.y} r="5" fill="#fecc00" stroke="#3c4548" strokeWidth="2" />
    </svg>
  );
}

export default function RouteHistoryTab({
  mobilidade,
  rotas,
  erro,
  carregando,
  offset,
  temMais,
  onLoad,
}: {
  mobilidade: 'fixo' | 'movel';
  rotas: RotaVeiculo[];
  erro: string;
  carregando: boolean;
  offset: number;
  temMais: boolean;
  onLoad: (offset: number, substituir?: boolean) => void;
}) {
  return (
    <div className="equipment-detail-group route-history-group">
      <h3>Histórico de rotas</h3>
      {mobilidade !== 'movel' ? (
        <p>O histórico de rotas está disponível apenas para equipamentos móveis.</p>
      ) : (
        <>
          <p className="route-history-note">Na base de demonstração, os trajetos podem ser simulados.</p>
          {erro ? (
            <div role="alert" className="route-history-error">
              <p>{erro}</p>
              <button type="button" onClick={() => onLoad(0, true)}>Tentar novamente</button>
            </div>
          ) : rotas.length === 0 && carregando ? (
            <p role="status">Carregando histórico…</p>
          ) : rotas.length === 0 ? (
            <p>Nenhuma rota registrada para este veículo.</p>
          ) : (
            <>
              <ul className="route-history-list">
                {rotas.map((rota) => (
                  <li className="route-history-item" key={rota.id}>
                    <div className="route-history-item-heading">
                      <strong>Viagem #{rota.id}</strong>
                      <span className={`route-history-status route-status-${rota.situacao}`}>
                        {routeStatusLabels[rota.situacao]}
                      </span>
                    </div>
                    <RoutePreview rota={rota} />
                    <dl className="route-history-meta">
                      <Field label="Partida" value={formatDate(rota.inicio_em)} />
                      <Field label="Chegada" value={rota.fim_em ? formatDate(rota.fim_em) : 'Em andamento'} />
                      <Field label="Distância" value={formatDistance(rota.distancia_m)} />
                    </dl>
                  </li>
                ))}
              </ul>
              {carregando && <p role="status">Carregando mais rotas…</p>}
              {temMais && !carregando && (
                <button type="button" className="route-history-more" onClick={() => onLoad(offset)}>
                  Carregar mais rotas
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
