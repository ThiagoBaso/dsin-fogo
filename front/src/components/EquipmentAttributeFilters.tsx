import type {
  AttributeFilterOption,
  AttributeFilterSelection,
  AttributeFilterState,
  AttributeFilterValue,
} from '../types';

type Props = {
  options: AttributeFilterOption[];
  visibleTypeIds: number[];
  value: AttributeFilterState;
  onChange: (value: AttributeFilterState) => void;
};

const emptySelection: AttributeFilterSelection = {
  selectedValues: [],
  minimum: '',
  maximum: '',
};

function displayValue(value: AttributeFilterValue) {
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  return value;
}

export default function EquipmentAttributeFilters({ options, visibleTypeIds, value, onChange }: Props) {
  if (options.length === 0) return null;

  const groupedOptions = options.reduce<Record<number, { label: string; options: AttributeFilterOption[] }>>(
    (groups, option) => {
      if (visibleTypeIds.includes(option.typeId)) {
        groups[option.typeId] ??= { label: option.typeLabel, options: [] };
        groups[option.typeId].options.push(option);
      }
      return groups;
    },
    {},
  );

  const isSelected = (selection?: AttributeFilterSelection) => Boolean(
    selection && (selection.selectedValues.length > 0 || selection.minimum !== '' || selection.maximum !== ''),
  );
  const selectedOptions = options.filter((option) => isSelected(value[option.key]));
  const countSelectedFilters = (option: AttributeFilterOption) => {
    const selection = value[option.key];
    if (!selection) return 0;
    if (option.typeValue === 'numero') {
      return selection.minimum !== '' || selection.maximum !== '' ? 1 : 0;
    }
    return selection.selectedValues.length;
  };
  const selectedCount = options.reduce((count, option) => count + countSelectedFilters(option), 0);

  function replaceSelection(key: string, selection: AttributeFilterSelection) {
    const next = { ...value };
    if (isSelected(selection)) next[key] = selection;
    else delete next[key];
    onChange(next);
  }

  function updateSelection(key: string, update: Partial<AttributeFilterSelection>) {
    replaceSelection(key, { ...emptySelection, ...value[key], ...update });
  }

  function removeValue(key: string, removedValue: AttributeFilterValue) {
    const selection = value[key] ?? emptySelection;
    replaceSelection(key, {
      ...selection,
      selectedValues: selection.selectedValues.filter((selected) => selected !== removedValue),
    });
  }

  function renderSelectedChips() {
    if (selectedCount === 0) return null;

    const chips = selectedOptions.flatMap((option) => {
      const selection = value[option.key] ?? emptySelection;
      if (option.typeValue === 'numero') {
        const range = selection.minimum !== '' && selection.maximum !== ''
          ? `${selection.minimum}–${selection.maximum}`
          : selection.minimum !== ''
            ? `≥ ${selection.minimum}`
            : `≤ ${selection.maximum}`;
        return [(
          <button
            type="button"
            className="equipment-attribute-chip"
            key={option.key}
            aria-label={`Remover filtro ${option.label}: ${range}`}
            onClick={() => replaceSelection(option.key, emptySelection)}
          >
            <span>{option.label}: {range}{option.unit ? ` ${option.unit}` : ''}</span>
            <span aria-hidden="true">×</span>
          </button>
        )];
      }

      return selection.selectedValues.map((selectedValue) => (
        <button
          type="button"
          className="equipment-attribute-chip"
          key={`${option.key}-${String(selectedValue)}`}
          aria-label={`Remover filtro ${option.label}: ${displayValue(selectedValue)}`}
          onClick={() => removeValue(option.key, selectedValue)}
        >
          <span>{option.label}: {displayValue(selectedValue)}</span>
          <span aria-hidden="true">×</span>
        </button>
      ));
    });
    const [firstChip, ...remainingChips] = chips;

    return (
      <div className="equipment-attribute-selected" aria-label="Características selecionadas">
        <div className="equipment-attribute-first-row">
          {firstChip}
          <button
            type="button"
            className="equipment-attribute-clear"
            aria-label="Limpar características"
            title="Limpar características"
            onClick={() => onChange({})}
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16">
              <path d="m4 4 8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
        {remainingChips.length > 0 && (
          <div className="equipment-attribute-rest">
            {remainingChips}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="equipment-attribute-filter-panel">
      <details className="equipment-filter-accordion equipment-attribute-filters">
        <summary>
          <span>Características técnicas</span>
          {selectedCount > 0 && (
            <span className="equipment-attribute-count" aria-live="polite">
              {selectedCount} {selectedCount === 1 ? 'critério' : 'critérios'}
            </span>
          )}
        </summary>
        <p className="equipment-attribute-hint">Valores no mesmo campo são alternativas; campos diferentes se combinam. Use Atualizar para aplicar.</p>
        <div className="equipment-attribute-groups">
          {Object.entries(groupedOptions).map(([typeId, group]) => {
            const groupSelectedCount = group.options.reduce(
              (count, option) => count + countSelectedFilters(option),
              0,
            );
            return (
              <details className="equipment-attribute-type" key={typeId}>
                <summary>
                  <span>{group.label}</span>
                  {groupSelectedCount > 0 && <span className="equipment-attribute-group-count">{groupSelectedCount}</span>}
                </summary>
                <div className="equipment-attribute-fields">
                  {group.options.map((option) => {
                    const selection = value[option.key] ?? emptySelection;
                    const unit = option.unit ? ` (${option.unit})` : '';

                    if (option.typeValue === 'numero') {
                      return (
                        <fieldset className="equipment-attribute-field" key={option.key}>
                          <legend>{option.label}{unit}</legend>
                          <div className="equipment-attribute-range">
                            <label>
                              <span>Mínimo</span>
                              <input
                                type="number"
                                step="any"
                                value={selection.minimum}
                                aria-label={`${option.label}: mínimo`}
                                onChange={(event) => updateSelection(option.key, { minimum: event.target.value })}
                              />
                            </label>
                            <label>
                              <span>Máximo</span>
                              <input
                                type="number"
                                step="any"
                                value={selection.maximum}
                                aria-label={`${option.label}: máximo`}
                                onChange={(event) => updateSelection(option.key, { maximum: event.target.value })}
                              />
                            </label>
                          </div>
                        </fieldset>
                      );
                    }

                    return (
                      <fieldset className="equipment-attribute-field" key={option.key}>
                        <legend>{option.label}{unit}</legend>
                        <div className="equipment-attribute-values">
                          {option.values.map((attributeValue) => {
                            const checked = selection.selectedValues.includes(attributeValue);
                            const label = displayValue(attributeValue);
                            return (
                              <label className="equipment-filter-option" key={`${option.key}-${String(attributeValue)}`}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) => updateSelection(option.key, {
                                    selectedValues: event.target.checked
                                      ? [...selection.selectedValues, attributeValue]
                                      : selection.selectedValues.filter((selected) => selected !== attributeValue),
                                  })}
                                />
                                <span>{label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </fieldset>
                    );
                  })}
                </div>
              </details>
            );
          })}
          {Object.keys(groupedOptions).length === 0 && (
            <p className="equipment-attribute-hint">Selecione um tipo de equipamento para ver os atributos disponíveis.</p>
          )}
        </div>
      </details>
      {renderSelectedChips()}
    </div>
  );
}
