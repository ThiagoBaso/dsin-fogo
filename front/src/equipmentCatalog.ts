// IDs dos tipos e situações cadastrados no seed. Arquivos e aparência pertencem ao front.
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
