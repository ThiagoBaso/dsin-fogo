import { Ponto } from '../types';
import { equipmentSituations } from '../equipmentCatalog';

function ItemList({
  pontos,
  selecionadosIds,
  detalhesId,
  onVisualizar,
  onAlternarSelecao,
  onAlternarTodos,
  visible,
}: {
  pontos: Ponto[];
  selecionadosIds: number[];
  detalhesId: number | null;
  onVisualizar: (ponto: Ponto) => void;
  onAlternarSelecao: (pontoId: number) => void;
  onAlternarTodos: (selecionar: boolean, idsVisiveis: number[]) => void;
  visible: boolean;
}) {
  const pontosVisiveis = pontos;
  const todosSelecionados = pontosVisiveis.length > 0
    && pontosVisiveis.every((ponto) => selecionadosIds.includes(ponto.id));
  const quantidadeSelecionada = pontosVisiveis.filter((ponto) => selecionadosIds.includes(ponto.id)).length;
  const itensSelecionados = quantidadeSelecionada === 1 ? '1 item selecionado' : `${quantidadeSelecionada} itens selecionados`;
  const itensExibidos = pontosVisiveis.length === 1 ? '1 item exibido' : `${pontosVisiveis.length} itens exibidos`;
  const rotuloContagem = `${itensSelecionados} de ${itensExibidos}`;

  return (
    <section className="item-list equipment-list" aria-label="Lista de itens" hidden={!visible}>
      <div className="item-list-header">
        <div className="item-list-title">
          <h2>Itens</h2>
          <span className="item-list-selection-count" aria-label={rotuloContagem} title={rotuloContagem} aria-live="polite">
            <strong>{quantidadeSelecionada}</strong>
            <span aria-hidden="true">/</span>
            <span>{pontosVisiveis.length}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => onAlternarTodos(!todosSelecionados, pontosVisiveis.map((ponto) => ponto.id))}
          disabled={pontosVisiveis.length === 0}
        >
          {todosSelecionados ? 'Desmarcar tudo' : 'Selecionar tudo'}
        </button>
      </div>
      <div className="item-list-columns" aria-hidden="true">
        <span />
        <span>Número de série</span>
        <span>Responsável</span>
        <span>Localização</span>
        <span>Condição</span>
      </div>
      <ul>
        {pontosVisiveis.map((ponto) => {
          const selecionado = selecionadosIds.includes(ponto.id);
          const emVisualizacao = detalhesId === ponto.id;
          const serial = typeof ponto.numero_serie === 'string' ? ponto.numero_serie.trim() : '';
          const nomePrefixo = `${ponto.tipo} `;
          const serialLegado = ponto.nome.toLocaleLowerCase('pt-BR').startsWith(nomePrefixo.toLocaleLowerCase('pt-BR'))
            ? ponto.nome.slice(nomePrefixo.length).trim()
            : '';
          const enderecoPrincipal = ponto.logradouro?.trim()
            || ponto.bairro?.trim()
            || [ponto.cidade, ponto.uf].filter(Boolean).join(' / ')
            || 'Endereço não informado';
          const enderecoSecundario = [
            ponto.logradouro ? ponto.bairro : null,
            ponto.logradouro && !ponto.bairro ? [ponto.cidade, ponto.uf].filter(Boolean).join(' / ') : null,
          ].filter(Boolean).join(' · ');
          const responsavel = ponto.orgao_sigla?.trim() || ponto.orgao_nome?.trim() || 'Órgão não informado';
          const modelo = typeof ponto.modelo === 'string' && ponto.modelo.trim()
            ? ponto.modelo.trim()
            : 'Modelo não informado';
          const situacaoInfo = equipmentSituations[ponto.situacao_id];
          const situacao = situacaoInfo?.label || ponto.situacao;
          const classeSituacao = situacaoInfo?.className || 'desconhecida';
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
                  <span className="item-column item-equipment">
                    <strong className="item-primary-text">{serial || serialLegado || 'Série não informada'}</strong>
                    <span className="item-secondary-text">{ponto.tipo}</span>
                  </span>
                  <span className="item-column item-responsible">
                    <strong className="item-primary-text">{responsavel}</strong>
                    <span className="item-secondary-text">{modelo}</span>
                  </span>
                  <span className="item-column item-location">
                    <strong className="item-primary-text">{enderecoPrincipal}</strong>
                    {enderecoSecundario && <span className="item-secondary-text">{enderecoSecundario}</span>}
                  </span>
                  <span className="item-column item-condition">
                    <span className={`item-situation situation-${classeSituacao}`}>{situacao}</span>
                  </span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {pontosVisiveis.length === 0 && <p className="item-list-empty">Nenhum equipamento encontrado.</p>}
    </section>
  );
}

export default ItemList;
