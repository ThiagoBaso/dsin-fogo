import type { ManutencaoEquipamento, OcorrenciaEquipamento, RotaVeiculo } from '../../types';

export const attributeLabels: Record<string, string> = {
  raio_cobertura_km: 'Raio estimado de cobertura',
  limite_velocidade: 'Limite de velocidade',
  modalidade: 'Modalidade de fiscalização',
  resolucao: 'Resolução',
  tipo_imagem: 'Tipo de imagem',
  visao_noturna: 'Visão noturna',
  ptz: 'Movimento PTZ',
  faixas_fiscalizadas: 'Faixas fiscalizadas',
  largura_m: 'Largura',
  altura_m: 'Altura',
  controle_acesso: 'Controle de acesso',
  duplo_sentido: 'Operação em duplo sentido',
  vagas_monitoradas: 'Vagas monitoradas',
  aceita_pix: 'Aceita Pix',
  aceita_cartao: 'Aceita cartão',
  aceita_dinheiro: 'Aceita dinheiro',
  acessibilidade: 'Acessibilidade',
  capacidade_ton: 'Capacidade',
  eixos_maximo: 'Eixos máximos',
  precisao_kg: 'Precisão de pesagem',
  autonomia_km: 'Autonomia',
  velocidade_max_kmh: 'Velocidade máxima',
  tipo_propulsao: 'Tipo de propulsão',
  bloqueio_area_restrita: 'Bloqueio em área restrita',
  cilindrada_cc: 'Cilindrada',
  tracao: 'Tração',
  radio_operacional: 'Rádio operacional',
  sirene_giroflex: 'Sirene e giroflex',
  camera_embarcada: 'Câmera embarcada',
  categoria_servico: 'Categoria do serviço',
  capacidade_passageiros: 'Capacidade de passageiros',
  capacete_disponivel: 'Capacete disponível',
  capacete_passageiro: 'Capacete para passageiro',
  capacidade_alunos: 'Capacidade de alunos',
  cintos_seguranca: 'Cintos de segurança',
  acompanhante: 'Acompanhante',
  leitura_placas: 'Leitura de placas',
  quantidade_cameras: 'Quantidade de câmeras',
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
