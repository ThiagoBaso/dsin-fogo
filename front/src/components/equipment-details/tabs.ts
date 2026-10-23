export const detailTabs = [
  { id: 'identificacao', label: 'Identificação' },
  { id: 'posicao', label: 'Posição' },
  { id: 'atributos', label: 'Atributos' },
  { id: 'ocorrencias', label: 'Ocorrências' },
  { id: 'manutencao', label: 'Manutenção' },
  { id: 'historico', label: 'Histórico de rotas' },
] as const;

export type DetailTab = (typeof detailTabs)[number]['id'];
