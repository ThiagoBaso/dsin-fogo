import type { OcorrenciaMapa } from '../types';
import { Field, formatDate } from './equipment-details/EquipmentDetailField';

const severityLabels: Record<OcorrenciaMapa['gravidade'], string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  critica: 'Crítica',
};

const statusLabels: Record<OcorrenciaMapa['status'], string> = {
  aberta: 'Aberta',
  em_atendimento: 'Em atendimento',
  resolvida: 'Resolvida',
  cancelada: 'Cancelada',
};

export default function OccurrenceDetails({
  occurrence,
  loading,
  error,
  onClose,
}: {
  occurrence: OcorrenciaMapa | null;
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  return (
    <section className="equipment-details" aria-label="Detalhes da ocorrência">
      <div className="equipment-details-heading">
        <h2>Detalhes da ocorrência</h2>
        {occurrence && (
          <button type="button" className="equipment-details-close" aria-label="Fechar detalhes da ocorrência" onClick={onClose}>
            ×
          </button>
        )}
      </div>
      {loading && <p className="equipment-details-hint" role="status">Carregando ocorrências…</p>}
      {error && <p className="api-message api-error" role="alert">{error}</p>}
      {!loading && !error && !occurrence && (
        <p className="equipment-details-hint">Selecione uma ocorrência no mapa para ver os detalhes.</p>
      )}
      {occurrence && (
        <>
          <div className="equipment-detail-group">
            <h3>Ocorrência</h3>
            <dl>
              <Field label="Tipo" value={occurrence.tipo} />
              <Field label="Gravidade" value={severityLabels[occurrence.gravidade]} />
              <Field label="Status" value={statusLabels[occurrence.status]} />
              <Field label="Data e hora" value={formatDate(occurrence.ocorrida_em)} />
              {occurrence.resolvida_em && (
                <Field label="Resolvida em" value={formatDate(occurrence.resolvida_em)} />
              )}
            </dl>
          </div>
          <div className="equipment-detail-group">
            <h3>Local e vínculo</h3>
            <dl>
              <Field label="Órgão" value={occurrence.orgao_nome} />
              <Field label="Equipamento vinculado" value={occurrence.equipamento_nome} />
              <Field label="Local" value={[occurrence.logradouro, occurrence.bairro, occurrence.cidade, occurrence.uf].filter(Boolean).join(', ')} />
              <Field label="Descrição" value={occurrence.descricao} />
            </dl>
          </div>
        </>
      )}
    </section>
  );
}
