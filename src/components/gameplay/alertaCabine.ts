/**
 * Tradução do EstadoGameplay no que o Painel da cabine mostra e toca.
 * Puro: o painel chama com o retrato de `ler()` e só desenha o resultado.
 *
 * Duas regras com papéis diferentes (grill r1, Operador Q1):
 * - a cor vem das faixas do `/sompo` (`physicalRiskBands`): amarelo abaixo de
 *   200 cm, vermelho até 100 cm ou com o flag de alerta;
 * - o alerta (faixa vermelha e bipe rápido) é o flag a `GAMEPLAY_ALERTA_CM`
 *   (225 cm desde 24/10, 50% além dos 150 cm do ESP32), que a física da
 *   Direção já entrega em `sensor.alerta`; o eco vai até 600 cm.
 */
import { physicalRiskBands } from '../../../shared/sompo-physical-interactions.js';
import { GAMEPLAY_ALERTA_CM, GAMEPLAY_ECO_MAXIMO_CM, type EstadoGameplay } from './estadoGameplay';
import { COMANDOS_CABINE, type EntradaCabine } from './comandosCabine';
import { cercaAFrente } from './fisicaTrator';
import { geofenceTalhao, type GeofenceTalhao } from './geofenceTalhao';
import { ROTULO_ALERTA_SONO, type SonoCabine } from './sonoCabine';
import { ALARMES, type SomAlarme } from './timbreAlarme';

export type FaixaCabine = 'livre' | 'atencao' | 'perigo';

/**
 * Bordas vermelhas da tela, como o "dano" do Call of Duty (pedido do Linz, 20/10):
 * `alerta` com o flag de 225 cm ou a inclinação, `critica` a até 100 cm ou no contato.
 */
export type VinhetaCabine = 'nenhuma' | 'alerta' | 'critica';

/** Cadência do bipe: `null` mudo, `0` tom contínuo, senão um bipe a cada `intervaloMs`; `som` escolhe o timbre (`timbreAlarme`). */
export interface BipeCabine { intervaloMs: number | null; som: SomAlarme }

export interface AlertaCabine {
  faixa: FaixaCabine;
  /** "2,4 m", ou "+4 m" sem eco. */
  distanciaTexto: string;
  /** Faixa vermelha no alto do para-brisa: alerta de 225 cm ou inclinação a partir de 20°. */
  alerta: boolean;
  /** Texto da faixa vermelha; vazio sem alerta. */
  rotuloAlerta: string;
  /** Linha curta abaixo da distância. */
  rotulo: string;
  velocidadeTexto: string;
  /** Rolagem ou arfagem a partir de 20° (item 3: vem do terreno). */
  inclinacao: { ligada: boolean; graus: number };
  bipe: BipeCabine;
  /** Só enquanto dirige: no pronto e no resultado a tela fica limpa. */
  vinheta: VinhetaCabine;
  /** Zona de risco do talhão: `rumo` na projeção de 3 s, `dentro` com a máquina nela. */
  geofence: GeofenceTalhao;
  /** Webcam de sonolência (`/gameplay?webcam=1`): olhos fechados há 1 s ou mais. Sempre false sem webcam. */
  sono: boolean;
  /** De frente para a cerca do talhão, encostado: o sensor não a vê; a faixa diz para dar ré (sem bipe nem vinheta). */
  cerca: boolean;
  /** Por que está apitando, em uma linha curta (texto vermelho discreto do HUD, Lucas 24/10); `null` mudo. Estável enquanto a causa é a mesma. */
  motivoBipe: string | null;
}

const metros = (cm: number) => `${(cm / 100).toFixed(1).replace('.', ',')} m`;

export const ROTULO_ALERTA_CABINE = `Obstáculo a ${metros(GAMEPLAY_ALERTA_CM)} · freie`;
/** Motivos do apito, um por causa (sem a distância ao vivo, para o texto não piscar a cada quadro). */
export const MOTIVOS_BIPE = {
  contato: 'Apitando: contato com o obstáculo',
  alerta: `Apitando: obstáculo a menos de ${metros(GAMEPLAY_ALERTA_CM)} · freie`,
  sono: 'Apitando: olhos fechados · pare em segurança',
  zonaDentro: 'Apitando: dentro da zona de risco · saia',
  zonaRumo: 'Apitando: rumo à zona de risco · desvie',
  inclinacao: 'Apitando: inclinação alta · risco de tombar',
  eco: `Apitando: obstáculo no alcance de ${metros(GAMEPLAY_ECO_MAXIMO_CM)} · reduza`,
  re: 'Apitando: ré engatada',
} as const;
/** Trator preso de frente na cerca do talhão (Lupa, observação da Lixa 24/10). */
export const ROTULO_CERCA_CABINE = 'Cerca do talhão · dê ré com L2';
/** Mesma frase com o comando de ré de quem está jogando (Lixa): teclado não tem L2. */
export function rotuloCerca(entrada: EntradaCabine) {
  return ROTULO_CERCA_CABINE.replace('L2', entrada === 'teclado' ? 'S / ↓' : COMANDOS_CABINE.frear[entrada]);
}
/** Faixa vermelha do risco de tombamento: rolagem ou arfagem a partir de 20°. */
export const rotuloInclinacaoCabine = (graus: number) => `Inclinação de ${graus}° · freie`;
/** Faixa da zona de risco do talhão (geofence). */
export const rotuloGeofenceCabine = (g: GeofenceTalhao) => g.nivel === 'dentro' ? `Dentro da ${g.zona!.rotulo.toLowerCase()} · saia` : g.nivel === 'rumo' ? `Rumo à ${g.zona!.rotulo.toLowerCase()} · desvie` : '';
export const BIPE_LENTO_MS = 600;
export const BIPE_RAPIDO_MS = 200;
/** Alarme de fadiga: dois tons alternados sem pausa, insistente, diferente do sensor e da zona. */
export const BIPE_SONO: BipeCabine = { intervaloMs: ALARMES.sono.periodoMs, som: 'sono' };
/** Alarme de ré de máquina: buzina lenta, meio segundo ligado e meio desligado (Lupa, 24/10). */
export const BIPE_RE: BipeCabine = { intervaloMs: ALARMES.re.periodoMs, som: 're' };
/** Abaixo disso (trator parado com a ré engatada) não apita. */
export const RE_BIPE_MIN_KPH = 0.3;

const MUDO: BipeCabine = { intervaloMs: null, som: 'proximidade' };

/**
 * Mesmo timbre, cadência que acelera até o tom contínuo na iminência (10 cm).
 * Curva côncava (expoente 1,3): no limite do alcance o bipe é espaçado (~700 ms)
 * e a aceleração fica nítida ao cruzar o alerta (~260 ms a 225 cm, ~150 ms a 1 m).
 */
export function bipeProximidade(cm: number): BipeCabine {
  if (cm <= 10) return { intervaloMs: 0, som: 'proximidade' };
  const t = (Math.min(GAMEPLAY_ECO_MAXIMO_CM, cm) - 10) / (GAMEPLAY_ECO_MAXIMO_CM - 10);
  return { intervaloMs: Math.round(100 + 600 * t ** 1.3), som: 'proximidade' };
}

/**
 * `sono` vem da webcam da cabine (`sonoCabine`); sem webcam (`null`) o painel
 * fica exatamente como antes. A sonolência alerta também parada (pronto), só
 * não no fim do desafio, quando o cartão do resultado ocupa a tela.
 */
export function alertaCabine(estado: EstadoGameplay, sono: SonoCabine | null = null): AlertaCabine {
  const { sensor, atitude, maquina, contato, fase } = estado;
  const dormindo = sono?.status === 'alarm' && fase !== 'fim';
  const faixas = physicalRiskBands({
    distance: sensor.eco ? sensor.distanciaCm : null,
    pitch: atitude.arfagemGraus,
    roll: atitude.rolagemGraus,
    collisionFlag: sensor.alerta || contato,
  });
  const faixa: FaixaCabine = faixas.proximityLevel === 'danger' ? 'perigo'
    : sensor.eco ? 'atencao' : 'livre';
  const perto = faixas.distance !== null && faixas.distance <= 100;
  const graus = Math.round(faixas.angle);
  // Prioridade: contato > obstáculo > sonolência > zona de risco > inclinação.
  const geofence = geofenceTalhao(maquina);
  const zona = geofence.nivel !== 'fora';

  let bipe: BipeCabine = MUDO, motivoBipe: string | null = null;
  if (fase === 'dirigindo') {
    if (contato) { bipe = bipeProximidade(0); motivoBipe = MOTIVOS_BIPE.contato; }
    else if (sensor.alerta) { bipe = bipeProximidade(sensor.distanciaCm); motivoBipe = MOTIVOS_BIPE.alerta; }
    else if (dormindo) { bipe = BIPE_SONO; motivoBipe = MOTIVOS_BIPE.sono; }
    // Tom do meio, só da zona de risco: rápido dentro, ritmo do alerta a caminho.
    else if (zona) { bipe = { intervaloMs: geofence.nivel === 'dentro' ? 120 : BIPE_RAPIDO_MS, som: 'zona' }; motivoBipe = geofence.nivel === 'dentro' ? MOTIVOS_BIPE.zonaDentro : MOTIVOS_BIPE.zonaRumo; }
    // Mesmo ritmo do alerta, tom mais grave: dá para saber qual dos dois sem olhar.
    else if (faixas.inclination) { bipe = { intervaloMs: BIPE_RAPIDO_MS, som: 'inclinacao' }; motivoBipe = MOTIVOS_BIPE.inclinacao; }
    else if (sensor.eco) { bipe = bipeProximidade(sensor.distanciaCm); motivoBipe = MOTIVOS_BIPE.eco; }
    // Alarme de ré (Lupa, fila vazia 2): antes a ré engatava muda; prioridade mais baixa, nunca cobre um alerta.
    else if (maquina.re && maquina.velocidadeKph >= RE_BIPE_MIN_KPH) { bipe = BIPE_RE; motivoBipe = MOTIVOS_BIPE.re; }
  } else if (dormindo) { bipe = BIPE_SONO; motivoBipe = MOTIVOS_BIPE.sono; }

  const vinheta: VinhetaCabine = dormindo ? 'critica'
    : fase !== 'dirigindo' ? 'nenhuma'
    : contato || perto || geofence.nivel === 'dentro' ? 'critica'
      : sensor.alerta || zona || faixas.inclination ? 'alerta' : 'nenhuma';

  const cerca = fase === 'dirigindo' && !maquina.re && cercaAFrente(maquina);
  const rotulo = contato ? 'Contato com o obstáculo'
    : sensor.alerta ? 'Alerta de colisão'
      : zona ? `Zona de risco: ${geofence.zona!.rotulo}`
      : faixas.inclination ? 'Risco de tombamento'
      : faixa === 'atencao' ? 'Obstáculo à frente'
        : sensor.eco ? 'Caminho livre' : cerca ? 'Cerca do talhão à frente' : 'Sem obstáculo no alcance';

  return {
    faixa,
    distanciaTexto: sensor.eco ? metros(sensor.distanciaCm) : `+${GAMEPLAY_ECO_MAXIMO_CM / 100} m`,
    alerta: sensor.alerta || dormindo || zona || faixas.inclination,
    // Os dois juntos: o obstáculo vem primeiro, é o que pede freio mais rápido.
    rotuloAlerta: sensor.alerta ? ROTULO_ALERTA_CABINE : dormindo ? ROTULO_ALERTA_SONO : zona ? rotuloGeofenceCabine(geofence) : faixas.inclination ? rotuloInclinacaoCabine(graus) : cerca ? ROTULO_CERCA_CABINE : '',
    rotulo,
    velocidadeTexto: `${Math.round(maquina.velocidadeKph)} km/h${maquina.re ? ' · ré' : ''}`,
    inclinacao: { ligada: faixas.inclination, graus },
    bipe,
    vinheta,
    geofence,
    sono: dormindo,
    cerca,
    motivoBipe,
  };
}
