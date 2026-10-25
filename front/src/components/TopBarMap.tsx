import { Aba } from '../types';

interface TopBarMapProps {
    abaAtiva: Aba;
    onChange: (aba: Aba) => void;
    busca: string;
    onBuscaChange: (busca: string) => void;
    tema: 'light' | 'dark';
    onToggleTema: () => void;
}

function TopBarMap({ abaAtiva, onChange, busca, onBuscaChange, tema, onToggleTema }: TopBarMapProps) {
    const isMapa = abaAtiva === 'mapa';
    const isLista = abaAtiva === 'lista';
    const searchLabel = isMapa
        ? 'Buscar equipamento no mapa pelo número de série'
        : isLista
            ? 'Buscar equipamento pelo nome'
            : 'Buscar agente por nome, matrícula ou cargo';
    const searchPlaceholder = isMapa
        ? 'Buscar número de série'
        : isLista
            ? 'Buscar equipamento'
            : 'Buscar agente';

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
            <label className="map-bar-search">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m16 16 4 4" />
                </svg>
                <input
                    type="search"
                    aria-label={searchLabel}
                    placeholder={searchPlaceholder}
                    value={busca}
                    onChange={(event) => onBuscaChange(event.target.value)}
                />
            </label>
            <button
                type="button"
                className="theme-toggle"
                aria-label={`Mudar para o tema ${tema === 'dark' ? 'claro' : 'escuro'}`}
                aria-pressed={tema === 'dark'}
                title={`Mudar para o tema ${tema === 'dark' ? 'claro' : 'escuro'}`}
                onClick={onToggleTema}
            >
                {tema === 'dark' ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="4" />
                        <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
                    </svg>
                ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20.9 13A8.5 8.5 0 0 1 11 3.1 8.5 8.5 0 1 0 20.9 13Z" />
                    </svg>
                )}
                <span>{tema === 'dark' ? 'Claro' : 'Escuro'}</span>
            </button>
        </div>
    )
}

export default TopBarMap;
