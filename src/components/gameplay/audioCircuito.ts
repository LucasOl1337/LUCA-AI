import type { EstadoGameplay } from './estadoGameplay';
import { riscosCircuito, type SensorCircuito } from './circuito';
import { saidaEfeito, somCompartilhado, type SomCompartilhado } from './somCompartilhado';
import { agendarRajada, ALARMES, type DefinicaoAlarme, type Rajada, type SomAlarme } from './timbreAlarme';

/** Rajadas curtas por exposição, nunca um oscilador contínuo. A mesma classificação
 * alimenta registro, avisos, mapa e áudio. Limites são didáticos, não físicos.
 * O timbre é o mesmo da cabine (`timbreAlarme`): obstáculo = buzzer do sensor,
 * água = zona, encosta = inclinação, sonolência = o alarme de fadiga inteiro. */
export const SONS_CIRCUITO: Record<SensorCircuito, SomAlarme> = { feno: 'proximidade', encosta: 'inclinacao', agua: 'zona', sonolencia: 'sono' };
/** Atenção: um pulso. Crítico: pulso duplo, mais rápido. O sono toca o próprio padrão. */
export function rajadaCircuito(sensor: SensorCircuito, critico: boolean): DefinicaoAlarme {
  const def = ALARMES[SONS_CIRCUITO[sensor]];
  if (sensor === 'sonolencia' || !critico) return def;
  const [, dur, mult] = def.padrao[0];
  return { ...def, padrao: [[0, dur, mult], [dur + 50, dur, mult]] };
}
/** Sonolência repete o padrão sem pausa (insistente, como no /sonolencia); os outros seguem o cooldown. */
const intervaloDe = (sensor: SensorCircuito, critico: boolean) =>
  sensor === 'sonolencia' ? ALARMES.sono.periodoMs : critico ? 1000 : 1800;
export function criarAudioCircuito(som: SomCompartilhado = somCompartilhado) {
  const exposicoes = new Map<SensorCircuito, { nivel: string; ultimo: number; ausente: number | null }>();
  const ativos = new Set<Rajada>();
  let habilitado = true;
  const parar = () => { for (const r of ativos) r.parar(); ativos.clear(); };
  const tocar = (sensor: SensorCircuito, critico: boolean) => {
    const ctx = som.obter();
    if (!ctx || ctx.state !== 'running') return false;
    const r = agendarRajada(ctx, rajadaCircuito(sensor, critico), saidaEfeito(som, ctx));
    ativos.add(r);
    const fim = r.fonte.onended;
    r.fonte.onended = (ev) => { ativos.delete(r); fim?.call(r.fonte, ev); };
    return true;
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
        const intervalo = intervaloDe(sensor, nivel === 'critico');
        const subiu = nivel === 'critico' && exp?.nivel !== 'critico';
        if (!exp || (subiu && agoraMs - exp.ultimo >= 350) || agoraMs - exp.ultimo >= intervalo) {
          if (tocar(sensor, nivel === 'critico')) exposicoes.set(sensor, { nivel, ultimo: agoraMs, ausente: null });
        }
      }
    },
  };
}
