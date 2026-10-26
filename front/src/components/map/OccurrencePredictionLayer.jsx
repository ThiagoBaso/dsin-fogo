import { GeoJSON } from 'react-leaflet';

const colorStops = [
  [0, [37, 99, 235]],
  [0.25, [34, 197, 94]],
  [0.5, [234, 179, 8]],
  [0.75, [249, 115, 22]],
  [1, [220, 38, 38]],
];

function mixColor(value, maximum) {
  const intensity = Math.max(0, Math.min(1, maximum > 0 ? value / maximum : 0));
  const upperIndex = Math.max(1, colorStops.findIndex(([stop]) => stop >= intensity));
  const lower = colorStops[upperIndex - 1];
  const upper = colorStops[upperIndex];
  const ratio = (intensity - lower[0]) / (upper[0] - lower[0]);
  const rgb = lower[1].map((channel, index) => Math.round(channel + (upper[1][index] - channel) * ratio));
  return `rgb(${rgb.join(', ')})`;
}

function percentile90(values, minimum) {
  if (!values.length) return minimum;
  const ordered = [...values].sort((left, right) => left - right);
  return Math.max(minimum, ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * 0.9) - 1)]);
}

function formatCount(value) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

function formatProbability(value) {
  return `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function tooltipFor(feature, forecast) {
  const areaId = Number(feature?.properties?.id);
  const area = forecast.get(areaId);
  const name = feature?.properties?.nome || 'Área agrupada';
  const sectorCount = Number(feature?.properties?.quantidade_setores || area?.quantidade_setores || 0);
  if (!area) return `${name} · sem estimativa disponível`;
  return `${name} (${sectorCount} setores): ${formatCount(area.quantidade_esperada)} ocorrências esperadas nas próximas 24 h; ${formatProbability(area.probabilidade_grave_24h)} de chance de ocorrência grave`;
}

export default function OccurrencePredictionLayer({
  enabled,
  areas = [],
  geoJson,
  metric = 'quantidade',
  selectedAreaId = /** @type {number | null} */ (null),
  onSelectArea = /** @type {(areaId: number) => void} */ (() => {}),
  dark = false,
  generatedAt = '',
}) {
  if (!enabled || areas.length === 0 || !geoJson) return null;

  const areaById = new Map(areas.map((area) => [Number(area.id), area]));
  const quantityMaximum = percentile90(areas.map((area) => area.quantidade_esperada), 0.1);
  const probabilityMaximum = percentile90(areas.map((area) => area.probabilidade_grave_24h), 0.01);
  const metricMaximum = metric === 'probabilidade' ? probabilityMaximum : quantityMaximum;

  const styleFor = (feature) => {
    const area = areaById.get(Number(feature?.properties?.id));
    if (!area) {
      return {
        color: dark ? '#cbd5e1' : '#64748b',
        weight: 0.55,
        opacity: 0.55,
        fillColor: dark ? '#475569' : '#e2e8f0',
        fillOpacity: 0.06,
      };
    }

    const selected = Number(selectedAreaId) === Number(area.id);
    const value = metric === 'probabilidade' ? area.probabilidade_grave_24h : area.quantidade_esperada;
    return {
      color: selected ? '#FECC00' : dark ? '#e2e8f0' : '#475569',
      weight: selected ? 2.4 : 0.55,
      opacity: selected ? 1 : 0.64,
      fillColor: mixColor(value, metricMaximum),
      fillOpacity: selected ? 0.48 : 0.34,
    };
  };

  return (
    <GeoJSON
      key={`prediction-ibge-2022-${generatedAt}-${metric}`}
      data={geoJson}
      style={styleFor}
      onEachFeature={(feature, layer) => {
        layer.bindTooltip(tooltipFor(feature, areaById), {
          sticky: true,
          className: 'prediction-map-tooltip',
        });
        const area = areaById.get(Number(feature?.properties?.id));
        if (area) {
          layer.on('click', () => onSelectArea(Number(area.id)));
          layer.on('mouseover', () => layer.setStyle({ weight: 1.3, opacity: 1, fillOpacity: 0.44 }));
          layer.on('mouseout', () => layer.setStyle(styleFor(feature)));
        }
      }}
    />
  );
}
