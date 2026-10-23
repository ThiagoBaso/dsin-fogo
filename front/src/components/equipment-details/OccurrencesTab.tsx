import type { OcorrenciaEquipamento } from '../../types';
import { Field, formatDate } from './EquipmentDetailField';
import { occurrenceSeverityLabels, occurrenceStatusLabels } from './labels';

export default function OccurrencesTab({
  ocorrencias,
  erro,
}: {
  ocorrencias: OcorrenciaEquipamento[] | null;
  erro: string;
}) {
  return (
    <div className="equipment-detail-group">
      <h3>Ocorrências vinculadas</h3>
      {erro ? (
        <p role="alert">{erro}</p>
      ) : ocorrencias === null ? (
        <p role="status">Carregando ocorrências…</p>
      ) : ocorrencias.length === 0 ? (
        <p>Nenhuma ocorrência vinculada a este equipamento.</p>
      ) : (
        <ul className="equipment-occurrence-list">
          {ocorrencias.map((ocorrencia) => (
            <li className="equipment-occurrence" key={ocorrencia.id}>
              <div className="equipment-occurrence-heading">
                <strong>{ocorrencia.tipo}</strong>
                <span className={`equipment-occurrence-severity severity-${ocorrencia.gravidade}`}>
                  {occurrenceSeverityLabels[ocorrencia.gravidade]}
                </span>
              </div>
              <dl>
                <Field label="Status" value={occurrenceStatusLabels[ocorrencia.status]} />
                <Field label="Data e hora" value={formatDate(ocorrencia.ocorrida_em)} />
                {ocorrencia.descricao && <Field label="Descrição" value={ocorrencia.descricao} />}
                <Field label="Local" value={[ocorrencia.logradouro, ocorrencia.bairro, ocorrencia.cidade, ocorrencia.uf].filter(Boolean).join(', ')} />
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
