import { Ponto } from '../types';
import { equipmentSituations } from '../equipmentCatalog';

function ItemList({
  pontos,
  selecionadosIds,
  detalhesId,
  onVisualizar,
  onAlternarSelecao,
  onAlternarTodos,
}: {
  pontos: Ponto[];
  selecionadosIds: number[];
  detalhesId: number | null;
  onVisualizar: (ponto: Ponto) => void;
  onAlternarSelecao: (pontoId: number) => void;
  onAlternarTodos: (selecionar: boolean) => void;
}) {
  const todosSelecionados = pontos.length > 0 && pontos.every((ponto) => selecionadosIds.includes(ponto.id));

  return (
    <section className="item-list" aria-label="Lista de itens">
      <div className="item-list-header">
        <h2>Itens</h2>
        <button type="button" onClick={() => onAlternarTodos(!todosSelecionados)} disabled={pontos.length === 0}>
          {todosSelecionados ? 'Desmarcar tudo' : 'Selecionar tudo'}
        </button>
      </div>
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
