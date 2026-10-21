// IDs dos tipos e situações cadastrados no seed. Arquivos e aparência pertencem ao front.
export const equipmentTypes = [
  { id: 1, label: 'Radar fixo' },
  { id: 2, label: 'Radar móvel' },
  { id: 3, label: 'Câmera de monitoramento' },
  { id: 4, label: 'Cancela automatizada' },
  { id: 5, label: 'Totem de estacionamento' },
  { id: 6, label: 'Balança de caminhões' },
  { id: 7, label: 'Patinete elétrico' },
  { id: 8, label: 'Motocicleta' },
  { id: 9, label: 'Viatura policial' },
  { id: 10, label: 'Veículo da Guarda Municipal' },
  { id: 11, label: 'Veículo de fiscalização' },
];

export const equipmentIcons: Record<number, string> = {
  1: 'radar-fixo',
  2: 'radar-movel',
  3: 'camera',
  4: 'cancela',
  5: 'parking',
  6: 'scale',
  7: 'scooter',
  8: 'motorcycle',
  9: 'police',
  10: 'municipal',
  11: 'car',
};

export const equipmentSituations: Record<number, { label: string; symbol: string; className: string }> = {
  1: { label: 'Operacional', symbol: '✓', className: 'operacional' },
  2: { label: 'Indisponível', symbol: 'Ⅱ', className: 'indisponivel' },
  3: { label: 'Desativado', symbol: '×', className: 'desativado' },
  4: { label: 'Furtado', symbol: '!', className: 'furtado' },
  5: { label: 'Em manutenção', symbol: '⚒', className: 'manutencao' },
};
