import { Ponto } from '../types';
import { equipmentSituations } from '../equipmentCatalog';

function ItemList({ pontos }: { pontos: Ponto[] }) {
  return (
    <section className="item-list" aria-label="Lista de itens">
      <h2>Itens</h2>
      <ul>
        {pontos.map((ponto) => (
          <li key={ponto.id}>
            <strong>{ponto.nome}</strong>
            <p>Situação: {equipmentSituations[ponto.situacao_id]?.label || ponto.situacao}</p>
            <p>Coordenadas: {ponto.latitude}, {ponto.longitude}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default ItemList;
