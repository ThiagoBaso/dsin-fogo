export type Aba = 'mapa' | 'lista' | 'agentes';

export type AgentShiftStatus = 'em_atividade' | 'programado' | 'sem_turno';
export type AgentRegistrationStatus = 'ativo' | 'inativo';

export interface AgentFilterState {
  showOnMap: boolean;
  organizationIds: number[] | null;
  roles: string[] | null;
  registrationStatuses: AgentRegistrationStatus[] | null;
  shiftStatuses: AgentShiftStatus[] | null;
}

export interface Agente {
  id: number;
  nome: string;
  matricula: string;
  cargo: string;
  ativo_cadastro: boolean;
  orgao_id: number;
  orgao_nome: string;
  orgao_sigla: string | null;
  turno_id: number | null;
  turno_status: 'em_atividade' | 'programado' | null;
  turno_inicio_previsto: string | null;
  turno_fim_previsto: string | null;
  veiculo_id: number | null;
  veiculo_numero_serie: string | null;
  veiculo_marca: string | null;
  veiculo_modelo: string | null;
  veiculo_tipo: string | null;
  latitude: number | null;
  longitude: number | null;
  logradouro: string | null;
  referencia: string | null;
  bairro: string | null;
  regiao: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  posicao_registrada_em: string | null;
  origem_posicao: 'gps_veiculo' | 'base_veiculo' | 'base_agente';
}

export interface LocationFilters {
  bairro: string;
  regiao: string;
  cidade: string;
  uf: string;
  busca: string;
}

export type AttributeFilterValue = string | boolean;

export interface AttributeFilterOption {
  key: string;
  typeId: number;
  typeLabel: string;
  name: string;
  label: string;
  typeValue: 'texto' | 'numero' | 'booleano';
  unit: string | null;
  values: AttributeFilterValue[];
}

export interface AttributeFilterSelection {
  selectedValues: AttributeFilterValue[];
  minimum: string;
  maximum: string;
}

export type AttributeFilterState = Record<string, AttributeFilterSelection>;

export interface Ponto {
  id: number;
  nome: string;
  numero_serie: string;
  modelo: string;
  orgao_nome: string;
  orgao_sigla: string | null;
  tipo_id: number;
  tipo: string;
  mobilidade: 'fixo' | 'movel';
  situacao_id: number;
  situacao: string;
  latitude: number;
  longitude: number;
  latitude_fixa: number | null;
  longitude_fixa: number | null;
  latitude_gps: number | null;
  longitude_gps: number | null;
  logradouro: string | null;
  referencia: string | null;
  bairro: string | null;
  regiao: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  status: 'ativo' | 'inativo';
  atributos?: AtributoEquipamento[];
}

export interface RotaPosicao {
  latitude: number;
  longitude: number;
  registrado_em: string;
}

export interface RotaVeiculo {
  id: number;
  id_equipamento: number;
  numero_serie: string;
  inicio_em: string;
  fim_em: string | null;
  distancia_m: number;
  situacao: 'em_andamento' | 'concluida' | 'interrompida';
  posicoes: RotaPosicao[];
}

export interface AtributoEquipamento {
  id: number;
  nome: string;
  tipo_valor: 'texto' | 'numero' | 'booleano';
  unidade: string | null;
  valor: string | number | boolean | null;
}

export interface OcorrenciaEquipamento {
  id: number;
  tipo: string;
  gravidade: 'baixa' | 'media' | 'alta' | 'critica';
  status: 'aberta' | 'em_atendimento' | 'resolvida' | 'cancelada';
  descricao: string | null;
  ocorrida_em: string;
  logradouro: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
}

export interface OcorrenciaMapa extends OcorrenciaEquipamento {
  latitude: number;
  longitude: number;
  orgao_nome: string;
  equipamento_nome: string | null;
}

export interface ManutencaoEquipamento {
  id: number;
  modalidade: 'preventiva' | 'corretiva';
  prioridade: 'imediata' | 'agendada';
  status: 'pendente' | 'agendada' | 'em_execucao' | 'concluida' | 'cancelada';
  descricao: string | null;
  aberta_em: string;
  prevista_para: string | null;
  iniciada_em: string | null;
  concluida_em: string | null;
}

export interface DetalhesEquipamento {
  id: number;
  tipo_id: number;
  tipo: string;
  numero_serie: string;
  marca: string;
  modelo: string;
  mobilidade: 'fixo' | 'movel';
  situacao_id: number;
  situacao: string;
  orgao_nome: string;
  orgao_sigla: string | null;
  logradouro: string | null;
  referencia: string | null;
  bairro: string | null;
  regiao: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  latitude: number | null;
  longitude: number | null;
  posicao_registrada_em: string | null;
  velocidade_kmh: number | null;
  cadastrado_em: string;
  instalado_em: string | null;
  atributos: AtributoEquipamento[];
}
