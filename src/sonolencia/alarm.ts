import { agendarRajada, ALARMES, type Rajada } from '../components/gameplay/timbreAlarme';

/**
 * Alarme de fadiga do /sonolencia: o mesmo som da cabine (`ALARMES.sono`, dois
 * tons alternados de buzzer), repetido sem pausa enquanto os olhos ficam
 * fechados. Web Audio liberado no clique; nada de microfone nem download.
 * Contexto próprio: esta página roda sozinha ou no iframe do Totem.
 */
export class DrowsinessAlarm {
  private context = new AudioContext();
  private timer: ReturnType<typeof setInterval> | undefined;
  private ativas = new Set<Rajada>();
  async unlock() {
    await this.context.resume();
    if (this.context.state !== 'running') throw new Error('Ative o áudio do navegador e tente novamente.');
  }
  get available() { return this.context.state === 'running'; }
  private pulse = () => {
    if (this.context.state !== 'running') return;
    const r = agendarRajada(this.context, ALARMES.sono, this.context.destination);
    this.ativas.add(r);
    const fim = r.fonte.onended;
    r.fonte.onended = (ev) => { this.ativas.delete(r); fim?.call(r.fonte, ev); };
  };
  start() {
    if (this.timer !== undefined) return;
    this.pulse();
    this.timer = setInterval(this.pulse, ALARMES.sono.periodoMs);
  }
  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
    for (const r of this.ativas) r.parar();
    this.ativas.clear();
  }
  close() {
    this.stop();
    void this.context.close().catch(() => {});
  }
}
