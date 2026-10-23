import type { AtributoEquipamento } from '../../types';

export function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="equipment-detail-field">
      <dt>{label}</dt>
      <dd>{value === null || value === undefined || value === '' ? 'Não informado' : value}</dd>
    </div>
  );
}

export function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString('pt-BR');
}

export function formatAttribute(attribute: AtributoEquipamento) {
  if (attribute.valor === null) return null;
  if (attribute.tipo_valor === 'booleano') return attribute.valor ? 'Sim' : 'Não';
  const value = typeof attribute.valor === 'number'
    ? attribute.valor.toLocaleString('pt-BR')
    : String(attribute.valor);
  const unit = attribute.unidade || (attribute.nome === 'cilindrada_cc' ? 'cm³' : '');
  return unit ? `${value} ${unit}` : value;
}

export function formatDistance(metros: number) {
  return `${(metros / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
}
