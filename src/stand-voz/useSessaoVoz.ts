import { useCallback, useEffect, useRef, useState } from 'react';
import type { EstadoStand } from '../../shared/stand/eventos.ts';
import { assinarEventosCerebro } from './barramento';
import { SessaoVoz, type FimSessao } from './sessaoVoz';

export interface UsoSessaoVoz {
  estado: EstadoStand;
  ativa: boolean;
  /** Último motivo de fim: 'desligado' quando o servidor está sem credencial. */
  fim: { motivo: FimSessao; detalhe?: string } | null;
  iniciar: () => Promise<void>;
  encerrar: () => void;
}

/** Hook para a página do stand (M2): liga e desliga a conversa por voz. */
export function useSessaoVoz(): UsoSessaoVoz {
  const sessao = useRef<SessaoVoz | null>(null);
  const [estado, setEstado] = useState<EstadoStand>('ocioso');
  const [ativa, setAtiva] = useState(false);
  const [fim, setFim] = useState<UsoSessaoVoz['fim']>(null);

  useEffect(() => assinarEventosCerebro((evento) => {
    if (evento.tipo === 'estado') setEstado(evento.valor);
  }), []);

  useEffect(() => () => sessao.current?.encerrar(), []);

  const iniciar = useCallback(async () => {
    if (sessao.current) return;
    setFim(null);
    setAtiva(true);
    const nova = new SessaoVoz((motivo, detalhe) => {
      if (sessao.current === nova) sessao.current = null;
      setAtiva(false);
      setFim({ motivo, detalhe });
    });
    sessao.current = nova;
    await nova.iniciar();
  }, []);

  const encerrar = useCallback(() => sessao.current?.encerrar(), []);

  return { estado, ativa, fim, iniciar, encerrar };
}
