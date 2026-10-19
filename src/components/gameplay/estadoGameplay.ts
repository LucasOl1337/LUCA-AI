/**
 * Contrato de estado do Gameplay (grill r1, Direcao Q3 + ajustes do regente).
 * Dono: Gameplay-Direcao. Quem lê: painel da cabine e desafios (Gameplay-Operador).
 *
 * Referencial do palco agrícola, em metros: no rumo 0 a frente é +X e a
 * direita é +Z; rumo positivo gira para a esquerda (rotation.y do palco).
 * Tudo aqui é SIMULADO: sai da física do totem, não de um ESP32.
 */

/** pronto = parado esperando R2; dirigindo = desde a primeira aceleração; fim = desafio encerrou. */
export type FaseGameplay = 'pronto' | 'dirigindo' | 'fim';

/** Obstáculo redondo no chão (o fardo de feno é um cilindro deitado visto de cima). */
export interface ObstaculoGameplay { x: number; z: number; raioM: number }

export interface EstadoGameplay {
  versao: 1;
  fase: FaseGameplay;
  /** ms desde a primeira aceleração; 0 enquanto `pronto`. */
  tempoMs: number;
  maquina: {
    x: number;
    z: number;
    rumoGraus: number;
    /** Sempre positivo; o sentido está em `re`. */
    velocidadeKph: number;
    re: boolean;
  };
  /** Comandos já com zona morta e curva: esterço -1 (esquerda)..1 (direita), acelerador e freio 0..1. */
  comandos: { esterco: number; acelerador: number; freio: number };
  /** HC-SR04 frontal: 2..400 cm; sem eco, 400 e `eco` false. `alerta` = distância <= 150 cm. */
  sensor: { distanciaCm: number; eco: boolean; alerta: boolean };
  /** Atitude da máquina pelo chão sob as rodas (rampaLateral.ts), 0,1°. Rolagem + = lado direito para baixo; arfagem + = nariz para cima. */
  atitude: { rolagemGraus: number; arfagemGraus: number };
  /** Encostou no obstáculo pela frente. */
  contato: boolean;
  /** Teto de velocidade em vigor (12 na condução livre, 6 no desafio). */
  tetoKph: number;
}

export type EventoGameplay =
  | { tipo: 'alerta'; ligado: boolean; tempoMs: number }
  | { tipo: 'contato'; tempoMs: number; velocidadeKph: number }
  /** Borda do classificador de inclinação da Operador (shared/); só a partir do item 3. */
  | { tipo: 'inclinacao'; ligado: boolean; tempoMs: number; graus: number }
  | { tipo: 'fim'; tempoMs: number; motivo: string };

/** Pose e mundo de partida que o desafio passa ao `reiniciar`. Tudo opcional: sem nada, volta ao começo da condução livre. */
export interface InicioGameplay {
  x?: number;
  z?: number;
  rumoGraus?: number;
  /** Substitui o fardo do palco. Lista vazia = campo sem obstáculo. */
  obstaculos?: readonly ObstaculoGameplay[];
  /** Padrão 12 (condução livre); o desafio do fardo usa 6. */
  tetoKph?: number;
}

/**
 * O que o GameplayKiosk entrega a quem monta painel e desafio.
 * `ler`/`assinar` servem `useSyncExternalStore` (o aviso de mudança sai a ~15 Hz);
 * `aoEvento` dispara na borda, no mesmo quadro da física. Os dois devolvem o cancelamento.
 */
export interface CanalGameplay {
  ler(): EstadoGameplay;
  assinar(aoMudar: () => void): () => void;
  aoEvento(aoAcontecer: (evento: EventoGameplay) => void): () => void;
  reiniciar(inicio?: InicioGameplay): void;
  encerrar(motivo: string): void;
}

export const GAMEPLAY_TETO_LIVRE_KPH = 12;
export const GAMEPLAY_TETO_DESAFIO_KPH = 6;
export const GAMEPLAY_ALERTA_CM = 150;
export const GAMEPLAY_ECO_MAXIMO_CM = 400;
