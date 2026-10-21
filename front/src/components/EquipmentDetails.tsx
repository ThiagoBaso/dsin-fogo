import { useEffect, useState } from 'react';
import { AtributoEquipamento, DetalhesEquipamento, Ponto } from '../types';
import { equipmentSituations, equipmentTypes } from '../equipmentCatalog';

const attributeLabels: Record<string, string> = {
  limite_velocidade: 'Limite de velocidade',
  modalidade: 'Modalidade de fiscalização',
  resolucao: 'Resolução',
  visao_noturna: 'Visão noturna',
  largura_m: 'Largura',
  vagas_monitoradas: 'Vagas monitoradas',
  capacidade_ton: 'Capacidade',
  autonomia_km: 'Autonomia',
  cilindrada_cc: 'Cilindrada',
  tracao: 'Tração',
};

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="equipment-detail-field">
      <dt>{label}</dt>
      <dd>{value === null || value === undefined || value === '' ? 'Não informado' : value}</dd>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString('pt-BR');
}

function formatAttribute(attribute: AtributoEquipamento) {
  if (attribute.valor === null) return null;
  if (attribute.tipo_valor === 'booleano') return attribute.valor ? 'Sim' : 'Não';
  const value = typeof attribute.valor === 'number'
    ? attribute.valor.toLocaleString('pt-BR')
    : String(attribute.valor);
  const unit = attribute.unidade || (attribute.nome === 'cilindrada_cc' ? 'cm³' : '');
  return unit ? `${value} ${unit}` : value;
}

export default function EquipmentDetails({ ponto, onClose }: { ponto: Ponto | null; onClose: () => void }) {
  const [detalhes, setDetalhes] = useState<DetalhesEquipamento | null>(null);
  const [erro, setErro] = useState('');
  const [tentativa, setTentativa] = useState(0);
  const equipamentoId = ponto?.id;

  useEffect(() => {
    setDetalhes(null);
    setErro('');
    if (equipamentoId === undefined) return;
    const controller = new AbortController();
    fetch(`${process.env.REACT_APP_API_URL || ''}/api/equipamentos/${equipamentoId}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`API respondeu ${response.status}`);
        return response.json() as Promise<DetalhesEquipamento>;
      })
      .then((data) => {
        if (!controller.signal.aborted) setDetalhes(data);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted && error.name !== 'AbortError') setErro('Não foi possível carregar os detalhes do equipamento.');
      });
    return () => controller.abort();
  }, [equipamentoId, tentativa]);

  const atual = detalhes?.id === equipamentoId ? detalhes : null;

  return (
    <section className="equipment-details" aria-label="Detalhes do equipamento">
      <div className="equipment-details-heading">
        <h2>Detalhes do equipamento</h2>
        {ponto && <button type="button" className="equipment-details-close" aria-label="Fechar detalhes do equipamento" onClick={onClose}>×</button>}
      </div>
      {!ponto ? (
        <p className="equipment-details-hint">Selecione um equipamento no mapa ou na lista para ver os detalhes.</p>
      ) : erro ? (
        <div role="alert">
          <p>{erro}</p>
          <button type="button" onClick={() => setTentativa((value) => value + 1)}>Tentar novamente</button>
        </div>
      ) : !atual ? (
        <p role="status">Carregando detalhes…</p>
      ) : (
        <>
          <div className="equipment-detail-group">
            <h3>Identificação</h3>
            <dl>
              <Field label="Tipo" value={equipmentTypes.find((type) => type.id === atual.tipo_id)?.label || atual.tipo} />
              <Field label="Número de série" value={atual.numero_serie} />
              <Field label="Marca" value={atual.marca} />
              <Field label="Modelo" value={atual.modelo} />
            </dl>
          </div>
          <div className="equipment-detail-group">
            <h3>Responsável</h3>
            <dl>
              <Field label="Órgão" value={atual.orgao_nome} />
              <Field label="Sigla" value={atual.orgao_sigla} />
            </dl>
          </div>
          <div className="equipment-detail-group">
            <h3>Condição</h3>
            <dl>
              <Field label="Situação atual" value={equipmentSituations[atual.situacao_id]?.label || atual.situacao} />
              <Field label="Mobilidade" value={atual.mobilidade === 'fixo' ? 'Fixo' : 'Móvel'} />
            </dl>
          </div>
          <div className="equipment-detail-group">
            <h3>Local cadastrado</h3>
            <dl>
              <Field label="Logradouro" value={atual.logradouro} />
              <Field label="Referência" value={atual.referencia} />
              <Field label="Bairro" value={atual.bairro} />
              <Field label="Região" value={atual.regiao} />
              <Field label="Cidade" value={atual.cidade} />
              <Field label="UF" value={atual.uf} />
              <Field label="CEP" value={atual.cep?.replace(/^(\d{5})(\d{3})$/, '$1-$2')} />
            </dl>
          </div>
          <div className="equipment-detail-group">
            <h3>Posição exibida no mapa</h3>
            <dl>
              <Field label="Latitude" value={ponto.latitude.toFixed(7)} />
              <Field label="Longitude" value={ponto.longitude.toFixed(7)} />
            </dl>
          </div>
          {atual.mobilidade === 'movel' && (
            <div className="equipment-detail-group">
              <h3>Dados de GPS</h3>
              <dl>
                <Field label="Data e hora da posição" value={formatDate(atual.posicao_registrada_em)} />
                <Field label="Última velocidade registrada" value={atual.velocidade_kmh === null ? null : `${atual.velocidade_kmh.toLocaleString('pt-BR')} km/h`} />
              </dl>
            </div>
          )}
          <div className="equipment-detail-group">
            <h3>Datas</h3>
            <dl>
              <Field label="Cadastro" value={formatDate(atual.cadastrado_em)} />
              <Field label="Instalação" value={formatDate(atual.instalado_em)} />
            </dl>
          </div>
          <div className="equipment-detail-group">
            <h3>Atributos específicos</h3>
            {atual.atributos.length ? (
              <dl>
                {atual.atributos.map((attribute) => (
                  <Field key={attribute.id} label={attributeLabels[attribute.nome] || attribute.nome.replace(/_/g, ' ')} value={formatAttribute(attribute)} />
                ))}
              </dl>
            ) : <p>Não informado</p>}
          </div>
        </>
      )}
    </section>
  );
}
