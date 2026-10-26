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
  raio_atuacao_km: number | null;
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
  resolvida_em: string | null;
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

export interface OcorrenciaTendencia {
  id: number;
  tipo: string;
  gravidade: OcorrenciaEquipamento['gravidade'];
  status: OcorrenciaEquipamento['status'];
  ocorrida_em: string;
  resolvida_em: string | null;
  latitude: number;
  longitude: number;
}

export interface PrevisaoOcorrenciaIntervalo {
  inicio: string;
  fim: string;
  quantidade_esperada: number;
  graves_esperadas: number;
  probabilidade_grave: number;
  faixa_historica_p10: number;
  faixa_historica_p90: number;
  janelas_com_graves: number;
  janelas_avaliadas: number;
  janelas_efetivas: number;
}

export interface PrevisaoOcorrenciaArea {
  id: number;
  nome: string;
  quantidade_setores: number;
  quantidade_esperada: number;
  graves_esperadas: number;
  probabilidade_grave_24h: number;
  faixa_historica_p10: number;
  faixa_historica_p90: number;
  janelas_com_graves: number;
  janelas_avaliadas: number;
  janelas_efetivas: number;
  intervalos: PrevisaoOcorrenciaIntervalo[];
}

export interface PrevisaoAreaFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: {
      id: number;
      nome: string;
      quantidade_setores: number;
      distritos: string[];
    };
    geometry: {
      type: 'Polygon' | 'MultiPolygon';
      coordinates: number[][][] | number[][][][];
    };
  }>;
}

export interface SetorCensitarioFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: {
      id: number;
      codigo_setor: string;
      nome: string;
      distrito_id: number;
      distrito_codigo: string;
      distrito: string;
      situacao: string;
      area_km2: number;
    };
    geometry: {
      type: 'Polygon' | 'MultiPolygon';
      coordinates: number[][][] | number[][][][];
    };
  }>;
}

export interface AvaliacaoPrevisaoOcorrencia {
  dias_teste: number;
  meses_teste: number;
  amostras: number;
  mae_modelo: number;
  mae_referencia: number;
  brier_modelo: number;
  brier_referencia: number;
  inicio: string;
  fim: string;
  series_por_area: Array<{
    area_id: number;
    pontos: Array<{
      data: string;
      previsto: number;
      observado: number;
      limite_inferior: number;
      limite_superior: number;
      probabilidade_grave: number;
      grave_observada: boolean;
    }>;
  }>;
}

export interface PrevisaoOcorrencias {
  status: 'ok' | 'sem_historico';
  unidades: 'areas_agrupadas';
  quantidade_areas: number;
  quantidade_setores: number;
  gerada_em: string;
  inicio: string;
  fim: string;
  periodo_historico_semanas: number;
  ocorrencias_historicas: number;
  ocorrencias_fora_malha: number;
  metodo: string;
  areas: PrevisaoOcorrenciaArea[];
  avaliacao: AvaliacaoPrevisaoOcorrencia | null;
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
