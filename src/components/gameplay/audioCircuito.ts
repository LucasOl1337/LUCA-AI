import type { EstadoGameplay } from './estadoGameplay';
import { riscosCircuito, type SensorCircuito } from './circuito';
import { somCompartilhado, type SomCompartilhado } from './somCompartilhado';

/** Tons curtos por exposição, nunca um oscilador contínuo. A mesma classificação
 * alimenta registro, avisos, mapa e áudio. Limites são didáticos, não físicos. */
export const TONS_CIRCUITO: Record<SensorCircuito, number> = { feno: 880, encosta: 660, agua: 990, sonolencia: 520 };
export function criarAudioCircuito(som: SomCompartilhado = somCompartilhado) {
  const exposicoes = new Map<SensorCircuito, { nivel: string; ultimo: number; ausente: number | null }>();
  const ativos = new Set<OscillatorNode>();
  let habilitado = true;
  const parar = () => { for (const o of ativos) { try { o.stop(); } catch { /* já encerrado */ } o.disconnect(); } ativos.clear(); };
  const tocar = (hz: number, critico: boolean) => {
    const ctx = som.obter();
    if (!ctx || ctx.state !== 'running') return false;
    const osc = ctx.createOscillator(), ganho = ctx.createGain(), t = ctx.currentTime;
    osc.type = 'sine'; osc.frequency.setValueAtTime(hz, t);
    if (critico) osc.frequency.linearRampToValueAtTime(hz * 1.35, t + .13);
    ganho.gain.setValueAtTime(0, t); ganho.gain.linearRampToValueAtTime(.12, t + .012);
    ganho.gain.exponentialRampToValueAtTime(.001, t + .17); ganho.gain.setValueAtTime(0, t + .19);
    osc.connect(ganho).connect(ctx.destination); ativos.add(osc);
    osc.onended = () => { ativos.delete(osc); osc.disconnect(); ganho.disconnect(); };
    osc.start(t); osc.stop(t + .2); return true;
  };
  return {
    liberar: () => som.destravar(),
    habilitar(ligado: boolean) { habilitado = ligado; if (!ligado) parar(); },
    parar,
    atualizar(e: EstadoGameplay, agoraMs: number, pausado = false, sono = false) {
      if (!habilitado || pausado || e.fase === 'fim') { parar(); return; }
      const riscos = riscosCircuito(e, sono);
      for (const [sensor, exp] of exposicoes) {
        if (riscos.has(sensor)) continue;
        exp.ausente ??= agoraMs;
        if (agoraMs - exp.ausente >= 600) exposicoes.delete(sensor);
      }
      for (const [sensor, nivel] of riscos) {
        const exp = exposicoes.get(sensor);
        if (exp) exp.ausente = null;
        const intervalo = nivel === 'critico' ? 1000 : 1800;
        const subiu = nivel === 'critico' && exp?.nivel !== 'critico';
        if (!exp || (subiu && agoraMs - exp.ultimo >= 350) || agoraMs - exp.ultimo >= intervalo) {
          if (tocar(TONS_CIRCUITO[sensor], nivel === 'critico')) exposicoes.set(sensor, { nivel, ultimo: agoraMs, ausente: null });
        }
      }
    },
  };
}
