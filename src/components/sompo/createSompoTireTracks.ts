import * as THREE from 'three';

/** Rodas traseiras do MAX (SOMPO_AGRI_RIG_LAYOUT['max-tractor']): x do eixo, meia bitola e largura do pneu, em m. */
export const RASTRO_EIXO_X = -1.3234;
export const RASTRO_MEIA_BITOLA = 1.0435;
export const RASTRO_LARGURA_M = 0.5;
/** Uma marca a cada passo, por roda; o anel guarda ~120 m de rastro por roda. */
export const RASTRO_PASSO_M = 0.4;
export const RASTRO_MARCAS = 600;
/** Salto maior que isto entre quadros é recomeço/teleporte: o rastro some. */
export const RASTRO_SALTO_M = 3;
export const RASTRO_ALTURA_M = 0.06;

/** Garras do pneu agrícola: barras em diagonal alternada, bordas suaves, sem textura. */
export const RASTRO_GLSL = `float trackSide = abs(trackUv.x - 0.5) * 2.0;
float trackLug = fract(trackUv.y * 3.0 + (trackUv.x - 0.5) * 0.9 * sign(trackUv.x - 0.5));
float trackMark = mix(0.55, 1.0, step(0.5, trackLug)) * (1.0 - smoothstep(0.78, 1.0, trackSide));
diffuseColor.a *= trackMark;`;

function material() {
  const m = new THREE.MeshBasicMaterial({ color: 0x22150b, transparent: true, opacity: 0.78, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 trackUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntrackUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 trackUv;')
      .replace('#include <color_fragment>', `#include <color_fragment>\n${RASTRO_GLSL}`);
  };
  m.customProgramCacheKey = () => 'sompo-tire-tracks-v1';
  return m;
}

/**
 * Rastro das rodas traseiras na terra: só visual (sem colisor, sem eco, sem
 * efeito no sensor ou no desfecho). Anel de marcas instanciadas (1 draw call),
 * cada uma alinhada ao rumo e assentada no relevo. `update(machine)` depois de
 * posicionar o trator; um salto (recomeço) limpa o campo.
 */
export function createSompoTireTracks(parent: THREE.Object3D, ground: (x: number, z: number) => number) {
  const geometry = new THREE.PlaneGeometry(RASTRO_LARGURA_M, RASTRO_PASSO_M * 1.05);
  geometry.rotateX(-Math.PI / 2);
  const mat = material();
  const marcas = new THREE.InstancedMesh(geometry, mat, RASTRO_MARCAS);
  marcas.name = 'sompo-rastro-pneus'; marcas.count = 0; marcas.frustumCulled = false;
  marcas.renderOrder = -1;
  parent.add(marcas);
  const t = new THREE.Object3D(), roda = new THREE.Vector3(), frente = new THREE.Vector3();
  const ultimas: (THREE.Vector3 | null)[] = [null, null];
  const centro = new THREE.Vector3(), centroAnterior = new THREE.Vector3(Number.NaN, 0, 0);
  let proxima = 0, total = 0;

  function limpar() {
    marcas.count = 0; proxima = 0; total = 0; ultimas[0] = ultimas[1] = null;
  }

  function carimbar(x: number, z: number, rumo: number) {
    // 6 cm: a malha do terreno interpola entre vértices a cada 2 m e fica até alguns cm acima do relevo analítico.
    t.position.set(x, ground(x, z) + RASTRO_ALTURA_M, z);
    t.rotation.set(0, rumo, 0);
    t.updateMatrix();
    marcas.setMatrixAt(proxima, t.matrix);
    proxima = (proxima + 1) % RASTRO_MARCAS;
    total += 1;
    marcas.count = Math.min(RASTRO_MARCAS, total);
    marcas.instanceMatrix.needsUpdate = true;
  }

  return {
    mesh: marcas,
    get marcas() { return marcas.count; },
    limpar,
    update(machine: THREE.Object3D) {
      machine.updateMatrixWorld();
      centro.setFromMatrixPosition(machine.matrixWorld);
      const salto = Number.isFinite(centroAnterior.x) && Math.hypot(centro.x - centroAnterior.x, centro.z - centroAnterior.z) > RASTRO_SALTO_M;
      centroAnterior.copy(centro);
      if (salto) limpar();
      frente.set(1, 0, 0).transformDirection(machine.matrixWorld);
      // Marca alinhada ao trator: o eixo longo da marca (z local) segue o rumo.
      const rumo = Math.atan2(frente.x, frente.z);
      for (const [i, lado] of [[0, -1], [1, 1]] as const) {
        roda.set(RASTRO_EIXO_X, 0, lado * RASTRO_MEIA_BITOLA).applyMatrix4(machine.matrixWorld);
        const ultima = ultimas[i];
        if (!ultima) { ultimas[i] = roda.clone(); continue; }
        const dx = roda.x - ultima.x, dz = roda.z - ultima.z, d = Math.hypot(dx, dz);
        if (d < RASTRO_PASSO_M) continue;
        // Preenche o caminho percorrido no quadro (a 12 km/h e 20 fps são ~0,17 m: no máximo 1 marca).
        const passos = Math.min(8, Math.floor(d / RASTRO_PASSO_M));
        for (let k = 1; k <= passos; k++) {
          const f = (k * RASTRO_PASSO_M) / d;
          carimbar(ultima.x + dx * f, ultima.z + dz * f, rumo);
        }
        ultima.set(ultima.x + dx * (passos * RASTRO_PASSO_M) / d, 0, ultima.z + dz * (passos * RASTRO_PASSO_M) / d);
      }
    },
    dispose() {
      marcas.removeFromParent(); marcas.dispose(); geometry.dispose(); mat.dispose();
    },
  };
}
