/**
 * Contrato de eventos do stand do trator (dono: M1, cérebro de voz).
 *
 * Cérebro → página (M2): estado, nível de áudio pro lip-sync, legenda,
 * vídeo e ação no site. Página → cérebro: fim de vídeo, reiniciar e encerrar.
 * O canal é um EventTarget local na própria página (`src/stand-voz/`).
 *
 * Arquivo só com sintaxe apagável (tipos + funções puras), para o servidor
 * e os testes `node --test` importarem direto, sem build.
 */

export type EstadoStand = 'ocioso' | 'ouvindo' | 'pensando' | 'falando';

export const ESTADOS_STAND: readonly EstadoStand[] = ['ocioso', 'ouvindo', 'pensando', 'falando'];

/** Cérebro → página. */
export type EventoCerebro =
  | { tipo: 'estado'; valor: EstadoStand }
  /** RMS normalizado 0..1 da voz da IA, ~30 Hz. */
  | { tipo: 'nivel_audio'; valor: number }
  /** Frase corrente inteira; substitui a anterior (sem delta acumulado). */
  | { tipo: 'legenda'; texto: string }
  | { tipo: 'tocar_video'; id: string }
  /** Ação no site; `acao` e `args` seguem `shared/stand/acoes-site.ts` (M3). */
  | { tipo: 'acao_site'; acao: string; args: Record<string, unknown> };

/** Página → cérebro. */
export type EventoPagina =
  | { tipo: 'video_terminou'; id: string }
  | { tipo: 'reiniciar' }
  | { tipo: 'encerrar' }
  /** O que a tela fez e mostra depois de uma Ação do site; vai como `Tela:` na próxima pergunta. */
  | { tipo: 'tela'; texto: string }
  /** A Ação do site falhou na tela: a coruja diz isso na hora, com fala pronta. */
  | { tipo: 'acao_falhou' };

export type EventoStand = EventoCerebro | EventoPagina;

function objeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function textoNaoVazio(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim().length > 0;
}

export function ehEventoCerebro(valor: unknown): valor is EventoCerebro {
  if (!objeto(valor)) return false;
  switch (valor.tipo) {
    case 'estado':
      return ESTADOS_STAND.includes(valor.valor as EstadoStand);
    case 'nivel_audio':
      return typeof valor.valor === 'number' && valor.valor >= 0 && valor.valor <= 1;
    case 'legenda':
      return typeof valor.texto === 'string';
    case 'tocar_video':
      return textoNaoVazio(valor.id);
    case 'acao_site':
      return textoNaoVazio(valor.acao) && objeto(valor.args);
    default:
      return false;
  }
}

export function ehEventoPagina(valor: unknown): valor is EventoPagina {
  if (!objeto(valor)) return false;
  if (valor.tipo === 'video_terminou') return textoNaoVazio(valor.id);
  if (valor.tipo === 'tela') return typeof valor.texto === 'string';
  return valor.tipo === 'reiniciar' || valor.tipo === 'encerrar' || valor.tipo === 'acao_falhou';
}

export function ehEventoStand(valor: unknown): valor is EventoStand {
  return ehEventoCerebro(valor) || ehEventoPagina(valor);
}
