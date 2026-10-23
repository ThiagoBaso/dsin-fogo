import type { ManutencaoEquipamento, OcorrenciaEquipamento, RotaVeiculo } from '../../types';

export const attributeLabels: Record<string, string> = {
  limite_velocidade: 'Limite de velocidade',
  modalidade: 'Modalidade de fiscalização',
  resolucao: 'Resolução',
  visao_noturna: 'Visão noturna',
  largura_m: 'Largura',
  vagas_monitoradas: 'Vagas monitoradas',
  capacidade_ton: 'Capacidade',
  autonomia_km: 'Autonomia',
  cilindrada_cc: 'Cilindrada',
  tracao: 'Tração',
};

export const occurrenceStatusLabels: Record<OcorrenciaEquipamento['status'], string> = {
  aberta: 'Aberta',
  em_atendimento: 'Em atendimento',
  resolvida: 'Resolvida',
  cancelada: 'Cancelada',
};

export const occurrenceSeverityLabels: Record<OcorrenciaEquipamento['gravidade'], string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  critica: 'Crítica',
};

export const routeStatusLabels: Record<RotaVeiculo['situacao'], string> = {
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  interrompida: 'Interrompida',
};

export const maintenanceTypeLabels: Record<ManutencaoEquipamento['modalidade'], string> = {
  preventiva: 'Preventiva',
  corretiva: 'Corretiva',
};

export const maintenancePriorityLabels: Record<ManutencaoEquipamento['prioridade'], string> = {
  imediata: 'Imediata',
  agendada: 'Agendada',
};

export const maintenanceStatusLabels: Record<ManutencaoEquipamento['status'], string> = {
  pendente: 'Pendente',
  agendada: 'Agendada',
  em_execucao: 'Em execução',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};
