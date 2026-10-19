/**
 * Motor do Gameplay: o laço único (entrada → volante → física → retrato →
 * eventos) sem React nem three.js, para o teste dirigir quadro a quadro.
 * O GameplayKiosk chama `quadro(dt, entrada)` de dentro do `drive` do palco,
 * no mesmo rAF que desenha. A ordem dentro do quadro é contrato com a
 * Operador: o retrato do `ler()` é atualizado ANTES de qualquer evento de borda.
 */
import { physicalRiskBands } from '../../../shared/sompo-physical-interactions.js';
import {
  GAMEPLAY_TETO_LIVRE_KPH,
  type CanalGameplay, type EstadoGameplay, type EventoGameplay, type InicioGameplay, type ObstaculoGameplay,
} from './estadoGameplay';
import { COMANDO_PARADO, passoVolante, type ComandoVolante } from './volante';
import { TRATOR, criarTrator, leituraSensor, passoTrator, type EstadoTrator } from './fisicaTrator';

/** Começo da condução livre: no meio do talhão, rumo +X, sem obstáculo. */
export const INICIO_LIVRE: Required<InicioGameplay> = Object.freeze({ x: 0, z: 0, rumoGraus: 0, obstaculos: Object.freeze([]), tetoKph: GAMEPLAY_TETO_LIVRE_KPH });
/** Aviso aos assinantes (painel, desafio) a ~15 Hz; bordas saem na hora. Perto do obstáculo (com eco), a cada quadro: é onde o desafio mede reação e parada. */
export const AVISO_MS = 1000 / 15;
/** Tolerância de meio quadro a 60 Hz para o aviso cair a cada 4 quadros, não a cada 5. */
const FOLGA_AVISO_MS = 4;
/** Acelerador acima disso tira do `pronto`. */
const PARTIDA = 0.05;

export interface MotorGameplay extends CanalGameplay {
  /** Um quadro da física. `desejado` já vem de `comandoDesejado` (pad + setas). */
  quadro(dt: number, desejado: ComandoVolante): EstadoGameplay;
  /** Obstáculos em vigor (mesma referência até o próximo `reiniciar`): o palco usa para desenhar os fardos. */
  obstaculos(): readonly ObstaculoGameplay[];
  /** Estado interno do trator (rumo em rad, guinada), para a pose do palco. */
  trator(): Readonly<EstadoTrator>;
  /** Comando já com a taxa do volante: o que o painel e o esterço visual mostram. */
  comando(): Readonly<ComandoVolante>;
}

const arredondar = (valor: number, casas = 2) => { const f = 10 ** casas; const r = Math.round(valor * f) / f; return r === 0 ? 0 : r; };

export function criarMotorGameplay(agora: () => number = () => performance.now()): MotorGameplay {
  let inicio: Required<InicioGameplay> = INICIO_LIVRE;
  let trator = criarTrator(0);
  let comando: ComandoVolante = COMANDO_PARADO;
  let fase: EstadoGameplay['fase'] = 'pronto';
  let tempoMs = 0;
  let alerta = false, contato = false, inclinado = false;
  let ultimoAviso = -Infinity;
  const assinantes = new Set<() => void>();
  const ouvintes = new Set<(evento: EventoGameplay) => void>();

  const montarRetrato = (): EstadoGameplay => {
    const sensor = leituraSensor(trator, inicio.obstaculos);
    return {
      versao: 1,
      fase,
      tempoMs: Math.round(tempoMs),
      maquina: {
        x: arredondar(trator.x), z: arredondar(trator.z),
        rumoGraus: arredondar(trator.rumo * 180 / Math.PI, 1),
        velocidadeKph: arredondar(Math.abs(trator.velocidade) * 3.6, 2),
        re: trator.velocidade < -0.01,
      },
      comandos: { esterco: arredondar(comando.esterco, 3), acelerador: arredondar(comando.acelerador, 3), freio: arredondar(comando.freio, 3) },
      sensor,
      atitude: { rolagemGraus: 0, arfagemGraus: 0 },
      contato: trator.contato,
      tetoKph: inicio.tetoKph,
    };
  };
  let retrato = montarRetrato();

  const avisar = () => { ultimoAviso = agora(); for (const fn of [...assinantes]) fn(); };
  const emitir = (evento: EventoGameplay) => { for (const fn of [...ouvintes]) fn(evento); };

  function reiniciar(pedido: InicioGameplay = {}) {
    inicio = {
      x: Number.isFinite(pedido.x) ? pedido.x! : INICIO_LIVRE.x,
      z: Number.isFinite(pedido.z) ? pedido.z! : INICIO_LIVRE.z,
      rumoGraus: Number.isFinite(pedido.rumoGraus) ? pedido.rumoGraus! : INICIO_LIVRE.rumoGraus,
      obstaculos: Object.freeze([...(pedido.obstaculos ?? INICIO_LIVRE.obstaculos)].map((o) => Object.freeze({ ...o }))),
      tetoKph: Number.isFinite(pedido.tetoKph) ? pedido.tetoKph! : INICIO_LIVRE.tetoKph,
    };
    const limite = TRATOR.cercaM;
    trator = criarTrator(Math.max(-limite, Math.min(limite, inicio.x)), Math.max(-limite, Math.min(limite, inicio.z)), inicio.rumoGraus * Math.PI / 180);
    comando = COMANDO_PARADO;
    fase = 'pronto'; tempoMs = 0;
    alerta = contato = inclinado = false;
    retrato = montarRetrato();
    avisar();
  }

  function encerrar(motivo: string) {
    if (fase === 'fim') return;
    fase = 'fim';
    retrato = montarRetrato();
    avisar();
    emitir({ tipo: 'fim', tempoMs: retrato.tempoMs, motivo });
  }

  function quadro(dt: number, desejado: ComandoVolante) {
    const segundos = Math.max(0, Math.min(0.1, Number.isFinite(dt) ? dt : 0));
    // No fim o trator só freia até parar (sem engatar ré): o resultado fica na tela sem o jogador sair andando.
    const pedido = fase === 'fim' ? { esterco: 0, acelerador: 0, freio: trator.velocidade > 0.05 ? 1 : 0 } : desejado;
    comando = passoVolante(comando, pedido, segundos);
    if (fase === 'pronto' && comando.acelerador > PARTIDA) fase = 'dirigindo';
    if (fase === 'dirigindo') tempoMs += segundos * 1000;
    const antes = trator;
    trator = passoTrator(trator, comando, segundos, { obstaculos: inicio.obstaculos, tetoKph: inicio.tetoKph });
    // 1) retrato novo; 2) bordas com o retrato já atual; 3) aviso aos assinantes.
    retrato = montarRetrato();
    const eventos: EventoGameplay[] = [];
    if (retrato.sensor.alerta !== alerta) { alerta = retrato.sensor.alerta; eventos.push({ tipo: 'alerta', ligado: alerta, tempoMs: retrato.tempoMs }); }
    if (trator.contato && !contato) eventos.push({ tipo: 'contato', tempoMs: retrato.tempoMs, velocidadeKph: arredondar(Math.abs(antes.velocidade) * 3.6, 2) });
    contato = trator.contato;
    const bandas = physicalRiskBands({ pitch: retrato.atitude.arfagemGraus, roll: retrato.atitude.rolagemGraus });
    if (bandas.inclination !== inclinado) { inclinado = bandas.inclination; eventos.push({ tipo: 'inclinacao', ligado: inclinado, tempoMs: retrato.tempoMs, graus: bandas.angle }); }
    for (const evento of eventos) emitir(evento);
    if (eventos.length || retrato.sensor.eco || agora() - ultimoAviso >= AVISO_MS - FOLGA_AVISO_MS) avisar();
    return retrato;
  }

  return {
    ler: () => retrato,
    assinar(fn) { assinantes.add(fn); return () => { assinantes.delete(fn); }; },
    aoEvento(fn) { ouvintes.add(fn); return () => { ouvintes.delete(fn); }; },
    reiniciar,
    encerrar,
    quadro,
    obstaculos: () => inicio.obstaculos,
    trator: () => trator,
    comando: () => comando,
  };
}

/** Rumble do DualSense pelas bordas: fraco no alerta, forte no contato (o zumbido do motor é do kiosk). */
export type PedidoVibracao = 'alerta' | 'contato';
export function vibracaoDoEvento(evento: EventoGameplay): PedidoVibracao | null {
  if (evento.tipo === 'alerta' && evento.ligado) return 'alerta';
  if (evento.tipo === 'contato') return 'contato';
  return null;
}
