/**
 * Modo do stand: Coruja, Vitrine ou Simulação (grill r1 do totem, Q1–Q6).
 * Puro, com o relógio entrando por parâmetro, pra testar sem timers.
 *
 * Repouso: Coruja na Atração; 60 s sem ninguém → Vitrine em loop; ao fim de
 * cada volta pelos vídeos, sem ninguém, volta pra Coruja. Simulação nunca entra
 * sozinha e, parada 90 s, volta pro repouso depois de 10 s de aviso.
 */

export const MODOS = ['coruja', 'vitrine', 'simulacao'] as const;
export type Modo = (typeof MODOS)[number];

export const ROTULO_MODO: Record<Modo, string> = { coruja: 'Coruja', vitrine: 'Vitrine', simulacao: 'Simulação' };

export const REPOUSO_MS = 60_000;
export const SIMULACAO_PARADA_MS = 90_000;
export const AVISO_SIMULACAO_MS = 10_000;
export const BARRA_MS = 5_000;

export interface EstadoModo {
  modo: Modo;
  /** Último toque, botão, tecla ou voz; também marca as trocas automáticas. */
  marco: number;
  /** Item da Vitrine (índice na lista de `vitrineStand.montarItens`: vídeos e Telas do app). */
  video: number;
  pausado: boolean;
  /** A barra de modos aparece até este instante (ms). */
  barraAte: number;
}

export type EntradaModo =
  | { tipo: 'ir'; modo: Modo }
  | { tipo: 'passo'; direcao: 1 | -1 }
  | { tipo: 'atividade'; toque?: boolean }
  | { tipo: 'trocar_video'; direcao: 1 | -1 }
  | { tipo: 'pausar' }
  | { tipo: 'video_terminou' }
  /** `corujaOcupada`: a Coruja está em conversa ou vídeo, não em repouso. */
  | { tipo: 'relogio'; corujaOcupada?: boolean };

export function modoInicial(agora: number): EstadoModo {
  // A barra só acende com toque: na abertura a Atração fica limpa.
  return { modo: 'coruja', marco: agora, video: 0, pausado: false, barraAte: agora };
}

const girar = (indice: number, passo: number, total: number) => (total > 0 ? (indice + passo + total) % total : 0);

/**
 * Próximo item disponível da Vitrine; pula Tela do app que não está pronta.
 * `deuVolta`: andando pra frente, passou do último item (fim de uma volta).
 */
export function proximoItem(indice: number, direcao: 1 | -1, disponivel: readonly boolean[]): { indice: number; deuVolta: boolean } {
  const total = disponivel.length;
  let i = indice;
  let deuVolta = false;
  for (let n = 0; n < total; n += 1) {
    const seguinte = girar(i, direcao, total);
    if (direcao === 1 && seguinte <= i) deuVolta = true;
    i = seguinte;
    if (disponivel[i]) return { indice: i, deuVolta };
  }
  return { indice: 0, deuVolta: true };
}

const mascara = (itens: number | readonly boolean[]): readonly boolean[] => (typeof itens === 'number' ? Array.from({ length: itens }, () => true) : itens);

/**
 * `itens`: quantos itens a Vitrine tem (todos prontos) ou quais estão prontos agora.
 * Com zero itens a Vitrine fica parada.
 */
export function reduzirModo(atual: EstadoModo, entrada: EntradaModo, agora: number, itens: number | readonly boolean[]): EstadoModo {
  const disponivel = mascara(itens);
  switch (entrada.tipo) {
    case 'ir':
      if (entrada.modo === atual.modo) return { ...atual, marco: agora };
      return { ...atual, modo: entrada.modo, marco: agora, pausado: false };
    case 'passo': {
      const indice = MODOS.indexOf(atual.modo);
      return { ...atual, modo: MODOS[girar(indice, entrada.direcao, MODOS.length)], marco: agora, pausado: false };
    }
    case 'atividade':
      return { ...atual, marco: agora, barraAte: entrada.toque ? agora + BARRA_MS : atual.barraAte };
    case 'trocar_video':
      if (atual.modo !== 'vitrine') return { ...atual, marco: agora };
      return { ...atual, video: proximoItem(atual.video, entrada.direcao, disponivel).indice, pausado: false, marco: agora };
    case 'pausar':
      if (atual.modo !== 'vitrine') return { ...atual, marco: agora };
      return { ...atual, pausado: !atual.pausado, marco: agora };
    case 'video_terminou': {
      if (atual.modo !== 'vitrine') return atual;
      const { indice, deuVolta } = proximoItem(atual.video, 1, disponivel);
      // Sem ninguém por perto, cada volta completa devolve o monitor à Coruja.
      if (deuVolta && agora - atual.marco >= REPOUSO_MS) return { ...atual, modo: 'coruja', video: 0, marco: agora };
      return { ...atual, video: indice };
    }
    case 'relogio': {
      const parado = agora - atual.marco;
      if (atual.modo === 'coruja') {
        if (entrada.corujaOcupada || parado < REPOUSO_MS) return atual;
        return { ...atual, modo: 'vitrine', video: 0, pausado: false, marco: agora };
      }
      if (atual.modo === 'simulacao') {
        if (parado < SIMULACAO_PARADA_MS) return atual;
        return { ...atual, modo: 'coruja', marco: agora };
      }
      // Vitrine pausada por alguém que foi embora volta a tocar.
      if (atual.pausado && parado >= REPOUSO_MS) return { ...atual, pausado: false };
      return atual;
    }
  }
}

/** Segundos até a Simulação parada voltar pro repouso, só durante o aviso; senão null. */
export function avisoDeSaida(estado: EstadoModo, agora: number): number | null {
  if (estado.modo !== 'simulacao') return null;
  const resta = SIMULACAO_PARADA_MS - (agora - estado.marco);
  if (resta > AVISO_SIMULACAO_MS || resta <= 0) return null;
  return Math.ceil(resta / 1000);
}

export function barraVisivel(estado: EstadoModo, agora: number): boolean {
  return agora < estado.barraAte;
}
