import { Aba } from '../types';

interface TopBarMapProps {
    abaAtiva: Aba;
    onChange: (aba: Aba) => void;
}

function TopBarMap({ abaAtiva, onChange }: TopBarMapProps) {
    return (
        <div className="map-bar">
            <div className="map-bar-switch" role="group" aria-label="Modo de visualização">
                <button type="button" aria-label="Mapa" aria-pressed={abaAtiva === 'mapa'} onClick={() => onChange('mapa')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
                        <path d="M9 3v15m6-12v15" />
                    </svg>
                    <span>Mapa</span>
                </button>
                <button type="button" aria-label="Lista" aria-pressed={abaAtiva === 'lista'} onClick={() => onChange('lista')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M8 6h13M8 12h13M8 18h13" />
                        <path d="M3 6h.01M3 12h.01M3 18h.01" strokeWidth="3" />
                    </svg>
                    <span>Lista</span>
                </button>
                <button type="button" aria-label="Lista de agentes" aria-pressed={abaAtiva === 'agentes'} onClick={() => onChange('agentes')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="9" cy="8" r="3" />
                        <path d="M3.5 19v-1a5.5 5.5 0 0 1 11 0v1M16 5.5a3 3 0 0 1 0 5.8M17 14a4.5 4.5 0 0 1 3.5 4.4" />
                    </svg>
                    <span>Agentes</span>
                </button>
            </div>
        </div>
    )
}

export default TopBarMap;
