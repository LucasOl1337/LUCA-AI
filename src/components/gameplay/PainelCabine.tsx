import { useEffect, useRef, useSyncExternalStore } from 'react';
import { alertaCabine, type AlertaCabine, type BipeCabine } from './alertaCabine';
import type { CanalGameplay, EstadoGameplay } from './estadoGameplay';
import { MapaTalhao } from './MapaTalhao';
import './painelCabine.css';

/**
 * Painel da cabine: o que o operador vê do LUCA-AI no gameplay.
 * Faixa de baixo no centro (altura do capô), faixa vermelha no alto do
 * para-brisa quando o alerta de 150 cm acende, selo SIMULADO sempre à vista.
 * Quem monta é o GameplayKiosk da Direção; o painel só lê o canal.
 */
export function PainelCabine({ canal, som = true }: { canal: CanalGameplay; som?: boolean }) {
  const estado = useSyncExternalStore(canal.assinar, canal.ler, canal.ler);
  const painel = alertaCabine(estado);
  useBipeCabine(som ? painel.bipe : null);
  return <PainelCabineVista painel={painel} estado={estado} />;
}

/** Só desenho, sem canal nem áudio: serve ao teste e ao print. */
export function PainelCabineVista({ painel, estado }: { painel: AlertaCabine; estado: EstadoGameplay }) {
  return (
    <div className="gameplay-painel" data-faixa={painel.faixa} data-alerta={painel.alerta} data-fase={estado.fase}>
      <div className="gameplay-painel-vinheta" data-nivel={painel.vinheta} aria-hidden="true" />
      <div className="gameplay-painel-alerta" role="alert" hidden={!painel.alerta}>
        {painel.rotuloAlerta}
      </div>
      <section className="gameplay-painel-cabine" aria-label="Painel da cabine" aria-live="polite">
        <span className="gameplay-painel-selo">SIMULADO</span>
        <div className="gameplay-painel-distancia">
          <span>Sensor frontal</span>
          <strong>{painel.distanciaTexto}</strong>
          <small>{painel.rotulo}</small>
        </div>
        <div className="gameplay-painel-lado">
          <div><span>Velocidade</span><strong>{painel.velocidadeTexto}</strong></div>
          {painel.inclinacao.ligada && (
            <div data-alerta="true"><span>Inclinação</span><strong>{painel.inclinacao.graus}°</strong></div>
          )}
        </div>
        <span className="gameplay-painel-marca">LUCA-AI</span>
      </section>
      <MapaTalhao estado={estado} geofence={painel.geofence} />
    </div>
  );
}

/**
 * Bipe em Web Audio. Sem permissão de autoplay (kiosk sem
 * `--autoplay-policy=no-user-gesture-required`) fica mudo, sem erro na tela.
 */
export function useBipeCabine(bipe: BipeCabine | null) {
  const motor = useRef<MotorBipe | null>(null);
  const intervalo = bipe?.intervaloMs ?? null;
  const frequencia = bipe?.frequenciaHz ?? 0;
  useEffect(() => () => { motor.current?.fechar(); motor.current = null; }, []);
  useEffect(() => {
    if (intervalo === null) { motor.current?.parar(); return; }
    motor.current ??= criarMotorBipe();
    motor.current.tocar(intervalo, frequencia);
  }, [intervalo, frequencia]);
}

interface MotorBipe { tocar(intervaloMs: number, frequenciaHz: number): void; parar(): void; fechar(): void }

const DURACAO_BIPE_S = 0.09;
const VOLUME = 0.18;

export function criarMotorBipe(): MotorBipe {
  let contexto: AudioContext | null = null;
  let relogio: number | null = null;
  let continuo: { osc: OscillatorNode; ganho: GainNode } | null = null;

  const abrir = (): AudioContext | null => {
    try {
      contexto ??= new AudioContext({ latencyHint: 'interactive' });
      if (contexto.state === 'suspended') void contexto.resume().catch(() => undefined);
      return contexto.state === 'running' ? contexto : null;
    } catch { return null; }
  };

  const bipar = (hz: number) => {
    const ctx = abrir();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const ganho = ctx.createGain();
    const agora = ctx.currentTime;
    osc.type = 'square';
    osc.frequency.value = hz;
    ganho.gain.setValueAtTime(0, agora);
    ganho.gain.linearRampToValueAtTime(VOLUME, agora + 0.005);
    ganho.gain.setValueAtTime(VOLUME, agora + DURACAO_BIPE_S - 0.01);
    ganho.gain.linearRampToValueAtTime(0, agora + DURACAO_BIPE_S);
    osc.connect(ganho).connect(ctx.destination);
    osc.start(agora);
    osc.stop(agora + DURACAO_BIPE_S + 0.02);
  };

  const parar = () => {
    if (relogio !== null) { window.clearInterval(relogio); relogio = null; }
    if (continuo) {
      try { continuo.osc.stop(); } catch { /* já parado */ }
      continuo = null;
    }
  };

  const motor: MotorBipe = {
    tocar(intervaloMs, hz) {
      parar();
      if (intervaloMs === 0) {
        const ctx = abrir();
        if (!ctx) {
          // Autoplay ainda travado: tenta de novo no próximo ciclo sem insistir em erro.
          relogio = window.setInterval(() => { if (abrir()) motor.tocar(0, hz); }, 500);
          return;
        }
        const osc = ctx.createOscillator();
        const ganho = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = hz;
        ganho.gain.value = VOLUME * 0.8;
        osc.connect(ganho).connect(ctx.destination);
        osc.start();
        continuo = { osc, ganho };
        return;
      }
      bipar(hz);
      relogio = window.setInterval(() => bipar(hz), intervaloMs);
    },
    parar,
    fechar() {
      parar();
      if (contexto) { void contexto.close().catch(() => undefined); contexto = null; }
    },
  };
  return motor;
}
