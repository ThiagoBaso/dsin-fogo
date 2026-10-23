import type { ManutencaoEquipamento } from '../../types';
import { Field, formatDate } from './EquipmentDetailField';
import { maintenancePriorityLabels, maintenanceStatusLabels, maintenanceTypeLabels } from './labels';

function findNextMaintenance(items: ManutencaoEquipamento[]) {
  const active = items.filter((item) => ['pendente', 'agendada', 'em_execucao'].includes(item.status));
  const withDate = active.filter((item) => item.prevista_para && !Number.isNaN(new Date(item.prevista_para).getTime()));
  const now = Date.now();
  const upcoming = withDate
    .filter((item) => new Date(item.prevista_para as string).getTime() >= now)
    .sort((a, b) => new Date(a.prevista_para as string).getTime() - new Date(b.prevista_para as string).getTime())[0];
  if (upcoming) return upcoming;
  const overdue = withDate
    .sort((a, b) => new Date(b.prevista_para as string).getTime() - new Date(a.prevista_para as string).getTime())[0];
  return overdue || active[0] || null;
}

export default function MaintenanceTab({
  manutencoes,
  erro,
  onRetry,
}: {
  manutencoes: ManutencaoEquipamento[] | null;
  erro: string;
  onRetry: () => void;
}) {
  const proximaManutencao = manutencoes ? findNextMaintenance(manutencoes) : null;

  return (
    <div className="equipment-detail-group equipment-maintenance-group">
      <div className="equipment-maintenance-next">
        <h3>Próxima manutenção</h3>
        {manutencoes === null ? (
          <p role="status">Carregando manutenções...</p>
        ) : erro ? (
          <p role="alert">Não foi possível carregar os registros.</p>
        ) : proximaManutencao ? (
          <>
            <div className="equipment-maintenance-heading">
              <strong>{maintenanceTypeLabels[proximaManutencao.modalidade]}</strong>
              <span className={`maintenance-status maintenance-status-${proximaManutencao.status}`}>
                {maintenanceStatusLabels[proximaManutencao.status]}
              </span>
            </div>
            <dl className="equipment-maintenance-meta">
              <Field label="Data prevista" value={formatDate(proximaManutencao.prevista_para)} />
              <Field label="Prioridade" value={maintenancePriorityLabels[proximaManutencao.prioridade]} />
            </dl>
            {proximaManutencao.prevista_para && new Date(proximaManutencao.prevista_para).getTime() < Date.now() && (
              <p className="maintenance-overdue">Data prevista ultrapassada</p>
            )}
          </>
        ) : manutencoes?.some((item) => ['pendente', 'agendada', 'em_execucao'].includes(item.status)) ? (
          <p>Há uma manutenção em aberto sem data prevista.</p>
        ) : (
          <p>Nenhuma manutenção futura cadastrada.</p>
        )}
      </div>
      {erro ? (
        <div role="alert" className="route-history-error">
          <p>{erro}</p>
          <button type="button" onClick={onRetry}>Tentar novamente</button>
        </div>
      ) : manutencoes === null ? null : manutencoes.length === 0 ? (
        <p>Nenhuma manutenção registrada para este equipamento.</p>
      ) : (
        <>
          <h3 className="equipment-maintenance-records-title">Registros</h3>
          <ul className="equipment-maintenance-list">
            {manutencoes.map((manutencao) => (
              <li className="equipment-maintenance-item" key={manutencao.id}>
                <div className="equipment-maintenance-heading">
                  <strong>{maintenanceTypeLabels[manutencao.modalidade]}</strong>
                  <span className={`maintenance-status maintenance-status-${manutencao.status}`}>
                    {maintenanceStatusLabels[manutencao.status]}
                  </span>
                </div>
                <span className={`maintenance-priority maintenance-priority-${manutencao.prioridade}`}>
                  Prioridade {maintenancePriorityLabels[manutencao.prioridade].toLocaleLowerCase('pt-BR')}
                </span>
                <dl className="equipment-maintenance-meta equipment-maintenance-record-meta">
                  <Field label="Abertura" value={formatDate(manutencao.aberta_em)} />
                  <Field label="Data prevista" value={formatDate(manutencao.prevista_para)} />
                  <Field label="Início" value={formatDate(manutencao.iniciada_em)} />
                  <Field label="Conclusão" value={formatDate(manutencao.concluida_em)} />
                </dl>
                {manutencao.descricao && (
                  <dl className="equipment-maintenance-description">
                    <Field label="Descrição" value={manutencao.descricao} />
                  </dl>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
