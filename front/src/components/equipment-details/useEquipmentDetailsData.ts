import { useEffect, useState } from 'react';
import type { DetailTab } from './tabs';
import type { DetalhesEquipamento, ManutencaoEquipamento, OcorrenciaEquipamento } from '../../types';

export function useEquipmentDetailsData(
  equipamentoId: number | undefined,
  dataHora: string | null,
  abaAtiva: DetailTab,
  tentativa: number,
) {
  const [detalhes, setDetalhes] = useState<DetalhesEquipamento | null>(null);
  const [ocorrencias, setOcorrencias] = useState<OcorrenciaEquipamento[] | null>(null);
  const [manutencoes, setManutencoes] = useState<ManutencaoEquipamento[] | null>(null);
  const [erro, setErro] = useState('');
  const [erroOcorrencias, setErroOcorrencias] = useState('');
  const [erroManutencoes, setErroManutencoes] = useState('');

  useEffect(() => {
    setDetalhes(null);
    setErro('');
    if (equipamentoId === undefined) return undefined;
    const controller = new AbortController();
    const queryData = dataHora ? `?em=${encodeURIComponent(dataHora)}` : '';
    fetch(`${process.env.REACT_APP_API_URL || ''}/api/equipamentos/${equipamentoId}${queryData}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`API respondeu ${response.status}`);
        return response.json() as Promise<DetalhesEquipamento>;
      })
      .then((data) => {
        if (!controller.signal.aborted) setDetalhes(data);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted && error.name !== 'AbortError') {
          setErro('Não foi possível carregar os detalhes do equipamento.');
        }
      });
    return () => controller.abort();
  }, [equipamentoId, dataHora, tentativa]);

  useEffect(() => {
    setOcorrencias(null);
    setErroOcorrencias('');
    if (equipamentoId === undefined) return undefined;
    const controller = new AbortController();
    const queryData = dataHora ? `?em=${encodeURIComponent(dataHora)}` : '';
    fetch(`${process.env.REACT_APP_API_URL || ''}/api/equipamentos/${equipamentoId}/ocorrencias${queryData}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`API respondeu ${response.status}`);
        return response.json() as Promise<OcorrenciaEquipamento[]>;
      })
      .then((data) => {
        if (!controller.signal.aborted) setOcorrencias(data);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted && error.name !== 'AbortError') {
          setErroOcorrencias('Não foi possível carregar as ocorrências deste equipamento.');
        }
      });
    return () => controller.abort();
  }, [equipamentoId, dataHora, tentativa]);

  useEffect(() => {
    setManutencoes(null);
    setErroManutencoes('');
    if (abaAtiva !== 'manutencao' || equipamentoId === undefined) return undefined;
    const controller = new AbortController();
    fetch(`${process.env.REACT_APP_API_URL || ''}/api/equipamentos/${equipamentoId}/manutencoes`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`API respondeu ${response.status}`);
        return response.json() as Promise<ManutencaoEquipamento[]>;
      })
      .then((data) => {
        if (!controller.signal.aborted) setManutencoes(data);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted && error.name !== 'AbortError') {
          setErroManutencoes('Não foi possível carregar as manutenções deste equipamento.');
        }
      });
    return () => controller.abort();
  }, [abaAtiva, equipamentoId, tentativa]);

  return { detalhes, ocorrencias, manutencoes, erro, erroOcorrencias, erroManutencoes };
}
