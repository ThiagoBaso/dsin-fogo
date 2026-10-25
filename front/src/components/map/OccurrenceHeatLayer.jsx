import { useEffect } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { buildOccurrenceHeatGrid, occurrenceHeatPixel, unprojectCoveragePosition } from './occurrenceHeat';

function buildOccurrenceOverlay(sources, mode) {
  const grid = buildOccurrenceHeatGrid(sources);
  if (!grid) return null;

  const { width, height, countValues, severityValues, bounds } = grid;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;

  const image = context.createImageData(width, height);
  for (let index = 0; index < countValues.length; index += 1) {
    const count = countValues[index];
    if (count <= 0) continue;
    image.data.set(occurrenceHeatPixel(count, severityValues[index], mode), index * 4);
  }
  context.putImageData(image, 0, 0);

  return L.imageOverlay(canvas.toDataURL('image/png'), L.latLngBounds(
    unprojectCoveragePosition(bounds.minX, bounds.minY),
    unprojectCoveragePosition(bounds.maxX, bounds.maxY),
  ), { opacity: 0.55, interactive: false, pane: 'overlayPane' });
}

export default function OccurrenceHeatLayer({ enabled, sources, mode }) {
  const map = useMap();
  useEffect(() => {
    if (!enabled) return undefined;
    const overlay = buildOccurrenceOverlay(sources, mode);
    if (!overlay) return undefined;
    overlay.addTo(map);
    return () => map.removeLayer(overlay);
  }, [enabled, sources, mode, map]);
  return null;
}
