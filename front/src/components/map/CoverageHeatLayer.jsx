import { useEffect } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { buildCoverageGrid, coveragePixel, unprojectCoveragePosition } from './coverage';

function buildCoverageOverlay(sources) {
  const grid = buildCoverageGrid(sources);
  if (!grid) return null;
  const { width, height, values, bounds } = grid;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const image = context.createImageData(width, height);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value <= 0) continue;
    const offset = index * 4;
    image.data.set(coveragePixel(value), offset);
  }
  context.putImageData(image, 0, 0);
  return L.imageOverlay(canvas.toDataURL('image/png'), L.latLngBounds(
    unprojectCoveragePosition(bounds.minX, bounds.minY),
    unprojectCoveragePosition(bounds.maxX, bounds.maxY),
  ), { opacity: 0.55, interactive: false, pane: 'overlayPane' });
}

export default function CoverageHeatLayer({ enabled, sources }) {
  const map = useMap();
  useEffect(() => {
    if (!enabled) return undefined;
    const overlay = buildCoverageOverlay(sources);
    if (!overlay) return undefined;
    overlay.addTo(map);
    return () => map.removeLayer(overlay);
  }, [enabled, sources, map]);
  return null;
}
