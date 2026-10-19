import { useCallback, useEffect, useRef, useState } from 'react';
import type { EstadoStand } from '../../shared/stand/eventos.ts';
import { assinarEventosCerebro } from './barramento';
import { abrirSessaoDeVoz } from './abrirSessao';
import type { FimSessao, SessaoDeVoz } from './sessaoVoz';

/**
 * Do toque até a sessão pronta (microfone + WebSocket do provedor). Passou
 * disso, a sessão cai com `erro` e detalhe `sem_conexao_<etapa>`, e a página
 * vai para o modo sem voz: nunca fica presa em "Ligando o microfone…".
 */
export const PRAZO_CONEXAO_MS = 8000;

/** `naAbertura`: caiu antes de ficar pronta (microfone, worklet, WebSocket ou prazo). */
export interface FimDeSessao { motivo: FimSessao; detalhe?: string; em: number; naAbertura: boolean }

export interface UsoSessaoVoz {
  estado: EstadoStand;
  ativa: boolean;
  /** Último motivo de fim: 'desligado' quando o servidor está sem credencial. */
  fim: FimDeSessao | null;
  iniciar: () => Promise<void>;
  encerrar: () => void;
}

/** Hook para a página do stand (M2): liga e desliga a conversa por voz. */
export function useSessaoVoz({ prazoConexaoMs = PRAZO_CONEXAO_MS } = {}): UsoSessaoVoz {
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
    let aberta: SessaoDeVoz | null = null;
    const aoTerminar = (motivo: FimSessao, detalhe?: string) => {
      if (terminou) return;
      terminou = true;
      window.clearTimeout(prazo);
      sessao.current = null;
      setAtiva(false);
      setFim({ motivo, detalhe, em: Date.now(), naAbertura: aberta?.etapa !== 'pronta' });
    };
    const prazo = window.setTimeout(() => {
      if (terminou) return;
      if (!aberta) {
        // Ainda no POST /api/stand/sessao: a sessão que chegar depois já nasce encerrada.
        cancelarAoAbrir.current = true;
        aoTerminar('erro', 'sem_conexao_sessao');
      } else if (aberta.etapa !== 'pronta') {
        aberta.encerrar('erro', `sem_conexao_${aberta.etapa}`);
      }
    }, prazoConexaoMs);
    try {
      const nova = await abrirSessaoDeVoz((motivo, detalhe) => aoTerminar(motivo, detalhe));
      aberta = nova;
      if (nova && terminou) nova.encerrar();
      if (nova && !terminou) {
        sessao.current = nova;
        if (cancelarAoAbrir.current) nova.encerrar();
        else if (nova.etapa === 'pronta') window.clearTimeout(prazo);
      }
    } finally {
      abrindo.current = false;
    }
  }, [prazoConexaoMs]);

  const encerrar = useCallback(() => {
    if (abrindo.current) cancelarAoAbrir.current = true;
    sessao.current?.encerrar();
  }, []);

  return { estado, ativa, fim, iniciar, encerrar };
}
