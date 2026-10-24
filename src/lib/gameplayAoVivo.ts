import { useSyncExternalStore } from 'react';
import type { EstadoGameplay } from '@/components/gameplay/estadoGameplay';
import type { SonoCabine } from '@/components/gameplay/sonoCabine';

/**
 * Gameplay ao vivo (inventário #3): o totem manda o retrato pelo /ws e o
 * tablet do operador, na mesma conta, recebe. O provider do /ws liga o
 * transporte; quem joga só chama `enviar`, quem assiste lê `useRetratoAoVivo`.
 * Fica fora do LucaContext para os 4 Hz não re-renderizarem o app inteiro.
 */
export const TIPO_RETRATO = 'gameplay:retrato';
/** Abaixo dos 5 Hz do servidor com folga para o jitter do rAF. */
export const ENVIO_INTERVALO_MS = 250;
/** Sem retrato há mais que isso: o tablet mostra "sem sinal". */
export const SEM_SINAL_MS = 2000;
/**
 * Aba do totem oculta: o rAF para e não chega retrato novo. O tablet mostra
 * "jogo pausado" em vez de "sem sinal" por até 15 min (o totem não manda
 * pulso escondido, o Chrome estrangula timers); depois disso, "sem sinal".
 */
export const PAUSADO_MAX_MS = 15 * 60_000;

/** Experiência do Gameplay no totem: diz ao tablet quais obstáculos do mapa valem (fardos e estacas só existem no circuito). */
export type CenarioAoVivo = 'circuito' | 'desafios' | 'percurso';
export const CENARIOS_AO_VIVO: readonly CenarioAoVivo[] = ['circuito', 'desafios', 'percurso'];
/**
 * Corrida do circuito congelada com a aba visível: menu de pausa ou resultado na tela.
 * O motor não roda nesses estados; o totem segue mandando o retrato parado com o motivo,
 * para o tablet dizer "pausado" e não "sem dados" (pedido do Linz, 24/10: 852 s sem sinal).
 */
export type PausaAoVivo = 'menu' | 'resultado';
export const PAUSAS_AO_VIVO: readonly PausaAoVivo[] = ['menu', 'resultado'];

/** `sono` só existe com a webcam da cabine ligada (`/gameplay?webcam=1`). */
export interface RetratoAoVivo { estado: EstadoGameplay; recebidoEm: number; oculto?: boolean; sono?: SonoCabine; cenario?: CenarioAoVivo; pausa?: PausaAoVivo }
export type SinalAoVivo = { nivel: 'aguardando' } | { nivel: 'ao-vivo' }
  | { nivel: 'pausado'; segundos: number; motivo: 'aba' | PausaAoVivo } | { nivel: 'sem-sinal'; segundos: number };

/** Puro: o que o selo do tablet diz agora. */
export function sinalAoVivo(ultimo: RetratoAoVivo | null, agora: number): SinalAoVivo {
  if (!ultimo) return { nivel: 'aguardando' };
  const idade = agora - ultimo.recebidoEm;
  const segundos = Math.floor(Math.max(0, idade) / 1000);
  if (ultimo.oculto && idade <= PAUSADO_MAX_MS) return { nivel: 'pausado', segundos, motivo: 'aba' };
  if (idade > SEM_SINAL_MS) return { nivel: 'sem-sinal', segundos };
  // Menu/resultado chegam a 4 Hz: parou de chegar, vira "sem dados" como qualquer retrato.
  return ultimo.pausa ? { nivel: 'pausado', segundos, motivo: ultimo.pausa } : { nivel: 'ao-vivo' };
}

export function criarAoVivo(agora: () => number = Date.now, agendar: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms)) {
  let transporte: ((texto: string) => void) | null = null;
  let ultimoEnvio = -Infinity;
  let ultimo: RetratoAoVivo | null = null;
  let oculto = false;
  let ultimoEstado: EstadoGameplay | null = null;
  let sono: SonoCabine | null = null;
  let cenario: CenarioAoVivo | null = null;
  let pausa: PausaAoVivo | null = null;
  let agendado = false;
  const assinantes = new Set<() => void>();
  const mandar = (estado: EstadoGameplay) => {
    if (!transporte) return false;
    ultimoEnvio = agora();
    try { transporte(JSON.stringify({ kind: TIPO_RETRATO, estado, ...(oculto ? { oculto: true } : {}), ...(sono ? { sono } : {}), ...(cenario ? { cenario } : {}), ...(pausa ? { pausa } : {}) })); } catch { return false; }
    return true;
  };
  return {
    /** O provider do /ws liga na abertura e desliga (null) no fechamento. */
    ligar(enviar: ((texto: string) => void) | null) { transporte = enviar; },
    /** Totem: no máximo um retrato a cada ENVIO_INTERVALO_MS; sem /ws, não faz nada. */
    enviar(estado: EstadoGameplay) {
      ultimoEstado = estado;
      if (!transporte || agora() - ultimoEnvio < ENVIO_INTERVALO_MS) return false;
      return mandar(estado);
    },
    /** Totem: a aba sumiu ou voltou. Avisa já com o último retrato, respeitando o intervalo. */
    marcarOculto(valor: boolean) {
      if (valor === oculto) return;
      oculto = valor;
      if (!ultimoEstado || agendado) return;
      const falta = ENVIO_INTERVALO_MS - (agora() - ultimoEnvio);
      if (falta <= 0) { mandar(ultimoEstado); return; }
      agendado = true;
      agendar(() => { agendado = false; if (ultimoEstado) mandar(ultimoEstado); }, falta);
    },
    /** Totem: leitura da webcam de sonolência; vai junto no próximo retrato (o motor manda a 4 Hz). `null` = webcam desligada. */
    marcarSono(valor: SonoCabine | null) { sono = valor; },
    /** Totem: qual experiência roda; vai em todo retrato. */
    marcarCenario(valor: CenarioAoVivo | null) { cenario = valor; },
    /** Totem: corrida congelada (menu/resultado) ou `null` rodando; vai no próximo retrato. */
    marcarPausa(valor: PausaAoVivo | null) { pausa = valor; },
    /** Totem: o gameplay desmontou; nada de reenviar retrato velho depois. */
    esquecer() { ultimoEstado = null; oculto = false; sono = null; cenario = null; pausa = null; },
    /** Tablet: `idadeMs` vem do servidor (o retrato guardado pode ter alguns segundos). */
    receber(estado: EstadoGameplay, idadeMs = 0, ocultoNoTotem = false, sonoNoTotem: SonoCabine | null = null, extra: { cenario?: unknown; pausa?: unknown } = {}) {
      const cenarioNoTotem = CENARIOS_AO_VIVO.find((c) => c === extra.cenario);
      const pausaNoTotem = PAUSAS_AO_VIVO.find((p) => p === extra.pausa);
      ultimo = { estado, recebidoEm: agora() - Math.max(0, idadeMs), ...(ocultoNoTotem ? { oculto: true } : {}), ...(sonoNoTotem ? { sono: sonoNoTotem } : {}), ...(cenarioNoTotem ? { cenario: cenarioNoTotem } : {}), ...(pausaNoTotem ? { pausa: pausaNoTotem } : {}) };
      for (const fn of [...assinantes]) fn();
    },
    ler: () => ultimo,
    assinar(fn: () => void) { assinantes.add(fn); return () => { assinantes.delete(fn); }; },
  };
}

export const aoVivo = criarAoVivo();

export function useRetratoAoVivo(): RetratoAoVivo | null {
  return useSyncExternalStore(aoVivo.assinar, aoVivo.ler, () => null);
}
