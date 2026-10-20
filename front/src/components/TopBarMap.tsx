import '../App.css';
import { Aba } from '../types';

interface TopBarMapProps {
    abaAtiva: Aba;
    onChange: (aba: Aba) => void;
}

function TopBarMap({ abaAtiva, onChange }: TopBarMapProps) {
    return (
        <div className='map-bar'>
            <button type="button" aria-pressed={abaAtiva === 'mapa'} onClick={() => onChange('mapa')}>Mapa</button>
            <button type="button" aria-pressed={abaAtiva === 'lista'} onClick={() => onChange('lista')}>Lista</button>
        </div>
    )
}

export default TopBarMap;
