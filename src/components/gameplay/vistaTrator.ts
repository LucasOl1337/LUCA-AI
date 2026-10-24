import * as THREE from 'three';
import { aoFimDeVisita } from '../stand/fimDeVisita';

export type VistaTrator = 'cabine' | 'externa';
let vistaSessao: VistaTrator = 'cabine';
// A vista escolhida vale para a visita; o próximo visitante começa na cabine.
aoFimDeVisita(() => { vistaSessao = 'cabine'; });
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

/**
 * Cabeça do operador na curva (Lupa D7, 24/10). Antes o olho girava exatamente com a máquina:
 * no batente a 12 km/h (0,22 g de lateral) a cabine não dava sinal nenhum da curva e as colunas
 * escondiam para onde o trator ia. Agora a cabeça inclina um pouco para fora da curva
 * (proporcional à aceleração lateral v·ω) e o olhar adianta alguns graus para dentro dela
 * (proporcional à guinada, só de frente). Os dois são amortecidos e independem do FPS.
 */
export const CABECA_CABINE = Object.freeze({
  /** graus de rolagem por m/s² de aceleração lateral, com teto. */
  rolagemPorMs2: 0.6,
  rolagemMaxGraus: 1.5,
  /** olhar adiantado = guinada × isto (s), com teto. */
  antecipacaoS: 0.2,
  olharMaxGraus: 6,
  tauS: 0.25,
});

/** Alvo instantâneo da cabeça. `guinada` em rad/s (positivo = esquerda), `velocidade` em m/s (negativo = ré). */
export function alvoCabecaCabine(guinada: number, velocidade: number) {
  if (!Number.isFinite(guinada) || !Number.isFinite(velocidade)) return { rolagemGraus: 0, olharGraus: 0 };
  const lateral = velocidade * guinada;
  const rolagemGraus = -Math.max(-CABECA_CABINE.rolagemMaxGraus, Math.min(CABECA_CABINE.rolagemMaxGraus, lateral * CABECA_CABINE.rolagemPorMs2));
  const olhar = velocidade > 0 ? guinada * CABECA_CABINE.antecipacaoS * 180 / Math.PI : 0;
  const olharGraus = Math.max(-CABECA_CABINE.olharMaxGraus, Math.min(CABECA_CABINE.olharMaxGraus, olhar));
  return { rolagemGraus: rolagemGraus || 0, olharGraus: olharGraus || 0 };
}

/** Estado amortecido da cabeça; `passo` devolve rolagem (eixo da visão; negativo = cabeça para a direita) e olhar (guinada; positivo = esquerda). */
export function criarCabecaCabine() {
  let rolagem = 0, olhar = 0;
  return {
    passo(guinada: number, velocidade: number, dt: number, reduzirMovimento = false) {
      const alvo = reduzirMovimento ? { rolagemGraus: 0, olharGraus: 0 } : alvoCabecaCabine(guinada, velocidade);
      const k = dt > 0 && Number.isFinite(dt) ? 1 - Math.exp(-Math.min(dt, 0.25) / CABECA_CABINE.tauS) : 0;
      rolagem += (alvo.rolagemGraus - rolagem) * k;
      olhar += (alvo.olharGraus - olhar) * k;
      if (reduzirMovimento) rolagem = olhar = 0;
      return { rolagemGraus: rolagem, olharGraus: olhar };
    },
    reiniciar() { rolagem = olhar = 0; },
  };
}
