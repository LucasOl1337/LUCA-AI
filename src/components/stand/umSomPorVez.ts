import type { CanalStand } from './canal';
import { sonoCabine as sonoDaCabine } from '../gameplay/sonoCabine';
import { somCompartilhado, type SomCompartilhado } from '../gameplay/somCompartilhado';

type LeituraSono = Pick<typeof sonoDaCabine, 'ler' | 'assinar'>;

/**
 * Um som por vez no Totem (Lucas, 23/10: "tem alguma coisa no sistema que às
 * vezes faz sobreposição de som, e isso tá terrível"):
 * - Coruja falando: bipes e tons da cabine ficam mudos e voltam quando ela
 *   termina. A voz nunca é abaixada; quem espera é o efeito.
 * - Alarme de sono (olhos fechados há 1 s na Simulação): corta a fala da Coruja
 *   e toca sozinho; desligado, ela volta a ouvir.
 */
export function ligarUmSomPorVez(canal: CanalStand, { som = somCompartilhado, sono = sonoDaCabine }: { som?: SomCompartilhado; sono?: LeituraSono } = {}): () => void {
  let alarme = false;
  const soltarEstado = canal.assinar((evento) => {
    if (evento.tipo === 'estado') som.segurar?.(evento.valor === 'falando' && !alarme);
  });
  const soltarSono = sono.assinar(() => {
    const agora = sono.ler()?.status === 'alarm';
    if (agora === alarme) return;
    alarme = agora;
    if (agora) som.segurar?.(false);
    canal.enviar({ tipo: 'alarme_sono', ativo: agora });
  });
  return () => {
    soltarEstado();
    soltarSono();
    som.segurar?.(false);
    if (alarme) canal.enviar({ tipo: 'alarme_sono', ativo: false });
  };
}
