import type { EstadoVoz, EventoStand } from './canal';

/**
 * Qual tela o monitor do trator mostra. Regra combinada (Q4, r1):
 * - `tocar_video` → Vídeo; ao terminar ou pular, volta para Conversa.
 * - ouvindo/pensando/falando → Conversa.
 * - ocioso só leva à Atração depois de 10 s seguidos.
 * - Durante o vídeo, estado e legenda são guardados sem trocar a tela.
 */

export type Tela = 'atracao' | 'conversa' | 'video';

export interface EstadoTela {
  tela: Tela;
  voz: EstadoVoz;
  legenda: string;
  videoId: string;
  /** Desde quando a voz está ociosa (ms), ou null se não está. */
  ociosoDesde: number | null;
}

export type EntradaTela =
  | EventoStand
  | { tipo: 'video_terminou' }
  | { tipo: 'encerrar' }
  | { tipo: 'reiniciar' }
  | { tipo: 'relogio' };

export const OCIOSO_PARA_ATRACAO_MS = 10_000;

export function telaInicial(): EstadoTela {
  return { tela: 'atracao', voz: 'ocioso', legenda: '', videoId: '', ociosoDesde: null };
}

export function reduzirTela(atual: EstadoTela, entrada: EntradaTela, agora: number): EstadoTela {
  switch (entrada.tipo) {
    case 'estado': {
      const voz = entrada.valor;
      const ociosoDesde = voz === 'ocioso' ? atual.ociosoDesde ?? agora : null;
      if (atual.tela === 'video' || voz === 'ocioso') return { ...atual, voz, ociosoDesde };
      return { ...atual, tela: 'conversa', voz, ociosoDesde };
    }
    case 'legenda':
      return atual.legenda === entrada.texto ? atual : { ...atual, legenda: entrada.texto };
    case 'tocar_video':
      return { ...atual, tela: 'video', videoId: entrada.id };
    case 'video_terminou':
      if (atual.tela !== 'video') return atual;
      return { ...atual, tela: 'conversa', videoId: '', ociosoDesde: atual.voz === 'ocioso' ? agora : null };
    case 'encerrar':
      return telaInicial();
    case 'reiniciar':
      return { ...telaInicial(), tela: 'conversa', ociosoDesde: agora };
    case 'relogio':
      if (atual.tela !== 'conversa' || atual.ociosoDesde === null) return atual;
      if (agora - atual.ociosoDesde < OCIOSO_PARA_ATRACAO_MS) return atual;
      return telaInicial();
    case 'nivel_audio':
    case 'acao_site':
      return atual;
  }
}
