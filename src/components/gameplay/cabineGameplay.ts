/**
 * Ponto de montagem da cabine da Visual (src/components/gameplay/visual/) sobre
 * a máquina do palco. O GameplayKiosk chama `montar` uma vez, no primeiro quadro
 * com a máquina pronta, e `quadro` em todo rAF logo depois de posicionar a
 * câmera de cabine. Tudo que a cabine adicionar vai como filho de `maquina`
 * (anda e inclina junto) e sai em `desmontar`.
 */
import type * as THREE from 'three';
import type { EstadoGameplay } from './estadoGameplay';

export interface QuadroCabine {
  estado: EstadoGameplay;
  /** Ângulo do nó `rig-volante` (rad, eixo da coluna, + = horário visto do banco). Ver `anguloAroRad` em volante.ts. */
  anguloAroRad: number;
  /** Segundos desde o quadro anterior. */
  dt: number;
}

export interface CabineGameplay {
  montar(maquina: THREE.Object3D, camera: THREE.PerspectiveCamera): void;
  quadro(dados: QuadroCabine): void;
  desmontar(): void;
}

export type CriarCabineGameplay = () => CabineGameplay;
