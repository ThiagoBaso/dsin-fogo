import { Ponto } from '../types';
import { equipmentSituations } from '../equipmentCatalog';

function ItemList({ pontos, selecionadoId, onSelecionar }: { pontos: Ponto[]; selecionadoId: number | null; onSelecionar: (ponto: Ponto) => void }) {
  return (
    <section className="item-list" aria-label="Lista de itens">
      <h2>Itens</h2>
      <ul>
        {pontos.map((ponto) => (
          <li key={ponto.id} className={selecionadoId === ponto.id ? 'selected' : ''}>
            <button type="button" className="item-select" aria-pressed={selecionadoId === ponto.id} onClick={() => onSelecionar(ponto)}>
              <strong>{ponto.nome}</strong>
              <p>Situação: {equipmentSituations[ponto.situacao_id]?.label || ponto.situacao}</p>
              <p>Coordenadas: {ponto.latitude}, {ponto.longitude}</p>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default ItemList;
