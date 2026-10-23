import { useCallback, useEffect, useRef, useState } from 'react';
import type { RotaVeiculo } from '../../types';

const routePageSize = 10;

export function useEquipmentRouteHistory(equipamentoId: number | undefined, enabled: boolean) {
  const [rotas, setRotas] = useState<RotaVeiculo[]>([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [offset, setOffset] = useState(0);
  const [temMais, setTemMais] = useState(true);
  const request = useRef<AbortController | null>(null);

  const carregar = useCallback((novoOffset: number, substituir = false) => {
    if (equipamentoId === undefined) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setCarregando(true);
    setErro('');
    fetch(`${process.env.REACT_APP_API_URL || ''}/api/equipamentos/${equipamentoId}/viagens?limit=${routePageSize}&offset=${novoOffset}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`API respondeu ${response.status}`);
        return response.json() as Promise<RotaVeiculo[]>;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setRotas((atuais) => substituir ? data : atuais.concat(data));
        setOffset(novoOffset + data.length);
        setTemMais(data.length === routePageSize);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted && error.name !== 'AbortError') {
          setErro('Não foi possível carregar o histórico de rotas.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCarregando(false);
      });
  }, [equipamentoId]);

  useEffect(() => {
    request.current?.abort();
    setRotas([]);
    setOffset(0);
    setTemMais(true);
    setErro('');
    setCarregando(false);
  }, [equipamentoId]);

  useEffect(() => {
    if (!enabled || equipamentoId === undefined) return undefined;
    setRotas([]);
    setOffset(0);
    setTemMais(true);
    setErro('');
    carregar(0, true);
    return () => request.current?.abort();
  }, [enabled, equipamentoId, carregar]);

  return { rotas, erro, carregando, offset, temMais, carregar };
}
