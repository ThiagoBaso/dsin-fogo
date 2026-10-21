import { Ponto } from '../types';
import { equipmentSituations } from '../equipmentCatalog';

function ItemList({
  pontos,
  selecionadosIds,
  detalhesId,
  onVisualizar,
  onAlternarSelecao,
}: {
  pontos: Ponto[];
  selecionadosIds: number[];
  detalhesId: number | null;
  onVisualizar: (ponto: Ponto) => void;
  onAlternarSelecao: (pontoId: number) => void;
}) {
  return (
    <section className="item-list" aria-label="Lista de itens">
      <h2>Itens</h2>
      <ul>
        {pontos.map((ponto) => {
          const selecionado = selecionadosIds.includes(ponto.id);
          const emVisualizacao = detalhesId === ponto.id;
          const classes = [selecionado ? 'selected' : '', emVisualizacao ? 'viewing' : '']
            .filter(Boolean)
            .join(' ');

          return (
            <li key={ponto.id} className={classes}>
              <div className="item-row">
                <label className="item-selection-control">
                  <input
                    type="checkbox"
                    aria-label={`Selecionar ${ponto.nome}`}
                    checked={selecionado}
                    onChange={() => onAlternarSelecao(ponto.id)}
                  />
                </label>
                <button
                  type="button"
                  className="item-select"
                  aria-current={emVisualizacao ? 'true' : undefined}
                  onClick={() => onVisualizar(ponto)}
                >
                  <strong>{ponto.nome}</strong>
                  <p>Situação: {equipmentSituations[ponto.situacao_id]?.label || ponto.situacao}</p>
                  <p>Coordenadas: {ponto.latitude}, {ponto.longitude}</p>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default ItemList;
