import * as THREE from 'three';

export type VistaTrator = 'cabine' | 'externa';
let vistaSessao: VistaTrator = 'cabine';
export const lerVistaTrator = () => vistaSessao;
export function alternarVistaTrator() {
  vistaSessao = vistaSessao === 'cabine' ? 'externa' : 'cabine';
  return vistaSessao;
}
/** Atraso do rumo da câmera externa (Lupa D5, 24/10). Antes ela era um ponto preso ao trator: em
 * curva o mundo inteiro girava junto com o capô e a curva sumia. Agora a posição acompanha o
 * trator e só o rumo segue com atraso de primeira ordem, então numa curva se vê o trator virar. */
export const VISTA_EXTERNA = Object.freeze({
  tauS: 0.35,
  /** Acima disso é reinício/teleporte, não curva: a câmera pula para o rumo atual. */
  saltoM: 4,
  saltoRad: Math.PI / 2,
  /** Passo acima disso (aba voltou, vista religada) também recoloca a câmera atrás. */
  dtMaxS: 0.25,
});

/** Rumo no plano do chão a partir da frente do MAX (+X local); igual a `rotation.y` com ordem YZX. */
export function rumoDaMaquina(maquina: THREE.Object3D, frente = new THREE.Vector3()) {
  frente.set(1, 0, 0).transformDirection(maquina.matrixWorld);
  return Math.atan2(-frente.z, frente.x);
}

/** Um passo do rumo amortecido pelo caminho mais curto; independe do FPS. */
export function amortecerRumo(atual: number, alvo: number, dt: number, tauS = VISTA_EXTERNA.tauS) {
  const erro = Math.atan2(Math.sin(alvo - atual), Math.cos(alvo - atual));
  if (!(dt > 0) || !(tauS > 0)) return dt > 0 ? alvo : atual;
  return atual + erro * (1 - Math.exp(-dt / tauS));
}

/** Frente do MAX = +X local; câmera fica atrás e acima, sem mudar a física. `dt` ausente = sem atraso. */
export function criarVistaExterna() {
  const olho = new THREE.Vector3(), alvo = new THREE.Vector3(), base = new THREE.Vector3(), frente = new THREE.Vector3();
  const ultimaBase = new THREE.Vector3();
  let rumo: number | null = null;
  const seguir = (camera: THREE.PerspectiveCamera, maquina: THREE.Object3D, dt?: number) => {
    maquina.updateWorldMatrix(true, false);
    maquina.getWorldPosition(base);
    const rumoMaquina = rumoDaMaquina(maquina, frente);
    const desvio = rumo === null ? Infinity : Math.abs(Math.atan2(Math.sin(rumoMaquina - rumo), Math.cos(rumoMaquina - rumo)));
    const pular = rumo === null || dt === undefined || !(dt >= 0) || dt > VISTA_EXTERNA.dtMaxS
      || base.distanceTo(ultimaBase) > VISTA_EXTERNA.saltoM || desvio > VISTA_EXTERNA.saltoRad;
    rumo = pular ? rumoMaquina : amortecerRumo(rumo!, rumoMaquina, dt!);
    ultimaBase.copy(base);
    const c = Math.cos(rumo), s = Math.sin(rumo);
    // (−10, 6, 0) e (2,5; 1,2; 0) no referencial do rumo amortecido, só em guinada.
    olho.set(base.x - 10 * c, base.y + 6, base.z + 10 * s);
    alvo.set(base.x + 2.5 * c, base.y + 1.2, base.z - 2.5 * s);
    camera.position.copy(olho); camera.up.set(0, 1, 0); camera.lookAt(alvo);
  };
  /** Fora da vista externa: a próxima entrada nasce atrás do trator, sem varrer o rumo antigo. */
  return Object.assign(seguir, { reiniciar() { rumo = null; } });
}
