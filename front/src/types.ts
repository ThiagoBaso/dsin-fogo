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
