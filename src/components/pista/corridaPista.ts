/**
 * Motor puro da corrida do caminhão na serra: volante → física → animal →
 * falha do freio → riscos. Sem DOM nem three.js (o palco e o HUD leem `ler()`).
 * Fases iguais às do trator: `pronto` até o primeiro acelerador, `dirigindo`, `fim`.
 */
import { COMANDO_PARADO, passoVolante, type ComandoVolante } from '../gameplay/volante';
import { CAMINHAO, criarCaminhao, passoCaminhao, type EstadoCaminhao } from './fisicaCaminhao';
import { bateuNoAnimal, criarAnimal, instanteDoContato, passoAnimal, radarAnimal, type EstadoAnimal } from './animalNaPista';
import { PISTA_SERRA, projetarNaPista, proximaCurva, SERRA, GUARD_RAIL_M, type PistaSerra } from './pistaSerra';
import type { MotivoCircuito, SensorPista } from '../gameplay/circuito';

export type FasePista = 'pronto' | 'dirigindo' | 'fim';
export type Gravidade = 'atencao' | 'critico';

export interface RetratoPista {
  fase: FasePista; tempoMs: number;
  caminhao: EstadoCaminhao; animal: EstadoAnimal; comandos: ComandoVolante;
  /** 1 = freio bom, 0 = pedal sem efeito. */
  eficienciaFreio: number; falhaFreio: boolean;
  radar: { distanciaM: number; ttcS: number } | null;
  curva: ReturnType<typeof proximaCurva>;
  riscos: ReadonlyMap<SensorPista, Gravidade>;
  fim: MotivoCircuito | null;
  /** Bordas do quadro (som, tranco, vibração). */
  eventos: readonly EventoPista[];
}
export type EventoPista = { tipo: 'falha-freio' } | { tipo: 'animal' } | { tipo: 'raspou' } | { tipo: 'fim'; motivo: MotivoCircuito; velocidadeKph: number };

/** Velocidade (km/h) acima da qual o freio sem resposta é risco; acima de `criticoKph`, crítico. */
export const FREIO_RISCO = Object.freeze({ atencaoKph: 25, criticoKph: 55 });

/** Tempo até a colisão (s) que acende o aviso e o crítico do animal: 50% mais cedo que os 4,5/2,2 s originais (Lucas, 24/10). */
export const RADAR_ANIMAL = { avisoS: 6.75, criticoS: 3.3, continuoS: 1.8 } as const;

export function riscosDaPista(c: EstadoCaminhao, radar: RetratoPista['radar'], falhaFreio: boolean, curva: RetratoPista['curva'], sono = false) {
  const riscos = new Map<SensorPista, Gravidade>();
  // Webcam de sonolência do totem (mesma leitura do trator): olhos fechados há 1 s é crítico.
  if (sono) riscos.set('sonolencia', 'critico');
  if (radar && radar.ttcS < RADAR_ANIMAL.avisoS) riscos.set('animal', radar.ttcS < RADAR_ANIMAL.criticoS ? 'critico' : 'atencao');
  const kph = c.velocidade * 3.6;
  if (falhaFreio && !c.noCascalho && kph > FREIO_RISCO.atencaoKph) riscos.set('freio', kph > FREIO_RISCO.criticoKph ? 'critico' : 'atencao');
  if (c.aLatG >= CAMINHAO.latPerigoG || c.derrapando) riscos.set('curva', 'critico');
  else if (c.aLatG >= CAMINHAO.latAvisoG || (curva && curva.distanciaM < 90 && kph > curva.seguraKph + 8)) riscos.set('curva', 'atencao');
  return riscos;
}

export function motivoDoFim(c: EstadoCaminhao, animal: EstadoAnimal, pista: PistaSerra): MotivoCircuito | null {
  if (bateuNoAnimal(animal, c)) return 'colisao';
  if (c.tomboS >= CAMINHAO.tomboS) return 'tombamento';
  if (c.rompeu && Math.abs(c.lateral) > GUARD_RAIL_M + 1.5) return 'saida_pista';
  if (c.noCascalho && c.velocidade < 0.3) return 'area_escape';
  if (c.s >= Math.min(SERRA.chegadaS, pista.comprimentoM - 4)) return 'chegada';
  return null;
}

export function criarCorridaPista(pista: PistaSerra = PISTA_SERRA) {
  let caminhao = criarCaminhao(pista);
  let animal = criarAnimal(pista);
  let comandos: ComandoVolante = { ...COMANDO_PARADO };
  let fase: FasePista = 'pronto', tempoMs = 0, eficiencia = 1, inicioFalha: number | null = null;
  let fim: MotivoCircuito | null = null, sono = false;
  let retrato: RetratoPista;
  const montar = (eventos: EventoPista[]): RetratoPista => {
    const radar = radarAnimal(animal, caminhao), curva = proximaCurva(pista, caminhao.s);
    return { fase, tempoMs, caminhao, animal, comandos, eficienciaFreio: eficiencia, falhaFreio: inicioFalha !== null, radar, curva,
      riscos: fase === 'fim' ? new Map() : riscosDaPista(caminhao, radar, inicioFalha !== null, curva, sono), fim, eventos };
  };
  retrato = montar([]);
  return {
    ler: () => retrato,
    /** Um quadro. `freioMotor` = botão segurado (○/B, R1/RB ou E); `sonolento` = alarme da webcam. */
    quadro(dt: number, desejado: ComandoVolante, freioMotor: boolean, sonolento = false): RetratoPista {
      if (fase === 'fim') return retrato;
      sono = sonolento;
      const eventos: EventoPista[] = [];
      comandos = passoVolante(comandos, desejado, dt);
      if (fase === 'pronto' && comandos.acelerador > 0) fase = 'dirigindo';
      if (fase === 'pronto') { retrato = montar(eventos); return retrato; }
      const seg = Math.max(0, Math.min(0.1, Number.isFinite(dt) ? dt : 0));
      tempoMs += seg * 1000;
      if (inicioFalha === null && caminhao.s >= SERRA.falhaFreioS) { inicioFalha = tempoMs; eventos.push({ tipo: 'falha-freio' }); }
      if (inicioFalha !== null) eficiencia = Math.max(0, 1 - (tempoMs - inicioFalha) / 1000 / SERRA.falhaFreioS_duracao);
      const antes = animal.ativo;
      const anterior = { animal, caminhao };
      caminhao = passoCaminhao(caminhao, comandos, freioMotor, eficiencia, seg, pista);
      animal = passoAnimal(animal, caminhao, seg, pista);
      const contato = instanteDoContato(animal, caminhao, anterior);
      if (contato !== null) {
        // O palco e a telemetria partem do contato, não de uma pose já dentro do bovino.
        for (const chave of ['x', 'z', 'y', 'rumo', 's', 'lateral', 'rolagem'] as const)
          caminhao[chave] = anterior.caminhao[chave] + (caminhao[chave] - anterior.caminhao[chave]) * contato;
        const p = projetarNaPista(pista, caminhao.x, caminhao.z, caminhao.indice);
        caminhao = { ...caminhao, y: p.y, s: p.s, lateral: p.lateral, indice: p.indice };
        for (const chave of ['x', 'z', 'lateral', 't'] as const)
          animal[chave] = anterior.animal[chave] + (animal[chave] - anterior.animal[chave]) * contato;
        tempoMs -= seg * (1 - contato) * 1000;
      }
      if (!antes && animal.ativo) eventos.push({ tipo: 'animal' });
      if (caminhao.raspou) eventos.push({ tipo: 'raspou' });
      const motivo = contato !== null ? 'colisao' : motivoDoFim(caminhao, animal, pista);
      if (motivo) {
        if (motivo === 'colisao') animal = { ...animal, atingido: true };
        eventos.push({ tipo: 'fim', motivo, velocidadeKph: caminhao.velocidade * 3.6 });
        fim = motivo; fase = 'fim';
      }
      retrato = montar(eventos);
      return retrato;
    },
    /** Pausa/abandono pelo menu. */
    encerrar(motivo: MotivoCircuito) { if (fase !== 'fim') { fim = motivo; fase = 'fim'; retrato = montar([]); } },
  };
}
export type CorridaPista = ReturnType<typeof criarCorridaPista>;
