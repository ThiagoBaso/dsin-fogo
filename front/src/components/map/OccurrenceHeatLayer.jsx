import { useEffect } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { occurrenceHeatPixel, unprojectCoveragePosition } from './occurrenceHeat';

function buildOccurrenceOverlay(grid, mode, resolutionSummary) {
  if (!grid) return null;

  const {
    width, height, countValues, severityValues, recurrenceValues,
    resolutionValues, resolutionWeights, quantityScaleMaximum, bounds,
  } = grid;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;

  const image = context.createImageData(width, height);
  for (let index = 0; index < countValues.length; index += 1) {
    const count = countValues[index];
    const recurrenceRate = recurrenceValues?.[index] ?? 0;
    const resolutionWeight = resolutionWeights?.[index] ?? 0;
    if (mode === 'recorrencia' ? recurrenceRate <= 0
      : mode === 'tempo_resolucao' ? resolutionWeight <= 0 : count <= 0) continue;
    image.data.set(occurrenceHeatPixel(
      count,
      severityValues[index],
      mode,
      recurrenceRate,
      resolutionValues?.[index] ?? 0,
      resolutionSummary?.maximumHours ?? 1,
      quantityScaleMaximum,
    ), index * 4);
  }
  context.putImageData(image, 0, 0);

  return L.imageOverlay(canvas.toDataURL('image/png'), L.latLngBounds(
    unprojectCoveragePosition(bounds.minX, bounds.minY),
    unprojectCoveragePosition(bounds.maxX, bounds.maxY),
  ), { opacity: 0.55, interactive: false, pane: 'overlayPane' });
}

export default function OccurrenceHeatLayer({ enabled, grid, mode, resolutionSummary }) {
  const map = useMap();
  useEffect(() => {
    if (!enabled) return undefined;
    const overlay = buildOccurrenceOverlay(grid, mode, resolutionSummary);
    if (!overlay) return undefined;
    overlay.addTo(map);
    return () => map.removeLayer(overlay);
  }, [enabled, grid, mode, resolutionSummary, map]);
  return null;
}
