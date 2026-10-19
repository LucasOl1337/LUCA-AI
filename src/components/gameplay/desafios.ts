/**
 * Desafios do gameplay: começo, objetivo e fim, puros (grill r1, Operador Q2-Q4, Q9-Q10).
 * O desafio posiciona tudo pelo `reiniciar(inicio)` da Direção e lê o
 * EstadoGameplay a cada quadro; não grava episódio nem guarda nome.
 */
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

export interface Desafio {
  id: 'fardo-a-frente';
  titulo: string;
  /** Linha única dos 4 s de abertura. */
  abertura: string;
  inicio: InicioGameplay;
  /** Sem chegar ao fim neste tempo de condução, encerra por tempo. */
  limiteMs: number;
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

/** O pendente lateral entra quando o terreno da Direção tiver inclinação (item 3). */
export const DESAFIOS: readonly Desafio[] = [DESAFIO_FARDO];

export type DesfechoDesafio = 'parou' | 'encostou' | 'tempo';

export interface ResultadoDesafio {
  desfecho: DesfechoDesafio;
  /** Distância em que o alerta acendeu pela primeira vez; null se nunca acendeu. */
  alertaCm: number | null;
  /** Do alerta ao primeiro freio, em segundos; 0 se já freava; null sem alerta ou sem freio. */
  reacaoS: number | null;
  /** Distância em que parou; null se encostou ou acabou o tempo andando. */
  paradaCm: number | null;
  /** Velocidade no contato, se houve. */
  contatoKph: number | null;
}

/** O que o desafio acumula enquanto roda. Imutável: cada passo devolve outro. */
export interface RastroDesafio {
  alertaMs: number | null;
  alertaCm: number | null;
  freioMs: number | null;
  /** Freio já apertado quando o alerta acendeu. */
  freandoNoAlerta: boolean;
  /** Menor distância do sensor desde o alerta: a parada vale aqui, não depois da ré. */
  menorCm: number | null;
  andou: boolean;
  contatoKph: number | null;
  resultado: ResultadoDesafio | null;
}

export const RASTRO_VAZIO: RastroDesafio = {
  alertaMs: null, alertaCm: null, freioMs: null, freandoNoAlerta: false,
  menorCm: null, andou: false, contatoKph: null, resultado: null,
};

/** Evento de borda da Direção: só marca o instante exato do alerta e a velocidade no contato. */
export function eventoDesafio(rastro: RastroDesafio, evento: EventoGameplay, estado: EstadoGameplay): RastroDesafio {
  if (rastro.resultado) return rastro;
  if (evento.tipo === 'alerta' && evento.ligado && rastro.alertaMs === null) {
    return marcarAlerta(rastro, evento.tempoMs, estado);
  }
  if (evento.tipo === 'contato' && rastro.contatoKph === null) {
    return { ...rastro, contatoKph: evento.velocidadeKph };
  }
  return rastro;
}

function marcarAlerta(rastro: RastroDesafio, tempoMs: number, estado: EstadoGameplay): RastroDesafio {
  const freando = estado.comandos.freio >= FREIO_MINIMO;
  return {
    ...rastro,
    alertaMs: tempoMs,
    // Retrato de um quadro antes (ainda sem alerta) não serve: o próximo passo preenche.
    alertaCm: estado.sensor.alerta ? estado.sensor.distanciaCm : null,
    freandoNoAlerta: freando,
    freioMs: freando ? tempoMs : null,
  };
}

/** Um retrato do `ler()`; devolve o rastro com `resultado` quando o desafio acaba. */
export function passoDesafio(rastro: RastroDesafio, estado: EstadoGameplay, desafio: Desafio = DESAFIO_FARDO): RastroDesafio {
  if (rastro.resultado || estado.fase === 'pronto') return rastro;
  let r = rastro;
  const t = estado.tempoMs;
  if (estado.sensor.alerta && r.alertaMs === null) r = marcarAlerta(r, t, estado);
  else if (estado.sensor.alerta && r.alertaCm === null) r = { ...r, alertaCm: estado.sensor.distanciaCm };
  if (r.alertaMs !== null && r.freioMs === null && estado.comandos.freio >= FREIO_MINIMO) r = { ...r, freioMs: t };
  if (r.alertaMs !== null && estado.sensor.eco && (r.menorCm === null || estado.sensor.distanciaCm < r.menorCm)) {
    r = { ...r, menorCm: estado.sensor.distanciaCm };
  }
  if (estado.maquina.velocidadeKph > 1) r = r.andou ? r : { ...r, andou: true };

  if (estado.contato) {
    return fechar(r, 'encostou', null, r.contatoKph ?? estado.maquina.velocidadeKph);
  }
  const parado = estado.maquina.re || estado.maquina.velocidadeKph < PARADO_KPH;
  if (parado && r.andou && r.alertaMs !== null) {
    return fechar(r, 'parou', r.menorCm ?? estado.sensor.distanciaCm, null);
  }
  if (t >= desafio.limiteMs || estado.fase === 'fim') return fechar(r, 'tempo', null, null);
  return r;
}

function fechar(r: RastroDesafio, desfecho: DesfechoDesafio, paradaCm: number | null, contatoKph: number | null): RastroDesafio {
  const reacaoS = r.alertaMs === null || r.freioMs === null ? null : Math.max(0, (r.freioMs - r.alertaMs) / 1000);
  return { ...r, resultado: { desfecho, alertaCm: r.alertaCm, reacaoS, paradaCm, contatoKph } };
}

/** Motivo passado ao `encerrar` da Direção. */
export const MOTIVO_FIM: Record<DesfechoDesafio, string> = {
  parou: 'desafio-parou', encostou: 'desafio-encostou', tempo: 'desafio-tempo',
};

export interface TextoResultado {
  titulo: string;
  linhas: string[];
  frase: string;
}

const cm = (valor: number) => `${Math.round(valor)} cm`;
const segundos = (valor: number) => `${valor.toFixed(1).replace('.', ',')} s`;

/** As três linhas e a frase da tela de resultado (Q4). "Reação atrasada" como no glossário. */
export function textoResultado(resultado: ResultadoDesafio): TextoResultado {
  const linhas: string[] = [];
  linhas.push(resultado.alertaCm === null ? 'O LUCA-AI não precisou avisar' : `O LUCA-AI avisou a ${cm(resultado.alertaCm)} do fardo`);
  if (resultado.alertaCm !== null) {
    linhas.push(resultado.reacaoS === null ? 'Você não freou depois do aviso'
      : resultado.reacaoS === 0 ? 'Você já estava freando no aviso'
        : `Você freou ${segundos(resultado.reacaoS)} depois do aviso`);
  }
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
