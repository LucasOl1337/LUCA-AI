import { useSyncExternalStore } from 'react';

/**
 * Leitura da webcam de sonolência dentro da cabine (`/gameplay?webcam=1`,
 * opção do CP3 de 19/10). Quem escreve é o quadro da câmera
 * (WebcamSonoCabine); quem lê é o painel da cabine e o envio ao tablet do
 * operador. `null` = webcam desligada, e aí nada muda no gameplay.
 *
 * É uma leitura SIMULADA de bancada: o Trator MAX real não tem sensor de
 * motorista; a câmera é a do totem.
 */
export type StatusSono = 'unknown' | 'open' | 'closed' | 'alarm';
export interface SonoCabine {
  /** `unknown` = sem rosto; `alarm` = olhos fechados há 1 s ou mais (CLOSED_DURATION_MS). */
  status: StatusSono;
  /** Tempo contínuo de olhos fechados, arredondado a 100 ms. */
  closedMs: number;
}

export const STATUS_SONO: readonly StatusSono[] = ['unknown', 'open', 'closed', 'alarm'];
export const ROTULO_SONO: Record<StatusSono, string> = {
  unknown: 'Posicione o rosto',
  open: 'Olhos abertos',
  closed: 'Olhos fechados',
  alarm: 'Sonolência',
};
/** Texto da faixa vermelha da cabine e do tablet. */
export const ROTULO_ALERTA_SONO = 'Atenção: sinais de sono';

export const segundosSono = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;

export function criarSonoCabine() {
  let atual: SonoCabine | null = null;
  const assinantes = new Set<() => void>();
  return {
    /** Grava a leitura; repetida (mesmo status e mesmo décimo) não avisa ninguém. */
    definir(proxima: SonoCabine | null) {
      const valor = proxima && { status: proxima.status, closedMs: Math.round(Math.max(0, proxima.closedMs) / 100) * 100 };
      if (valor === atual || (valor && atual && valor.status === atual.status && valor.closedMs === atual.closedMs)) return;
      atual = valor;
      for (const fn of [...assinantes]) fn();
    },
    ler: () => atual,
    assinar(fn: () => void) { assinantes.add(fn); return () => { assinantes.delete(fn); }; },
  };
}

export const sonoCabine = criarSonoCabine();

export function useSonoCabine(): SonoCabine | null {
  return useSyncExternalStore(sonoCabine.assinar, sonoCabine.ler, () => null);
}
