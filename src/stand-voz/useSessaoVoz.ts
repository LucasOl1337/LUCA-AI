import { useCallback, useEffect, useRef, useState } from 'react';
import type { EstadoStand } from '../../shared/stand/eventos.ts';
import { assinarEventosCerebro } from './barramento';
import { abrirSessaoDeVoz } from './abrirSessao';
import type { FimSessao, SessaoDeVoz } from './sessaoVoz';

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
  const sessao = useRef<SessaoDeVoz | null>(null);
  const abrindo = useRef(false);
  /** Pedido de encerrar (ou desmontagem) chegou enquanto a sessão abria. */
  const cancelarAoAbrir = useRef(false);
  const [estado, setEstado] = useState<EstadoStand>('ocioso');
  const [ativa, setAtiva] = useState(false);
  const [fim, setFim] = useState<UsoSessaoVoz['fim']>(null);

  useEffect(() => assinarEventosCerebro((evento) => {
    if (evento.tipo === 'estado') setEstado(evento.valor);
  }), []);

  useEffect(() => () => {
    cancelarAoAbrir.current = true;
    sessao.current?.encerrar();
  }, []);

  const iniciar = useCallback(async () => {
    if (sessao.current || abrindo.current) return;
    abrindo.current = true;
    cancelarAoAbrir.current = false;
    setFim(null);
    setAtiva(true);
    let terminou = false;
    const aoTerminar = (motivo: FimSessao, detalhe?: string) => {
      terminou = true;
      sessao.current = null;
      setAtiva(false);
      setFim({ motivo, detalhe });
    };
    try {
      const nova = await abrirSessaoDeVoz(aoTerminar);
      if (nova && !terminou) {
        sessao.current = nova;
        if (cancelarAoAbrir.current) nova.encerrar();
      }
    } finally {
      abrindo.current = false;
    }
  }, []);

  const encerrar = useCallback(() => {
    if (abrindo.current) cancelarAoAbrir.current = true;
    sessao.current?.encerrar();
  }, []);

  return { estado, ativa, fim, iniciar, encerrar };
}
