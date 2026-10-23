import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

export default function MapResizeObserver({ ativo }) {
  const map = useMap();

  useEffect(() => {
    if (!ativo) return undefined;

    map.invalidateSize();
    const observer = new ResizeObserver(() => map.invalidateSize({ debounceMoveend: true }));
    observer.observe(map.getContainer());

    return () => observer.disconnect();
  }, [ativo, map]);

  return null;
}
