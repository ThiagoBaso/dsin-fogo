export type Aba = 'mapa' | 'lista';

export interface Ponto {
  id: number;
  nome: string;
  latitude: number;
  longitude: number;
  status: 'ativo' | 'inativo';
}
