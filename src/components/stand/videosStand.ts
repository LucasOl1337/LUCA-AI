import manifesto from '../../../shared/stand/videos.json';
import { CANAL_STAND, type AcaoSiteEvento } from '../../../shared/stand/acoes-site.ts';
import { VIDEOS_STUB } from './canalStub';

/** Vídeos do stand: o manifesto da M7, mais o vídeo de teste do stub. */

export interface VideoStand { titulo: string; arquivo: string }

const DO_MANIFESTO: Record<string, VideoStand> = Object.fromEntries(
  (manifesto as Array<{ id: string; titulo: string; arquivo: string }>).map((v) => [v.id, { titulo: v.titulo, arquivo: v.arquivo }]),
);

export function videoDoStand(id: string, stub: boolean): VideoStand | undefined {
  if (!id) return undefined;
  return (stub ? VIDEOS_STUB[id] : undefined) ?? DO_MANIFESTO[id];
}

/**
 * Repassa `acao_site` ao Executor do stand (M3), aberto noutra janela do app.
 * Quem valida e clica é o executor; aqui só se gera o id de correlação.
 */
export function criarRepasseAcao(): { repassar(acao: string, args: Record<string, unknown>): AcaoSiteEvento | null; fechar(): void } {
  const canal = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CANAL_STAND) : null;
  let n = 0;
  return {
    repassar(acao, args) {
      if (!canal) return null;
      const evento: AcaoSiteEvento = { tipo: 'acao_site', id: `stand-${Date.now()}-${++n}`, acao, args };
      canal.postMessage(evento);
      return evento;
    },
    fechar: () => canal?.close(),
  };
}
