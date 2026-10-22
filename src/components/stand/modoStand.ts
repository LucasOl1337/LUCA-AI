/**
 * Modo do stand: Coruja, Site, Vitrine ou Simulação (grill r1 do totem, Q1–Q6;
 * Site: grill Totem-Site r1, Q5).
 * Puro, com o relógio entrando por parâmetro, pra testar sem timers.
 *
 * Repouso: Coruja na Atração; 60 s sem ninguém → Vitrine em loop; ao fim de
 * cada volta pelos vídeos, sem ninguém, volta pra Coruja. Simulação nunca entra
 * sozinha e, parada 90 s, volta pro repouso depois de 10 s de aviso.
 *
 * Site: uma página do site num iframe, com a coruja no canto e a voz aberta.
 * Só existe com página aberta (pela voz, `abrir_pagina`); a barra só o mostra
 * nesse caso. PS, `voltar_coruja` ou 90 s sem ninguém fecham a página.
 * Troca de modo: barra (toque/mouse) e voz; L1/R1 não trocam mais (21/10).
 */
import type { PaginaSite } from '../../../shared/stand/acoes-site.ts';

export const MODOS = ['coruja', 'site', 'vitrine', 'simulacao'] as const;
export type Modo = (typeof MODOS)[number];

export const ROTULO_MODO: Record<Modo, string> = { coruja: 'Coruja', site: 'Site', vitrine: 'Vitrine', simulacao: 'Simulação' };

/** Modos que a barra oferece agora: Site só com página aberta. */
export function modosDisponiveis(estado: Pick<EstadoModo, 'pagina'>): readonly Modo[] {
  return estado.pagina ? MODOS : MODOS.filter((m) => m !== 'site');
}

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
  /** Página do site aberta no modo Site (fica guardada se a barra passar pra outro modo). */
  pagina: PaginaSite | null;
}

export type EntradaModo =
  | { tipo: 'ir'; modo: Modo }
  | { tipo: 'atividade'; toque?: boolean }
  | { tipo: 'trocar_video'; direcao: 1 | -1 }
  | { tipo: 'pausar' }
  | { tipo: 'video_terminou' }
  /** Ação da voz: abre a página no modo Site (ou troca a que está aberta). */
  | { tipo: 'abrir_pagina'; pagina: PaginaSite }
  /** Ação da voz: fecha a página e volta pra Coruja. */
  | { tipo: 'voltar_coruja' }
  /**
   * `corujaOcupada`: a Coruja está em conversa ou vídeo, não em repouso.
   * `falando`: a IA está pensando ou falando (segura o modo Site).
   */
  | { tipo: 'relogio'; corujaOcupada?: boolean; falando?: boolean };

export function modoInicial(agora: number): EstadoModo {
  // A barra só acende com toque: na abertura a Atração fica limpa.
  return { modo: 'coruja', marco: agora, video: 0, pausado: false, barraAte: agora, pagina: null };
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
      // PS e a Coruja da barra fecham a página (solta a webcam da sonolência).
      if (entrada.modo === 'coruja') return { ...atual, modo: 'coruja', marco: agora, pausado: false, pagina: null };
      if (entrada.modo === 'site' && !atual.pagina) return { ...atual, marco: agora };
      if (entrada.modo === atual.modo) return { ...atual, marco: agora };
      return { ...atual, modo: entrada.modo, marco: agora, pausado: false };
    case 'abrir_pagina':
      return { ...atual, modo: 'site', pagina: entrada.pagina, marco: agora, pausado: false };
    case 'voltar_coruja':
      return { ...atual, modo: 'coruja', pagina: null, marco: agora, pausado: false };
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
      if (deuVolta && agora - atual.marco >= REPOUSO_MS) return { ...atual, modo: 'coruja', video: 0, marco: agora, pagina: null };
      return { ...atual, video: indice };
    }
    case 'relogio': {
      const parado = agora - atual.marco;
      if (atual.modo === 'coruja') {
        if (entrada.corujaOcupada || parado < REPOUSO_MS) return atual;
        return { ...atual, modo: 'vitrine', video: 0, pausado: false, marco: agora, pagina: null };
      }
      if (atual.modo === 'site') {
        // A coruja narrando a página é gente na frente do totem.
        if (entrada.falando) return { ...atual, marco: agora };
        if (parado < SIMULACAO_PARADA_MS) return atual;
        return { ...atual, modo: 'coruja', marco: agora, pagina: null };
      }
      if (atual.modo === 'simulacao') {
        if (parado < SIMULACAO_PARADA_MS) return atual;
        return { ...atual, modo: 'coruja', marco: agora, pagina: null };
      }
      // Vitrine pausada por alguém que foi embora volta a tocar.
      if (atual.pausado && parado >= REPOUSO_MS) return { ...atual, pausado: false };
      return atual;
    }
  }
}

/** Segundos até a Simulação ou o Site parados voltarem pro repouso, só durante o aviso; senão null. */
export function avisoDeSaida(estado: EstadoModo, agora: number): number | null {
  if (estado.modo !== 'simulacao' && estado.modo !== 'site') return null;
  const resta = SIMULACAO_PARADA_MS - (agora - estado.marco);
  if (resta > AVISO_SIMULACAO_MS || resta <= 0) return null;
  return Math.ceil(resta / 1000);
}

/**
 * A barra de modos fica sempre na tela (grill Totem interativo r1, Q6): o
 * primeiro toque já executa, não só revela a barra. `barraAte` segue marcando
 * o último toque (destaque visual), sem esconder nada.
 */
export function barraVisivel(_estado: EstadoModo, _agora: number): boolean {
  return true;
}
