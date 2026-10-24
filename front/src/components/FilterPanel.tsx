import type { FormEvent } from 'react';
import { AgentFilterState, AttributeFilterOption, AttributeFilterState, LocationFilters } from '../types';
import AgentFilters from './AgentFilters';
import EquipmentAttributeFilters from './EquipmentAttributeFilters';

type FilterOption = { id: number; label: string };

type CheckboxGroupProps = {
  options: FilterOption[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
};

type FilterPanelProps = {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  types: CheckboxGroupProps;
  situations: CheckboxGroupProps;
  agents: {
    value: AgentFilterState;
    organizations: FilterOption[];
    roles: string[];
    onChange: (value: AgentFilterState) => void;
  };
  location: {
    value: LocationFilters;
    options: {
      bairros: string[];
      regioes: string[];
      cidades: string[];
      ufs: string[];
    };
    onChange: (filters: LocationFilters) => void;
  };
  attributes: {
    options: AttributeFilterOption[];
    visibleTypeIds: number[];
    value: AttributeFilterState;
    onChange: (value: AttributeFilterState) => void;
  };
  position: {
    value: 'gps' | 'fixa';
    onChange: (position: 'gps' | 'fixa') => void;
  };
  period: {
    mode: 'atual' | 'historico';
    onModeChange: (mode: 'atual' | 'historico') => void;
    value: string;
    onValueChange: (value: string) => void;
    maxValue: string;
  };
  display: {
    onlySelected: boolean;
    onOnlySelectedChange: (enabled: boolean) => void;
    multiSelection: boolean;
    onMultiSelectionChange: (enabled: boolean) => void;
    neighborhoodBoundaries: boolean;
    onNeighborhoodBoundariesChange: (enabled: boolean) => void;
  };
  onApply: () => void;
  onReset: () => void;
};

function CheckboxFilterGroup({
  title,
  options,
  selectedIds,
  onChange,
}: CheckboxGroupProps & { title: string }) {
  const todosSelecionados = selectedIds.length === options.length;

  return (
    <details className="equipment-filter-accordion" open>
      <summary>{title}</summary>
      <div className="equipment-filter-options" role="group" aria-label={title}>
        <label className="equipment-filter-option">
          <input
            type="checkbox"
            checked={todosSelecionados}
            onChange={(event) => onChange(event.target.checked ? options.map((option) => option.id) : [])}
          />
          <span>Todos</span>
        </label>
        {options.map((option) => (
          <label className="equipment-filter-option" key={option.id}>
            <input
              type="checkbox"
              checked={selectedIds.includes(option.id)}
              onChange={(event) => onChange(event.target.checked
                ? [...selectedIds, option.id]
                : selectedIds.filter((id) => id !== option.id))}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

export default function FilterPanel({
  expanded,
  onExpandedChange,
  types,
  situations,
  agents,
  location,
  attributes,
  position,
  period,
  display,
  onApply,
  onReset,
}: FilterPanelProps) {
  function aplicarFiltros(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onApply();
  }

  return (
    <>
      <aside
        id="equipment-filter-panel"
        className="left-painel"
        aria-label="Filtros de equipamentos"
        hidden={!expanded}
      >
        <form className="equipment-filters" onSubmit={aplicarFiltros}>
          <div className="equipment-filters-content">
            <div className="equipment-filters-heading">
              <h2>Filtros</h2>
              <button type="button" className="equipment-filters-reset" onClick={onReset}>
                Resetar
              </button>
            </div>
            <section className="equipment-time-filters" aria-label="Período dos equipamentos">
              <h3>Período</h3>
              <label className="equipment-time-option">
                <input
                  type="radio"
                  name="modo-data"
                  value="atual"
                  checked={period.mode === 'atual'}
                  onChange={() => period.onModeChange('atual')}
                />
                <span>Atual</span>
              </label>
              <label className="equipment-time-option">
                <input
                  type="radio"
                  name="modo-data"
                  value="historico"
                  checked={period.mode === 'historico'}
                  onChange={() => period.onModeChange('historico')}
                />
                <span>Escolher data e hora</span>
              </label>
              {period.mode === 'historico' && (
                <label className="equipment-location-control">
                  <span>Data e hora</span>
                  <input
                    type="datetime-local"
                    value={period.value}
                    max={period.maxValue}
                    required
                    onChange={(event) => period.onValueChange(event.target.value)}
                  />
                </label>
              )}
            </section>
            <CheckboxFilterGroup
              title="Tipo de equipamento"
              options={types.options}
              selectedIds={types.selectedIds}
              onChange={types.onChange}
            />
            <CheckboxFilterGroup
              title="Status do equipamento"
              options={situations.options}
              selectedIds={situations.selectedIds}
              onChange={situations.onChange}
            />
            <AgentFilters
              value={agents.value}
              organizations={agents.organizations}
              roles={agents.roles}
              onChange={agents.onChange}
            />
            <details className="equipment-filter-accordion equipment-location-filters" aria-label="Filtros de localização">
              <summary>Localização</summary>
              <label className="equipment-location-control">
                <span>Bairro</span>
                <select value={location.value.bairro} onChange={(event) => location.onChange({ ...location.value, bairro: event.target.value })}>
                  <option value="">Todos os bairros</option>
                  {location.options.bairros.map((bairro) => <option key={bairro} value={bairro}>{bairro}</option>)}
                </select>
              </label>
              <label className="equipment-location-control">
                <span>Região</span>
                <select value={location.value.regiao} onChange={(event) => location.onChange({ ...location.value, regiao: event.target.value })}>
                  <option value="">Todas as regiões</option>
                  {location.options.regioes.map((regiao) => <option key={regiao} value={regiao}>{regiao}</option>)}
                </select>
              </label>
              <label className="equipment-location-control">
                <span>Cidade</span>
                <select value={location.value.cidade} onChange={(event) => location.onChange({ ...location.value, cidade: event.target.value })}>
                  <option value="">Todas as cidades</option>
                  {location.options.cidades.map((cidade) => <option key={cidade} value={cidade}>{cidade}</option>)}
                </select>
              </label>
              <label className="equipment-location-control">
                <span>UF</span>
                <select value={location.value.uf} onChange={(event) => location.onChange({ ...location.value, uf: event.target.value })}>
                  <option value="">Todas as UFs</option>
                  {location.options.ufs.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                </select>
              </label>
              <label className="equipment-location-control">
                <span>Logradouro, referência ou CEP</span>
                <input
                  type="search"
                  value={location.value.busca}
                  onChange={(event) => location.onChange({ ...location.value, busca: event.target.value })}
                  placeholder="Buscar endereço"
                />
              </label>
            </details>
            <EquipmentAttributeFilters
              options={attributes.options}
              visibleTypeIds={attributes.visibleTypeIds}
              value={attributes.value}
              onChange={attributes.onChange}
            />
            <details className="equipment-filter-accordion equipment-location-filters" aria-label="Posição de equipamentos móveis">
              <summary>Posição dos equipamentos móveis</summary>
              <label className="equipment-location-control">
                <span>Exibir no mapa</span>
                <select value={position.value} onChange={(event) => position.onChange(event.target.value as 'gps' | 'fixa')}>
                  <option value="gps">Última posição no GPS</option>
                  <option value="fixa">Posição fixa cadastrada</option>
                </select>
              </label>
            </details>
            <section className="equipment-display-options" aria-label="Opções de exibição">
              <h3>Opções de exibição</h3>
              <label className="equipment-display-option">
                <input
                  type="checkbox"
                  checked={display.onlySelected}
                  onChange={(event) => display.onOnlySelectedChange(event.target.checked)}
                />
                <span>Exibir apenas selecionados</span>
              </label>
              <label className="equipment-display-option">
                <input
                  type="checkbox"
                  checked={display.multiSelection}
                  onChange={(event) => display.onMultiSelectionChange(event.target.checked)}
                />
                <span>Permitir multisseleção</span>
              </label>
              <label className="equipment-display-option" title="Divisórias internas seguem ruas do OpenStreetMap; setores e limite externo são fictícios e não oficiais.">
                <input
                  type="checkbox"
                  checked={display.neighborhoodBoundaries}
                  onChange={(event) => display.onNeighborhoodBoundariesChange(event.target.checked)}
                />
                <span>Exibir contornos dos bairros (fictícios)</span>
              </label>
            </section>
          </div>
          <div className="equipment-filters-actions">
            <button type="submit">Atualizar</button>
          </div>
        </form>
      </aside>
      <button
        className="filter-panel-toggle"
        type="button"
        aria-controls="equipment-filter-panel"
        aria-expanded={expanded}
        aria-label={expanded ? 'Recolher painel de filtros' : 'Expandir painel de filtros'}
        title={expanded ? 'Recolher painel de filtros' : 'Expandir painel de filtros'}
        onClick={() => onExpandedChange(!expanded)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={expanded ? 'm14 6-6 6 6 6' : 'm10 6 6 6-6 6'} />
        </svg>
      </button>
    </>
  );
}
