/**
 * Cabine do Trator MAX no gameplay (contrato `CabineGameplay` da Direção).
 *
 * O palco segue carregando `/models/sompo/max-tractor.glb` (o /sompo não muda).
 * A variante `max-tractor-cabine.glb` sai do mesmo gerador com os mesmos bounds e
 * coordenadas (build-max-tractor.py, MAX_TRACTOR_VARIANT=cabine), então a cabine
 * troca só a geometria da superfície do corpo pela da variante (sem barra de
 * painel, assento e volante antigos) e põe o `rig-volante` num pivô próprio que
 * gira com o esterço. Banco procedural provisório até o banco do Tripo entrar.
 * Tudo volta ao original em `desmontar`.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CabineGameplay, CriarCabineGameplay, QuadroCabine } from '../cabineGameplay';

export const CABINE_MAX_URL = '/models/gameplay/max-tractor-cabine.glb';
/** Material do corpo do Trator MAX no GLB do /sompo e na variante (mesmo nome nos dois). */
export const MATERIAL_CORPO_MAX = 'MAX acabamento unificado';

export interface VolanteRig {
  /** Centro do aro no referencial da máquina (+X frente, +Y cima). */
  center: readonly [number, number, number];
  /** Eixo da coluna, unitário, apontando para o operador. */
  axis: readonly [number, number, number];
  rimRadius: number;
}

export interface AssetCabineMax {
  /** Corpo da variante (mesmas coordenadas do corpo do /sompo). */
  corpo: THREE.BufferGeometry;
  /** Aro, raios, cubo e manopla, no referencial da máquina. */
  volante: THREE.BufferGeometry;
  rig: VolanteRig;
}

/** Lê o GLB da variante já baixado e separa corpo e volante pelos nós do gerador. */
export async function extrairAssetCabineMax(glb: ArrayBuffer, rig: VolanteRig): Promise<AssetCabineMax> {
  const gltf = await new GLTFLoader().parseAsync(glb, '/models/gameplay/');
  gltf.scene.updateMatrixWorld(true);
  const pegar = (prefixo: string) => {
    let achado: THREE.Mesh | null = null;
    gltf.scene.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!achado && mesh.isMesh && mesh.name.startsWith(prefixo)) achado = mesh;
    });
    if (!achado) throw new Error(`Cabine MAX: nó ${prefixo}* ausente no GLB`);
    const mesh = achado as THREE.Mesh;
    const geometria = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    geometria.computeBoundingSphere();
    return geometria;
  };
  const corpo = pegar('rig-body--');
  const volante = pegar('rig-volante--');
  gltf.scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
  });
  return { corpo, volante, rig };
}

async function carregarAssetPadrao(signal: AbortSignal): Promise<AssetCabineMax> {
  const [glb, provenance] = await Promise.all([
    fetch(CABINE_MAX_URL, { signal }).then((r) => { if (!r.ok) throw new Error(`Cabine MAX: HTTP ${r.status}`); return r.arrayBuffer(); }),
    fetch(CABINE_MAX_URL.replace(/\.glb$/, '.provenance.json'), { signal }).then((r) => { if (!r.ok) throw new Error(`Cabine MAX provenance: HTTP ${r.status}`); return r.json(); }),
  ]);
  const rig = provenance?.rig?.steeringWheel as VolanteRig | undefined;
  if (!rig?.center || !rig?.axis) throw new Error('Cabine MAX: provenance sem rig.steeringWheel');
  return extrairAssetCabineMax(glb, rig);
}

/**
 * Banco provisório (almofada, encosto e pedestal) sobre o piso da cabine, sob o
 * olho `MAX_CABIN_EYE` (-0,65; 2,5). Uma chamada de desenho.
 */
export function criarBancoProvisorio() {
  const partes = [
    { size: [0.2, 0.2, 0.2], pos: [-0.74, 1.46, 0] },          // pedestal sobre o piso (y≈1,36)
    { size: [0.46, 0.11, 0.46], pos: [-0.74, 1.6, 0] },        // almofada
    { size: [0.1, 0.56, 0.46], pos: [-0.99, 1.92, 0], tilt: -0.18 }, // encosto, um pouco reclinado
  ] as const;
  const geometrias = partes.map(({ size, pos, ...resto }) => {
    const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
    if ('tilt' in resto) g.rotateZ(resto.tilt);
    return g.translate(pos[0], pos[1], pos[2]);
  });
  const geometria = mergeGeometries(geometrias)!;
  geometrias.forEach((g) => g.dispose());
  const banco = new THREE.Mesh(geometria, new THREE.MeshStandardMaterial({ color: 0x1b1d1f, roughness: 0.62, metalness: 0.05 }));
  banco.name = 'cabine-banco-provisorio';
  banco.castShadow = false;
  banco.receiveShadow = true;
  return banco;
}

/** Superfície do corpo do Trator MAX montada pelo rigSompoAgriAsset (agri-body → agri-body-surface). */
function acharSuperficieCorpo(maquina: THREE.Object3D) {
  const corpo = maquina.getObjectByName('agri-body');
  if (!corpo) return null;
  for (const filho of corpo.children) {
    const mesh = filho as THREE.Mesh;
    if (mesh.isMesh && !Array.isArray(mesh.material) && mesh.material.name === MATERIAL_CORPO_MAX) return { corpo, superficie: mesh };
  }
  return null;
}

export interface OpcoesCabineMax {
  /** Troca a origem do asset (teste, prévia). Padrão: fetch do GLB e da provenance da variante. */
  carregar?: (signal: AbortSignal) => Promise<AssetCabineMax>;
}

export function criarCabineMax(opcoes: OpcoesCabineMax = {}): CabineGameplay {
  const carregar = opcoes.carregar ?? carregarAssetPadrao;
  const abort = new AbortController();
  let maquina: THREE.Object3D | null = null;
  let asset: AssetCabineMax | null = null;
  let aplicada: { superficie: THREE.Mesh; original: THREE.BufferGeometry } | null = null;
  let pivo: THREE.Group | null = null;
  let banco: THREE.Mesh | null = null;
  const eixo = new THREE.Vector3();

  function aplicar() {
    if (aplicada || !asset || !maquina) return;
    const achado = acharSuperficieCorpo(maquina);
    if (!achado) return; // modelo ainda carregando (ou fallback sem o corpo do MAX): tenta no próximo quadro
    const { corpo, superficie } = achado;
    aplicada = { superficie, original: superficie.geometry };
    superficie.geometry = asset.corpo;
    eixo.fromArray(asset.rig.axis).normalize();
    pivo = new THREE.Group();
    pivo.name = 'cabine-volante-pivo';
    pivo.position.fromArray(asset.rig.center);
    const aro = new THREE.Mesh(asset.volante.clone().translate(-asset.rig.center[0], -asset.rig.center[1], -asset.rig.center[2]), superficie.material);
    aro.name = 'cabine-volante';
    aro.castShadow = false;
    aro.receiveShadow = true;
    pivo.add(aro);
    corpo.add(pivo);
    banco = criarBancoProvisorio();
    corpo.add(banco);
  }

  return {
    montar(alvo) {
      maquina = alvo;
      void carregar(abort.signal).then((pronto) => {
        if (abort.signal.aborted) { pronto.corpo.dispose(); pronto.volante.dispose(); return; }
        asset = pronto;
        aplicar();
      }).catch((erro) => {
        if (!abort.signal.aborted) console.warn('Cabine MAX não carregou; segue a cabine do /sompo.', erro);
      });
    },
    quadro({ anguloAroRad }: QuadroCabine) {
      if (!aplicada) aplicar();
      // + = horário visto do banco. O eixo aponta para o operador, e girar +θ nele é anti-horário para quem
      // olha da ponta, então o aro gira -θ.
      if (pivo) pivo.quaternion.setFromAxisAngle(eixo, -anguloAroRad);
    },
    desmontar() {
      abort.abort();
      if (aplicada) aplicada.superficie.geometry = aplicada.original;
      if (pivo) {
        pivo.removeFromParent();
        (pivo.children[0] as THREE.Mesh).geometry.dispose();
      }
      if (banco) {
        banco.removeFromParent();
        banco.geometry.dispose();
        (banco.material as THREE.Material).dispose();
      }
      asset?.corpo.dispose();
      asset?.volante.dispose();
      aplicada = null; pivo = null; banco = null; asset = null; maquina = null;
    },
  };
}

export const criarCabineGameplayMax: CriarCabineGameplay = () => criarCabineMax();
