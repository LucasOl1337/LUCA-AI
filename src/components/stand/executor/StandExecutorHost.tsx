/**
 * Executor do stand: só existe numa página do site aberta dentro do iframe do
 * `/stand` (grill Totem-Site r1, Q3). Escuta o BroadcastChannel do stand,
 * valida de novo cada Ação do site, executa uma por vez e devolve o resultado
 * pelo mesmo canal. Fora do frame (inclusive na janela de cima) não liga.
 */
import { useEffect, useRef } from 'react';
import {
  CANAL_STAND,
  validarAcaoSite,
  type AcaoSiteEvento,
  type AcaoSiteResultado,
} from '../../../../shared/stand/acoes-site.ts';
import { destacar, mostrarRotulo } from './cursor';
import { FalhaAcao, criarPassos } from './passos';
import { EMBUTIDO_NO_STAND } from './embutido';
import { responderPing } from './prontidao';
import { idDoStandPai, mensagemDoMeuStand } from './escopo';
import { leitorDoDocumento, retratoDaPagina } from './retrato';
import './executor.css';

const STAND_LIGADO = EMBUTIDO_NO_STAND;

function ehEvento(valor: unknown): valor is AcaoSiteEvento {
  if (typeof valor !== 'object' || valor === null) return false;
  const evento = valor as Record<string, unknown>;
  return evento.tipo === 'acao_site' && typeof evento.id === 'string';
}

export default function StandExecutorHost() {
  if (!STAND_LIGADO) return null;
  return <StandExecutor />;
}

function StandExecutor() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const anelRef = useRef<HTMLDivElement>(null);
  const rotuloRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const els = { cursor: cursorRef.current!, anel: anelRef.current!, rotulo: rotuloRef.current! };
    const canal = new BroadcastChannel(CANAL_STAND);
    const executar = criarPassos(els);
    let fila = Promise.resolve();
    let vivo = true;
    const meuStand = idDoStandPai();

    const responder = (resultado: Omit<AcaoSiteResultado, 'tipo'>) => {
      if (!vivo) return;
      const retrato = retratoDaPagina(window.location.pathname, leitorDoDocumento(document));
      canal.postMessage({ tipo: 'acao_site_resultado', ...resultado, retrato, ...(meuStand ? { stand: meuStand } : {}) } satisfies AcaoSiteResultado);
    };

    canal.onmessage = (mensagem) => {
      const evento = mensagem.data;
      if (responderPing(canal, evento, window.location.pathname, () => retratoDaPagina(window.location.pathname, leitorDoDocumento(document)), meuStand)) return;
      if (!ehEvento(evento) || !mensagemDoMeuStand(evento, meuStand)) return;
      fila = fila.then(async () => {
        const validado = validarAcaoSite(evento.acao, evento.args);
        if (!validado.ok) {
          responder({ id: evento.id, ok: false, mensagem: validado.motivo });
          return;
        }
        try {
          responder({ id: evento.id, ok: true, mensagem: await executar(validado) });
        } catch (erro) {
          const texto = erro instanceof FalhaAcao ? erro.message : 'A ação falhou na tela.';
          responder({ id: evento.id, ok: false, mensagem: texto });
        } finally {
          window.setTimeout(() => {
            destacar(els.anel, null);
            mostrarRotulo(els.rotulo, '');
          }, 900);
        }
      });
    };

    return () => {
      vivo = false;
      canal.close();
    };
  }, []);

  return (
    <div className="stand-executor" aria-hidden="true" data-stand-executor>
      <div ref={anelRef} className="stand-executor-anel" />
      <div ref={rotuloRef} className="stand-executor-rotulo" />
      <div ref={cursorRef} className="stand-executor-cursor">
        <svg viewBox="0 0 32 32" width="44" height="44">
          <path d="M4 2 L4 26 L10.5 20 L15 30 L19.5 28 L15 18.5 L24 18.5 Z" fill="#fff" stroke="#0a1222" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}
