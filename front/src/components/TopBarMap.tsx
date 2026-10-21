import { Aba } from '../types';

interface TopBarMapProps {
    abaAtiva: Aba;
    onChange: (aba: Aba) => void;
}

function TopBarMap({ abaAtiva, onChange }: TopBarMapProps) {
    return (
        <div className="map-bar">
            <div className="map-bar-switch" role="group" aria-label="Modo de visualização dos equipamentos">
                <button type="button" aria-pressed={abaAtiva === 'mapa'} onClick={() => onChange('mapa')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
                        <path d="M9 3v15m6-12v15" />
                    </svg>
                    <span>Mapa</span>
                </button>
                <button type="button" aria-pressed={abaAtiva === 'lista'} onClick={() => onChange('lista')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M8 6h13M8 12h13M8 18h13" />
                        <path d="M3 6h.01M3 12h.01M3 18h.01" strokeWidth="3" />
                    </svg>
                    <span>Lista</span>
                </button>
            </div>
        </div>
    )
}

export default TopBarMap;
