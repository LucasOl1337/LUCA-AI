/**
 * Desafios do gameplay: começo, objetivo e fim, puros (grill r1, Operador Q2-Q4, Q9-Q10).
 * O desafio posiciona tudo pelo `reiniciar(inicio)` da Direção e lê o
 * EstadoGameplay a cada quadro; não grava episódio nem guarda nome.
 */
import { physicalRiskBands } from '../../../shared/sompo-physical-interactions.js';
import {
  GAMEPLAY_TETO_DESAFIO_KPH,
  type EstadoGameplay,
  type EventoGameplay,
  type InicioGameplay,
} from './estadoGameplay';

/** Emissor do HC-SR04 à frente da origem da máquina (FREE_DRIVE.sensorAheadM). */
const SENSOR_A_FRENTE_M = 2.2461;
/** Raio do fardo de feno do palco (HAY_BALE_RADIUS). */
const RAIO_FARDO_M = 0.72;

export type IdDesafio = 'fardo-a-frente' | 'pendente-lateral';

export interface Desafio {
  id: IdDesafio;
  titulo: string;
  /** Linha única dos 4 s de abertura. */
  abertura: string;
  inicio: InicioGameplay;
  /** Sem chegar ao fim neste tempo de condução, encerra por tempo. */
  limiteMs: number;
  /** Pendente lateral: metros a percorrer desde o início para atravessar a encosta. */
  atravessarM?: number;
}

export const ABERTURA_MS = 4000;
export const RESULTADO_MS = 10_000;
/**
 * Parado = abaixo disso, ou já em ré. Fecha no primeiro quadro: com L2 segurado
 * a física da Direção engata ré lenta em menos de 0,1 s depois de parar.
 */
export const PARADO_KPH = 0.2;
/** Pedal de freio conta a partir daqui (0..1, já com zona morta). */
export const FREIO_MINIMO = 0.1;
/**
 * Pendente lateral: passou disso, tombou. Vem dos roteiros do `/sompo`
 * (`agri-tractor-rollover`, em `shared/sompo-agri-scenarios.js`): a parada
 * controlada chega a 27° e segura; o tombamento passa por 33° e 39° e não volta. O alerta é o de 20° do painel
 * (`physicalRiskBands`), não este.
 */
export const TOMBAMENTO_GRAUS = 35;

/** Fardo na mesma linha, a 20 m do sensor: a 6 km/h dá uns 12 s de condução. */
export const DESAFIO_FARDO: Desafio = {
  id: 'fardo-a-frente',
  titulo: 'Fardo à frente',
  abertura: 'Dirija até o fardo. Quando o LUCA-AI avisar, freie.',
  inicio: {
    x: 0,
    z: 0,
    rumoGraus: 0,
    obstaculos: [{ x: SENSOR_A_FRENTE_M + 20 + RAIO_FARDO_M, z: 0, raioM: RAIO_FARDO_M }],
    tetoKph: GAMEPLAY_TETO_DESAFIO_KPH,
  },
  limiteMs: 60_000,
};

/**
 * Pendente lateral: atravessar 30 m de encosta de lado, sem obstáculo. Fica
 * fora de `DESAFIOS` até o terreno da Direção (item 3) dar atitude de verdade:
 * a pose de partida aqui é provisória e muda quando a encosta existir no palco.
 */
export const DESAFIO_PENDENTE: Desafio = {
  id: 'pendente-lateral',
  titulo: 'Pendente lateral',
  abertura: 'Atravesse a encosta. Se o LUCA-AI avisar inclinação, freie.',
  inicio: { x: 0, z: 0, rumoGraus: 0, obstaculos: [], tetoKph: GAMEPLAY_TETO_DESAFIO_KPH },
  limiteMs: 60_000,
  atravessarM: 30,
};

/** Desafios ligados no totem. O pendente lateral entra depois do terreno (item 3). */
export const DESAFIOS: readonly Desafio[] = [DESAFIO_FARDO];

export interface ResultadoFardo {
  desafio: 'fardo-a-frente';
  desfecho: 'parou' | 'encostou' | 'tempo';
  /** Distância em que o alerta acendeu pela primeira vez; null se nunca acendeu. */
  alertaCm: number | null;
  /** Do alerta ao primeiro freio, em segundos; 0 se já freava; null sem alerta ou sem freio. */
  reacaoS: number | null;
  /** Distância em que parou; null se encostou ou acabou o tempo andando. */
  paradaCm: number | null;
  /** Velocidade no contato, se houve. */
  contatoKph: number | null;
}

export interface ResultadoPendente {
  desafio: 'pendente-lateral';
  desfecho: 'parou' | 'atravessou' | 'tombou' | 'tempo';
  /** Inclinação em que o alerta acendeu; null se nunca acendeu. */
  alertaGraus: number | null;
  reacaoS: number | null;
  /** Maior rolagem ou arfagem, em módulo, durante a condução. */
  grauMaximo: number;
}

export type ResultadoDesafio = ResultadoFardo | ResultadoPendente;
export type DesfechoDesafio = ResultadoDesafio['desfecho'];

/** O que o desafio acumula enquanto roda. Imutável: cada passo devolve outro. */
export interface RastroDesafio {
  alertaMs: number | null;
  alertaCm: number | null;
  alertaGraus: number | null;
  freioMs: number | null;
  /** Freio já apertado quando o alerta acendeu. */
  freandoNoAlerta: boolean;
  /** Menor distância do sensor desde o alerta: a parada vale aqui, não depois da ré. */
  menorCm: number | null;
  grauMaximo: number;
  andou: boolean;
  contatoKph: number | null;
  resultado: ResultadoDesafio | null;
}

export const RASTRO_VAZIO: RastroDesafio = {
  alertaMs: null, alertaCm: null, alertaGraus: null, freioMs: null, freandoNoAlerta: false,
  menorCm: null, grauMaximo: 0, andou: false, contatoKph: null, resultado: null,
};

const inclinacao = (estado: EstadoGameplay) =>
  physicalRiskBands({ pitch: estado.atitude.arfagemGraus, roll: estado.atitude.rolagemGraus });

/** Evento de borda da Direção: marca o instante exato do alerta do desafio e a velocidade no contato. */
export function eventoDesafio(rastro: RastroDesafio, evento: EventoGameplay, estado: EstadoGameplay, desafio: Desafio = DESAFIO_FARDO): RastroDesafio {
  if (rastro.resultado || rastro.alertaMs !== null && evento.tipo !== 'contato') return rastro;
  if (desafio.id === 'fardo-a-frente' && evento.tipo === 'alerta' && evento.ligado) {
    // Retrato de um quadro antes (ainda sem alerta) não serve: o próximo passo preenche.
    return marcarAlerta(rastro, evento.tempoMs, estado, { alertaCm: estado.sensor.alerta ? estado.sensor.distanciaCm : null });
  }
  if (desafio.id === 'pendente-lateral' && evento.tipo === 'inclinacao' && evento.ligado) {
    return marcarAlerta(rastro, evento.tempoMs, estado, { alertaGraus: evento.graus });
  }
  if (evento.tipo === 'contato' && rastro.contatoKph === null) return { ...rastro, contatoKph: evento.velocidadeKph };
  return rastro;
}

function marcarAlerta(rastro: RastroDesafio, tempoMs: number, estado: EstadoGameplay, medida: Partial<RastroDesafio>): RastroDesafio {
  const freando = estado.comandos.freio >= FREIO_MINIMO;
  return { ...rastro, ...medida, alertaMs: tempoMs, freandoNoAlerta: freando, freioMs: freando ? tempoMs : null };
}

/** Um retrato do `ler()`; devolve o rastro com `resultado` quando o desafio acaba. */
export function passoDesafio(rastro: RastroDesafio, estado: EstadoGameplay, desafio: Desafio = DESAFIO_FARDO): RastroDesafio {
  if (rastro.resultado || estado.fase === 'pronto') return rastro;
  let r = rastro;
  if (estado.maquina.velocidadeKph > 1 && !r.andou) r = { ...r, andou: true };
  r = desafio.id === 'pendente-lateral' ? passoPendente(r, estado, desafio) : passoFardo(r, estado, desafio);
  if (r.resultado) return r;
  if (r.alertaMs !== null && r.freioMs === null && estado.comandos.freio >= FREIO_MINIMO) r = { ...r, freioMs: estado.tempoMs };
  return r;
}

const reacao = (r: RastroDesafio) => r.alertaMs === null || r.freioMs === null ? null : Math.max(0, (r.freioMs - r.alertaMs) / 1000);
const parado = (estado: EstadoGameplay) => estado.maquina.re || estado.maquina.velocidadeKph < PARADO_KPH;
const acabouTempo = (estado: EstadoGameplay, desafio: Desafio) => estado.tempoMs >= desafio.limiteMs || estado.fase === 'fim';

function passoFardo(rastro: RastroDesafio, estado: EstadoGameplay, desafio: Desafio): RastroDesafio {
  let r = rastro;
  const t = estado.tempoMs;
  if (estado.sensor.alerta && r.alertaMs === null) r = marcarAlerta(r, t, estado, { alertaCm: estado.sensor.distanciaCm });
  else if (estado.sensor.alerta && r.alertaCm === null) r = { ...r, alertaCm: estado.sensor.distanciaCm };
  if (r.alertaMs !== null && r.freioMs === null && estado.comandos.freio >= FREIO_MINIMO) r = { ...r, freioMs: t };
  if (r.alertaMs !== null && estado.sensor.eco && (r.menorCm === null || estado.sensor.distanciaCm < r.menorCm)) {
    r = { ...r, menorCm: estado.sensor.distanciaCm };
  }
  const fechar = (desfecho: ResultadoFardo['desfecho'], paradaCm: number | null, contatoKph: number | null): RastroDesafio => ({
    ...r, resultado: { desafio: 'fardo-a-frente', desfecho, alertaCm: r.alertaCm, reacaoS: reacao(r), paradaCm, contatoKph },
  });
  if (estado.contato) return fechar('encostou', null, r.contatoKph ?? estado.maquina.velocidadeKph);
  if (parado(estado) && r.andou && r.alertaMs !== null) return fechar('parou', r.menorCm ?? estado.sensor.distanciaCm, null);
  if (acabouTempo(estado, desafio)) return fechar('tempo', null, null);
  return r;
}

function passoPendente(rastro: RastroDesafio, estado: EstadoGameplay, desafio: Desafio): RastroDesafio {
  let r = rastro;
  const t = estado.tempoMs;
  const bandas = inclinacao(estado);
  if (bandas.angle > r.grauMaximo) r = { ...r, grauMaximo: bandas.angle };
  if (bandas.inclination && r.alertaMs === null) r = marcarAlerta(r, t, estado, { alertaGraus: bandas.angle });
  if (r.alertaMs !== null && r.freioMs === null && estado.comandos.freio >= FREIO_MINIMO) r = { ...r, freioMs: t };
  const fechar = (desfecho: ResultadoPendente['desfecho']): RastroDesafio => ({
    ...r,
    resultado: { desafio: 'pendente-lateral', desfecho, alertaGraus: r.alertaGraus, reacaoS: reacao(r), grauMaximo: Math.round(r.grauMaximo * 10) / 10 },
  });
  if (r.grauMaximo >= TOMBAMENTO_GRAUS) return fechar('tombou');
  const { x = 0, z = 0 } = desafio.inicio;
  const andado = Math.hypot(estado.maquina.x - x, estado.maquina.z - z);
  if (desafio.atravessarM !== undefined && andado >= desafio.atravessarM) return fechar('atravessou');
  if (parado(estado) && r.andou && r.alertaMs !== null) return fechar('parou');
  if (acabouTempo(estado, desafio)) return fechar('tempo');
  return r;
}

/** Motivo passado ao `encerrar` da Direção. */
export const MOTIVO_FIM: Record<DesfechoDesafio, string> = {
  parou: 'desafio-parou', encostou: 'desafio-encostou', tempo: 'desafio-tempo',
  atravessou: 'desafio-atravessou', tombou: 'desafio-tombou',
};

export interface TextoResultado {
  titulo: string;
  linhas: string[];
  frase: string;
}

const cm = (valor: number) => `${Math.round(valor)} cm`;
const segundos = (valor: number) => `${valor.toFixed(1).replace('.', ',')} s`;
const graus = (valor: number) => `${Math.round(valor)}°`;

function linhaReacao(reacaoS: number | null) {
  return reacaoS === null ? 'Você não freou depois do aviso'
    : reacaoS === 0 ? 'Você já estava freando no aviso'
      : `Você freou ${segundos(reacaoS)} depois do aviso`;
}

/** As três linhas e a frase da tela de resultado (Q4). "Reação atrasada" como no glossário. */
export function textoResultado(resultado: ResultadoDesafio): TextoResultado {
  return resultado.desafio === 'pendente-lateral' ? textoPendente(resultado) : textoFardo(resultado);
}

function textoFardo(resultado: ResultadoFardo): TextoResultado {
  const linhas: string[] = [];
  linhas.push(resultado.alertaCm === null ? 'O LUCA-AI não precisou avisar' : `O LUCA-AI avisou a ${cm(resultado.alertaCm)} do fardo`);
  if (resultado.alertaCm !== null) linhas.push(linhaReacao(resultado.reacaoS));
  if (resultado.desfecho === 'parou' && resultado.paradaCm !== null) linhas.push(`Parou a ${cm(resultado.paradaCm)}`);
  else if (resultado.desfecho === 'encostou') linhas.push('Encostou no fardo');

  if (resultado.desfecho === 'parou') return { titulo: 'Parou a tempo', linhas, frase: 'Avisou a tempo; quem freia é você.' };
  if (resultado.desfecho === 'encostou') {
    return {
      titulo: 'Reação atrasada',
      linhas,
      frase: resultado.alertaCm === null ? 'O fardo ficou fora do sensor até o contato.' : 'O aviso veio a tempo; o freio veio tarde.',
    };
  }
  return { titulo: 'Tempo esgotado', linhas, frase: 'Acelere com R2 até o fardo e freie com L2 quando o LUCA-AI avisar.' };
}

function textoPendente(resultado: ResultadoPendente): TextoResultado {
  const linhas: string[] = [];
  linhas.push(resultado.alertaGraus === null ? 'O LUCA-AI não precisou avisar' : `O LUCA-AI avisou a ${graus(resultado.alertaGraus)} de inclinação`);
  if (resultado.alertaGraus !== null) linhas.push(linhaReacao(resultado.reacaoS));
  linhas.push(`A máquina chegou a ${graus(resultado.grauMaximo)}`);

  if (resultado.desfecho === 'tombou') {
    return { titulo: 'Tombou', linhas, frase: `Passou de ${TOMBAMENTO_GRAUS}°: na encosta, o aviso de 20° é a hora de frear.` };
  }
  if (resultado.desfecho === 'parou') return { titulo: 'Parou a tempo', linhas, frase: 'Avisou a tempo; quem freia é você.' };
  if (resultado.desfecho === 'atravessou') {
    return {
      titulo: 'Atravessou a encosta',
      linhas,
      frase: resultado.alertaGraus === null ? 'Ficou abaixo de 20° o caminho todo.' : 'Passou do aviso e segurou abaixo do limite.',
    };
  }
  return { titulo: 'Tempo esgotado', linhas, frase: 'Acelere com R2 pela encosta e freie com L2 se o LUCA-AI avisar.' };
}
