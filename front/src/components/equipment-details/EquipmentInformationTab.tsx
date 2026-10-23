import type { DetalhesEquipamento, Ponto } from '../../types';
import { equipmentSituations, equipmentTypes } from '../../equipmentCatalog';
import { Field, formatAttribute, formatDate } from './EquipmentDetailField';
import { attributeLabels } from './labels';

type InformationTab = 'identificacao' | 'posicao' | 'atributos';

export default function EquipmentInformationTab({
  tab,
  ponto,
  detalhes,
  dataHora,
}: {
  tab: InformationTab;
  ponto: Ponto;
  detalhes: DetalhesEquipamento;
  dataHora: string | null;
}) {
  if (tab === 'identificacao') {
    return (
      <>
        <div className="equipment-detail-group">
          <h3>Identificação</h3>
          <dl>
            <Field label="Tipo" value={equipmentTypes.find((type) => type.id === detalhes.tipo_id)?.label || detalhes.tipo} />
            <Field label="Número de série" value={detalhes.numero_serie} />
            <Field label="Marca" value={detalhes.marca} />
            <Field label="Modelo" value={detalhes.modelo} />
          </dl>
        </div>
        <div className="equipment-detail-group">
          <h3>Responsável</h3>
          <dl>
            <Field label="Órgão" value={detalhes.orgao_nome} />
            <Field label="Sigla" value={detalhes.orgao_sigla} />
          </dl>
        </div>
        <div className="equipment-detail-group">
          <h3>Condição</h3>
          <dl>
            <Field label={dataHora ? 'Situação no período' : 'Situação atual'} value={equipmentSituations[detalhes.situacao_id]?.label || detalhes.situacao} />
            <Field label="Mobilidade" value={detalhes.mobilidade === 'fixo' ? 'Fixo' : 'Móvel'} />
          </dl>
        </div>
        <div className="equipment-detail-group">
          <h3>Datas</h3>
          <dl>
            <Field label="Cadastro" value={formatDate(detalhes.cadastrado_em)} />
            <Field label="Instalação" value={formatDate(detalhes.instalado_em)} />
          </dl>
        </div>
      </>
    );
  }

  if (tab === 'posicao') {
    return (
      <>
        <div className="equipment-detail-group">
          <h3>Local cadastrado</h3>
          <dl>
            <Field label="Logradouro" value={detalhes.logradouro} />
            <Field label="Referência" value={detalhes.referencia} />
            <Field label="Bairro" value={detalhes.bairro} />
            <Field label="Região" value={detalhes.regiao} />
            <Field label="Cidade" value={detalhes.cidade} />
            <Field label="UF" value={detalhes.uf} />
            <Field label="CEP" value={detalhes.cep?.replace(/^(\d{5})(\d{3})$/, '$1-$2')} />
          </dl>
        </div>
        <div className="equipment-detail-group">
          <h3>Posição exibida no mapa</h3>
          <dl>
            <Field label="Latitude" value={ponto.latitude.toFixed(7)} />
            <Field label="Longitude" value={ponto.longitude.toFixed(7)} />
          </dl>
        </div>
        {detalhes.mobilidade === 'movel' && (
          <div className="equipment-detail-group">
            <h3>Dados de GPS</h3>
            <dl>
              <Field label="Data e hora da posição" value={formatDate(detalhes.posicao_registrada_em)} />
              <Field label="Última velocidade registrada" value={detalhes.velocidade_kmh === null ? null : `${detalhes.velocidade_kmh.toLocaleString('pt-BR')} km/h`} />
            </dl>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="equipment-detail-group">
      <h3>Atributos específicos</h3>
      {detalhes.atributos.length ? (
        <dl>
          {detalhes.atributos.map((attribute) => (
            <Field key={attribute.id} label={attributeLabels[attribute.nome] || attribute.nome.replace(/_/g, ' ')} value={formatAttribute(attribute)} />
          ))}
        </dl>
      ) : <p>Não informado</p>}
    </div>
  );
}
