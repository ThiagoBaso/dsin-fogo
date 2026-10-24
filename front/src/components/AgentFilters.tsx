import type { AgentFilterState, AgentRegistrationStatus, AgentShiftStatus } from '../types';

type FilterOption<T extends string | number> = { id: T; label: string };

type Props = {
  value: AgentFilterState;
  organizations: FilterOption<number>[];
  roles: string[];
  onChange: (value: AgentFilterState) => void;
};

const registrationOptions: FilterOption<AgentRegistrationStatus>[] = [
  { id: 'ativo', label: 'Ativo' },
  { id: 'inativo', label: 'Inativo' },
];

const shiftOptions: FilterOption<AgentShiftStatus>[] = [
  { id: 'em_atividade', label: 'Em atividade' },
  { id: 'programado', label: 'Programado' },
  { id: 'sem_turno', label: 'Sem turno atual' },
];

function CheckboxGroup<T extends string | number>({
  title,
  options,
  selected,
  onChange,
}: {
  title: string;
  options: FilterOption<T>[];
  selected: T[] | null;
  onChange: (value: T[] | null) => void;
}) {
  if (options.length === 0) return null;

  const allSelected = selected === null || selected.length === options.length;
  const currentSelection = selected ?? options.map((option) => option.id);

  function toggleAll(checked: boolean) {
    onChange(checked ? null : []);
  }

  function toggleOption(id: T, checked: boolean) {
    const next = checked
      ? [...currentSelection, id]
      : currentSelection.filter((item) => item !== id);
    onChange(next.length === options.length ? null : next);
  }

  return (
    <details className="equipment-filter-accordion equipment-agent-filter-group">
      <summary>{title}</summary>
      <div className="equipment-filter-options" role="group" aria-label={title}>
        <label className="equipment-filter-option">
          <input type="checkbox" checked={allSelected} onChange={(event) => toggleAll(event.target.checked)} />
          <span>Todos</span>
        </label>
        {options.map((option) => (
          <label className="equipment-filter-option" key={String(option.id)}>
            <input
              type="checkbox"
              checked={selected === null || selected.includes(option.id)}
              onChange={(event) => toggleOption(option.id, event.target.checked)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

export default function AgentFilters({ value, organizations, roles, onChange }: Props) {
  return (
    <details className="equipment-filter-accordion equipment-agent-filters">
      <summary>Agentes</summary>
      <div className="equipment-agent-filter-content">
        <label className="equipment-display-option">
          <input
            type="checkbox"
            checked={value.showOnMap}
            onChange={(event) => onChange({ ...value, showOnMap: event.target.checked })}
          />
          <span>Exibir agentes no mapa</span>
        </label>
        <CheckboxGroup
          title="Órgão"
          options={organizations}
          selected={value.organizationIds}
          onChange={(organizationIds) => onChange({ ...value, organizationIds })}
        />
        <CheckboxGroup
          title="Cargo"
          options={roles.map((role) => ({ id: role, label: role }))}
          selected={value.roles}
          onChange={(selectedRoles) => onChange({ ...value, roles: selectedRoles })}
        />
        <CheckboxGroup
          title="Situação cadastral"
          options={registrationOptions}
          selected={value.registrationStatuses}
          onChange={(registrationStatuses) => onChange({ ...value, registrationStatuses })}
        />
        <CheckboxGroup
          title="Turno"
          options={shiftOptions}
          selected={value.shiftStatuses}
          onChange={(shiftStatuses) => onChange({ ...value, shiftStatuses })}
        />
      </div>
    </details>
  );
}
