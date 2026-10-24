/**
 * Som do caminhão: motor (mesmos loops do trator, carga pelo rpm) e alarmes,
 * um por vez (regra do totem de 23/10): animal > freio sem resposta > curva.
 * O alarme novo de freio usa a voz "buzina" do `timbreAlarme` com padrão
 * próprio (três toques graves), definido aqui para não mexer no arquivo do Alarme.
 */
import { criarMotorBipe, type MotorBipe } from '../gameplay/bipeCabine';
import { criarSomMotor } from '../gameplay/somMotor';
import { saidaEfeito, somCompartilhado } from '../gameplay/somCompartilhado';
import { agendarRajada, type DefinicaoAlarme, type Rajada } from '../gameplay/timbreAlarme';
import type { EstadoGameplay } from '../gameplay/estadoGameplay';
import type { RetratoPista } from './corridaPista';

/** Freio sem resposta: buzina 620 Hz, três toques curtos a cada 1,4 s (alta prioridade, não confunde com o sensor). */
export const ALARME_FREIO: DefinicaoAlarme = { voz: 'buzina', hz: 620, periodoMs: 1400, padrao: [[0, 140, 1], [200, 140, 1], [400, 220, 0.82]] };

export type AlarmePista = 'animal' | 'freio' | 'curva' | null;

/** Qual alarme toca agora e com que cadência (ms; 0 = tom contínuo). */
export function alarmeDaPista(r: RetratoPista): { qual: AlarmePista; intervaloMs: number | null } {
  if (r.fase !== 'dirigindo') return { qual: null, intervaloMs: null };
  if (r.radar && r.radar.ttcS < 4.5) return { qual: 'animal', intervaloMs: r.radar.ttcS < 1.2 ? 0 : Math.round(Math.max(90, Math.min(600, r.radar.ttcS * 130))) };
  if (r.riscos.has('freio')) return { qual: 'freio', intervaloMs: ALARME_FREIO.periodoMs };
  const curva = r.riscos.get('curva');
  if (curva) return { qual: 'curva', intervaloMs: curva === 'critico' ? 160 : 380 };
  return { qual: null, intervaloMs: null };
}

export function criarAudioPista(som = somCompartilhado) {
  const motor = criarSomMotor(som);
  let bipe: MotorBipe | null = null, relogioFreio: number | null = null, rajada: Rajada | null = null, ligado = true;
  const pararFreio = () => { if (relogioFreio !== null) { window.clearInterval(relogioFreio); relogioFreio = null; } rajada?.parar(); rajada = null; };
  const tocarFreio = () => {
    const ctx = som.obter();
    if (!ctx || ctx.state !== 'running') { void som.destravar(); return; }
    rajada = agendarRajada(ctx, ALARME_FREIO, saidaEfeito(som, ctx));
  };
  return {
    habilitar(sim: boolean) { ligado = sim; if (!sim) { bipe?.parar(); pararFreio(); } },
    atualizar(r: RetratoPista, pausado: boolean) {
      const c = r.caminhao;
      // Adaptador para o motor do trator: carga = acelerador + rpm, teto 80 km/h.
      motor.atualizar({ fase: r.fase, comandos: { acelerador: Math.max(r.comandos.acelerador, c.freioMotor ? 0.55 : 0), freio: 0, esterco: 0 },
        maquina: { velocidadeKph: (c.rpm - 650) / 2050 * 80 }, tetoKph: 80 } as unknown as EstadoGameplay, pausado);
      const { qual, intervaloMs } = ligado && !pausado ? alarmeDaPista(r) : { qual: null, intervaloMs: null };
      if (qual === 'freio') {
        bipe?.parar();
        if (relogioFreio === null) { tocarFreio(); relogioFreio = window.setInterval(tocarFreio, ALARME_FREIO.periodoMs); }
        return qual;
      }
      pararFreio();
      if (qual === null || intervaloMs === null) { bipe?.parar(); return qual; }
      bipe ??= criarMotorBipe(som);
      bipe.tocar(intervaloMs, qual === 'animal' ? 'proximidade' : 'inclinacao');
      return qual;
    },
    parar() { motor.parar(); bipe?.parar(); pararFreio(); },
    desmontar() { motor.desmontar(); bipe?.fechar(); bipe = null; pararFreio(); },
  };
}
