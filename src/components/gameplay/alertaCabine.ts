/**
 * Tradução do EstadoGameplay no que o Painel da cabine mostra e toca.
 * Puro: o painel chama com o retrato de `ler()` e só desenha o resultado.
 *
 * Duas regras com papéis diferentes (grill r1, Operador Q1):
 * - a cor vem das faixas do `/sompo` (`physicalRiskBands`): amarelo abaixo de
 *   200 cm, vermelho até 100 cm ou com o flag de alerta;
 * - o alerta (faixa vermelha e bipe rápido) é o flag do ESP32 a 150 cm,
 *   que a física da Direção já entrega em `sensor.alerta`.
 */
import { physicalRiskBands } from '../../../shared/sompo-physical-interactions.js';
import type { EstadoGameplay } from './estadoGameplay';
import { geofenceTalhao, type GeofenceTalhao } from './geofenceTalhao';

export type FaixaCabine = 'livre' | 'atencao' | 'perigo';

/**
 * Bordas vermelhas da tela, como o "dano" do Call of Duty (pedido do Linz, 20/10):
 * `alerta` com o flag de 150 cm ou a inclinação, `critica` a até 100 cm ou no contato.
 */
export type VinhetaCabine = 'nenhuma' | 'alerta' | 'critica';

/** Cadência do bipe: `null` mudo, `0` tom contínuo, senão um bipe a cada `intervaloMs`. */
export interface BipeCabine { intervaloMs: number | null; frequenciaHz: number }

export interface AlertaCabine {
  faixa: FaixaCabine;
  /** "2,4 m", ou "+4 m" sem eco. */
  distanciaTexto: string;
  /** Faixa vermelha no alto do para-brisa: alerta de 150 cm ou inclinação a partir de 20°. */
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
}

export const ROTULO_ALERTA_CABINE = 'Obstáculo a 1,5 m · freie';
/** Faixa vermelha do risco de tombamento: rolagem ou arfagem a partir de 20°. */
export const rotuloInclinacaoCabine = (graus: number) => `Inclinação de ${graus}° · freie`;
/** Faixa da zona de risco do talhão (geofence). */
export const rotuloGeofenceCabine = (g: GeofenceTalhao) => g.nivel === 'dentro' ? `Dentro da ${g.zona!.rotulo.toLowerCase()} · saia` : g.nivel === 'rumo' ? `Rumo à ${g.zona!.rotulo.toLowerCase()} · desvie` : '';
export const BIPE_LENTO_MS = 600;
export const BIPE_RAPIDO_MS = 200;

const MUDO: BipeCabine = { intervaloMs: null, frequenciaHz: 0 };

const metros = (cm: number) => `${(cm / 100).toFixed(1).replace('.', ',')} m`;

export function alertaCabine(estado: EstadoGameplay): AlertaCabine {
  const { sensor, atitude, maquina, contato, fase } = estado;
  const faixas = physicalRiskBands({
    distance: sensor.eco ? sensor.distanciaCm : null,
    pitch: atitude.arfagemGraus,
    roll: atitude.rolagemGraus,
    collisionFlag: sensor.alerta || contato,
  });
  const faixa: FaixaCabine = faixas.proximityLevel === 'danger' ? 'perigo'
    : faixas.proximityLevel === 'attention' ? 'atencao' : 'livre';
  const perto = faixas.distance !== null && faixas.distance <= 100;
  const graus = Math.round(faixas.angle);
  // Prioridade: contato > obstáculo > zona de risco > inclinação.
  const geofence = geofenceTalhao(maquina);
  const zona = geofence.nivel !== 'fora';

  let bipe: BipeCabine = MUDO;
  if (fase === 'dirigindo') {
    if (contato || perto) bipe = { intervaloMs: 0, frequenciaHz: 1320 };
    else if (sensor.alerta) bipe = { intervaloMs: BIPE_RAPIDO_MS, frequenciaHz: 1180 };
    // Tom do meio, só da zona de risco: rápido dentro, ritmo do alerta a caminho.
    else if (zona) bipe = { intervaloMs: geofence.nivel === 'dentro' ? 120 : BIPE_RAPIDO_MS, frequenciaHz: 990 };
    // Mesmo ritmo do alerta, tom mais grave: dá para saber qual dos dois sem olhar.
    else if (faixas.inclination) bipe = { intervaloMs: BIPE_RAPIDO_MS, frequenciaHz: 660 };
    else if (faixa === 'atencao') bipe = { intervaloMs: BIPE_LENTO_MS, frequenciaHz: 880 };
  }

  const vinheta: VinhetaCabine = fase !== 'dirigindo' ? 'nenhuma'
    : contato || perto || geofence.nivel === 'dentro' ? 'critica'
      : sensor.alerta || zona || faixas.inclination ? 'alerta' : 'nenhuma';

  const rotulo = contato ? 'Contato com o obstáculo'
    : sensor.alerta ? 'Alerta de colisão'
      : zona ? `Zona de risco: ${geofence.zona!.rotulo}`
      : faixas.inclination ? 'Risco de tombamento'
      : faixa === 'atencao' ? 'Obstáculo à frente'
        : sensor.eco ? 'Caminho livre' : 'Sem obstáculo no alcance';

  return {
    faixa,
    distanciaTexto: sensor.eco ? metros(sensor.distanciaCm) : '+4 m',
    alerta: sensor.alerta || zona || faixas.inclination,
    // Os dois juntos: o obstáculo vem primeiro, é o que pede freio mais rápido.
    rotuloAlerta: sensor.alerta ? ROTULO_ALERTA_CABINE : zona ? rotuloGeofenceCabine(geofence) : faixas.inclination ? rotuloInclinacaoCabine(graus) : '',
    rotulo,
    velocidadeTexto: `${Math.round(maquina.velocidadeKph)} km/h${maquina.re ? ' · ré' : ''}`,
    inclinacao: { ligada: faixas.inclination, graus },
    bipe,
    vinheta,
    geofence,
  };
}
