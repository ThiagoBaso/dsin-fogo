export type Aba = 'mapa' | 'lista';

export interface Ponto {
  id: number;
  nome: string;
  tipo_id: number;
  tipo: string;
  situacao_id: number;
  situacao: string;
  latitude: number;
  longitude: number;
  status: 'ativo' | 'inativo';
}

export interface AtributoEquipamento {
  id: number;
  nome: string;
  tipo_valor: 'texto' | 'numero' | 'booleano';
  unidade: string | null;
  valor: string | number | boolean | null;
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
