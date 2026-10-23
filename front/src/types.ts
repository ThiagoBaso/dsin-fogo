export type Aba = 'mapa' | 'lista';

export interface Ponto {
  id: number;
  nome: string;
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
