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

/** `sono` só existe com a webcam da cabine ligada (`/gameplay?webcam=1`). */
export interface RetratoAoVivo { estado: EstadoGameplay; recebidoEm: number; oculto?: boolean; sono?: SonoCabine }
export type SinalAoVivo = { nivel: 'aguardando' } | { nivel: 'ao-vivo' } | { nivel: 'pausado'; segundos: number } | { nivel: 'sem-sinal'; segundos: number };

/** Puro: o que o selo do tablet diz agora. */
export function sinalAoVivo(ultimo: RetratoAoVivo | null, agora: number): SinalAoVivo {
  if (!ultimo) return { nivel: 'aguardando' };
  const idade = agora - ultimo.recebidoEm;
  if (ultimo.oculto && idade <= PAUSADO_MAX_MS) return { nivel: 'pausado', segundos: Math.floor(Math.max(0, idade) / 1000) };
  return idade <= SEM_SINAL_MS ? { nivel: 'ao-vivo' } : { nivel: 'sem-sinal', segundos: Math.floor(idade / 1000) };
}

export function criarAoVivo(agora: () => number = Date.now, agendar: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms)) {
  let transporte: ((texto: string) => void) | null = null;
  let ultimoEnvio = -Infinity;
  let ultimo: RetratoAoVivo | null = null;
  let oculto = false;
  let ultimoEstado: EstadoGameplay | null = null;
  let sono: SonoCabine | null = null;
  let agendado = false;
  const assinantes = new Set<() => void>();
  const mandar = (estado: EstadoGameplay) => {
    if (!transporte) return false;
    ultimoEnvio = agora();
    try { transporte(JSON.stringify({ kind: TIPO_RETRATO, estado, ...(oculto ? { oculto: true } : {}), ...(sono ? { sono } : {}) })); } catch { return false; }
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
    /** Totem: o gameplay desmontou; nada de reenviar retrato velho depois. */
    esquecer() { ultimoEstado = null; oculto = false; sono = null; },
    /** Tablet: `idadeMs` vem do servidor (o retrato guardado pode ter alguns segundos). */
    receber(estado: EstadoGameplay, idadeMs = 0, ocultoNoTotem = false, sonoNoTotem: SonoCabine | null = null) {
      ultimo = { estado, recebidoEm: agora() - Math.max(0, idadeMs), ...(ocultoNoTotem ? { oculto: true } : {}), ...(sonoNoTotem ? { sono: sonoNoTotem } : {}) };
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
