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
 *
 * Palco (Lucas, 24/10: "como se ele fosse alguém dentro do monitor. Sem texto
 * em volta. Principalmente se ele tiver AFK"): sub-estado da Coruja com só a
 * coruja em tela inteira. Entra sozinho após `palcoAfkMs` sem ninguém (padrão
 * `PALCO_AFK_MS`) ou de propósito (botão "Tela cheia", tecla F). Sai com
 * qualquer atividade: toque, tecla, controle, voz ou rosto chegando. Com o
 * palco ligado ele é o repouso: a Coruja não cai mais sozinha na Vitrine
 * (Vitrine segue pelo botão e pela voz). `palcoAfkMs: null` mantém o repouso
 * antigo (Coruja → Vitrine em 60 s), usado no Stand sem login.
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
/** Sem ninguém por este tempo, a Coruja entra no palco (configurável por `?palco=N` segundos). */
export const PALCO_AFK_MS = 45_000;

/** `?palco=N` (segundos) troca o tempo; `?palco=0` desliga o palco por tempo (volta o repouso na Vitrine). */
export function palcoAfkDaUrl(search: string): number | null {
  const bruto = new URLSearchParams(search).get('palco');
  if (bruto === null || bruto.trim() === '') return PALCO_AFK_MS;
  const segundos = Number(bruto);
  if (!Number.isFinite(segundos) || segundos < 0) return PALCO_AFK_MS;
  return segundos === 0 ? null : Math.round(segundos * 1000);
}

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
  /** Coruja sozinha em tela inteira (só com `modo === 'coruja'`). */
  palco: boolean;
  /** Tempo sem ninguém até o palco; `null` = repouso antigo na Vitrine. */
  palcoAfkMs: number | null;
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
  /** Botão ou tecla F: liga/desliga o palco (sem `ligado`, alterna). De outro modo, volta pra Coruja já no palco. */
  | { tipo: 'palco'; ligado?: boolean }
  /**
   * `corujaOcupada`: a Coruja está em conversa ou vídeo, não em repouso.
   * `falando`: a IA está pensando ou falando (segura o modo Site).
   */
  | { tipo: 'relogio'; corujaOcupada?: boolean; falando?: boolean };

export function modoInicial(agora: number, { palcoAfkMs = null }: { palcoAfkMs?: number | null } = {}): EstadoModo {
  // A barra só acende com toque: na abertura a Atração fica limpa.
  return { modo: 'coruja', marco: agora, video: 0, pausado: false, barraAte: agora, pagina: null, palco: false, palcoAfkMs };
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
  const novo = passoModo(atual, entrada, agora, mascara(itens));
  // Palco só existe na Coruja: qualquer troca de modo o desliga.
  return novo.palco && novo.modo !== 'coruja' ? { ...novo, palco: false } : novo;
}

function passoModo(atual: EstadoModo, entrada: EntradaModo, agora: number, disponivel: readonly boolean[]): EstadoModo {
  switch (entrada.tipo) {
    case 'ir':
      // PS e a Coruja da barra fecham a página (solta a webcam da sonolência).
      if (entrada.modo === 'coruja') return { ...atual, modo: 'coruja', marco: agora, pausado: false, pagina: null, palco: false };
      if (entrada.modo === 'site' && !atual.pagina) return { ...atual, marco: agora };
      if (entrada.modo === atual.modo) return { ...atual, marco: agora };
      return { ...atual, modo: entrada.modo, marco: agora, pausado: false };
    case 'abrir_pagina':
      return { ...atual, modo: 'site', pagina: entrada.pagina, marco: agora, pausado: false };
    case 'voltar_coruja':
      return { ...atual, modo: 'coruja', pagina: null, marco: agora, pausado: false, palco: false };
    case 'palco': {
      const ligado = entrada.ligado ?? !(atual.modo === 'coruja' && atual.palco);
      if (!ligado) return { ...atual, palco: false, marco: agora };
      return { ...atual, modo: 'coruja', pagina: null, pausado: false, palco: true, marco: agora };
    }
    case 'atividade':
      // Gente na frente (toque, tecla, controle, voz, rosto): o palco sai e a Coruja volta com tudo.
      return { ...atual, palco: false, marco: agora, barraAte: entrada.toque ? agora + BARRA_MS : atual.barraAte };
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
        if (atual.palcoAfkMs !== null) {
          // Palco é o repouso: fica até alguém chegar; não cai na Vitrine.
          if (atual.palco || entrada.corujaOcupada || parado < atual.palcoAfkMs) return atual;
          return { ...atual, palco: true, marco: agora };
        }
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
        // Uma run só termina por chegada/sinistro ou saída explícita, nunca idle.
        return atual;
      }
      // Vitrine pausada por alguém que foi embora volta a tocar.
      if (atual.pausado && parado >= REPOUSO_MS) return { ...atual, pausado: false };
      return atual;
    }
  }
}

/** Segundos até a Simulação ou o Site parados voltarem pro repouso, só durante o aviso; senão null. */
export function avisoDeSaida(estado: EstadoModo, agora: number): number | null {
  if (estado.modo !== 'site') return null;
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
