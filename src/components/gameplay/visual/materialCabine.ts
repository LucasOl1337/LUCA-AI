/**
 * Acabamento da cabine do Trator MAX, só no gameplay.
 *
 * O corpo da variante tem um material único com a cor no vértice (sem imagens).
 * De perto, na vista do operador, os plásticos pretos e cinza ficavam lisos como
 * borracha de brinquedo e a pintura azul, fosca pelo piso acetinado do palco.
 * Este acabamento entra depois do piso e do desgaste (rigSompoAgriAsset) e,
 * pela classe da cor do vértice:
 *  - plástico preto e cinza: grão de couro/plástico texturizado (Fabric Leather 02,
 *    Poly Haven, CC0) em triplanar no espaço do objeto (não escorrega com a máquina),
 *    com a rugosidade do mesmo mapa;
 *  - pintura azul: verniz mais liso, que reflete o céu, e casca de laranja leve.
 * O vidro (cor azulada, como no desgaste) fica como está. As normais saem
 * vincadas (até VINCO_RAD suaviza, acima mantém a aresta): o capô e os pilares
 * deixam de parecer lapidados. `desfazer` devolve geometria, shader e chave de
 * programa originais; o /sompo não passa por aqui.
 */
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

export const DETALHE_CABINE_URL = '/models/gameplay/cabine-detalhe-couro.jpg';
/** Ladrilhos por metro: o mapa da Poly Haven cobre 0,5 m. */
const ESCALA_DETALHE = 2;
/** Ângulo até onde faces vizinhas dividem a normal (o chanfro do capô fica abaixo, as quinas acima). */
export const VINCO_RAD = THREE.MathUtils.degToRad(34);

const VERTEX = `#include <begin_vertex>
  cabP = position;
  cabN = normal;
  cabVX = normalMatrix * vec3(1., 0., 0.);
  cabVY = normalMatrix * vec3(0., 1., 0.);
  cabVZ = normalMatrix * vec3(0., 0., 1.);`;

const FRAGMENTO = `#ifdef USE_COLOR
  {
    vec3 cabC = vColor.rgb;
    float cabLum = max(cabC.r, max(cabC.g, cabC.b));
    float cabVidro = step(.72, cabC.b / max(cabC.g, .001)) * step(.32, cabC.r / max(cabC.g, .001));
    float cabAzul = smoothstep(.1, .3, cabC.b - cabC.r) * (1. - cabVidro);
    float cabPreto = (1. - smoothstep(.03, .1, cabLum)) * (1. - cabAzul) * (1. - cabVidro);
    float cabPlastico = clamp(1. - cabAzul - cabVidro, 0., 1.);
    vec3 cabNo = normalize(cabN);
    vec3 cabPeso = pow(abs(cabNo), vec3(4.));
    cabPeso /= cabPeso.x + cabPeso.y + cabPeso.z;
    vec3 cabQ = cabP * cabEscala;
    vec3 cabTx = texture2D(cabDetalhe, cabQ.zy).rgb;
    vec3 cabTy = texture2D(cabDetalhe, cabQ.xz).rgb;
    vec3 cabTz = texture2D(cabDetalhe, cabQ.xy).rgb;
    vec2 cabDx = cabTx.rg * 2. - 1.;
    vec2 cabDy = cabTy.rg * 2. - 1.;
    vec2 cabDz = cabTz.rg * 2. - 1.;
    vec3 cabDesvio = vec3(0., cabDx.y, cabDx.x) * cabPeso.x + vec3(cabDy.x, 0., cabDy.y) * cabPeso.y + vec3(cabDz.x, cabDz.y, 0.) * cabPeso.z;
    float cabGrao = cabTx.b * cabPeso.x + cabTy.b * cabPeso.y + cabTz.b * cabPeso.z;
    float cabForca = cabPlastico * mix(.42, .6, cabPreto) + cabAzul * .05;
    mat3 cabVista = mat3(cabVX, cabVY, cabVZ);
    vec3 cabBase = normalize(cabVista * cabNo);
    vec3 cabNova = normalize(cabVista * normalize(cabNo + cabDesvio * cabForca));
    normal = normalize(normal + (cabNova - cabBase));
    // Plástico: rugosidade do próprio mapa em volta da do palco; o grão escurece de leve as cavidades.
    roughnessFactor = mix(roughnessFactor, clamp(roughnessFactor * (.78 + .44 * cabGrao), .3, .62), cabPlastico);
    diffuseColor.rgb *= mix(1., .88 + .24 * cabGrao, cabPlastico * .6);
    // Pintura: verniz (abaixo do piso acetinado de 0,46), sem passar por cima da poeira.
    roughnessFactor = mix(roughnessFactor, min(roughnessFactor, .3), cabAzul * .85);
  }
#endif
#include <lights_physical_fragment>`;

export interface AcabamentoCabine {
  desfazer(): void;
}

/** Carrega o mapa de detalhe (fora do DOM, como nos testes node, devolve uma textura vazia). */
export function carregarDetalheCabine(url = DETALHE_CABINE_URL) {
  const podeCarregar = typeof document !== 'undefined' && typeof document.createElementNS === 'function';
  const textura = podeCarregar ? new THREE.TextureLoader().load(url) : new THREE.Texture();
  textura.name = 'cabine-detalhe-couro';
  textura.colorSpace = THREE.NoColorSpace;
  textura.wrapS = THREE.RepeatWrapping;
  textura.wrapT = THREE.RepeatWrapping;
  textura.anisotropy = 8;
  return textura;
}

/**
 * Normais vincadas só onde o modelo veio facetado: o vértice cuja normal já era
 * suave (pilares redondos, aro) mantém a original; o que tinha a normal da face
 * (capô lapidado) passa a dividir com as vizinhas até VINCO_RAD.
 */
export function vincarSoFacetas(geometria: THREE.BufferGeometry, vinco = VINCO_RAD) {
  const normalOriginal = geometria.attributes.normal;
  if (!normalOriginal) return null;
  // Sem índice, o three vinca no lugar: a cópia preserva a original para `desfazer`.
  const vincada = toCreasedNormals(geometria.index ? geometria : geometria.clone(), vinco);
  const original = (geometria.index ? geometria.toNonIndexed() : geometria).attributes.normal;
  const pos = vincada.attributes.position;
  const normal = vincada.attributes.normal;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), face = new THREE.Vector3(), n = new THREE.Vector3();
  for (let f = 0; f < pos.count; f += 3) {
    a.fromBufferAttribute(pos, f); b.fromBufferAttribute(pos, f + 1); c.fromBufferAttribute(pos, f + 2);
    face.subVectors(c, b).cross(a.sub(b)).normalize();
    for (let v = f; v < f + 3; v++) {
      n.fromBufferAttribute(original, v);
      if (n.dot(face) < 0.9995) normal.setXYZ(v, n.x, n.y, n.z);
    }
  }
  normal.needsUpdate = true;
  return vincada;
}

type Original = {
  onBeforeCompile: THREE.Material['onBeforeCompile'];
  customProgramCacheKey: THREE.Material['customProgramCacheKey'];
};

/** Aplica o acabamento nos materiais com cor de vértice das superfícies dadas. */
export function acabarCabine(superficies: THREE.Mesh[], detalhe: THREE.Texture): AcabamentoCabine {
  const originais = new Map<THREE.MeshStandardMaterial, Original>();
  const geometrias: Array<{ mesh: THREE.Mesh; original: THREE.BufferGeometry; vincada: THREE.BufferGeometry }> = [];
  for (const mesh of superficies) {
    const materiais = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (mesh.geometry.attributes.position && materiais.some((m) => (m as THREE.MeshStandardMaterial).isMeshStandardMaterial && m.vertexColors)) {
      const vincada = vincarSoFacetas(mesh.geometry);
      if (vincada) {
        geometrias.push({ mesh, original: mesh.geometry, vincada });
        mesh.geometry = vincada;
      }
    }
    for (const qualquer of materiais) {
      // Pela marca, não por instanceof: o teste node carrega o three duas vezes (ESM e CJS).
      const material = qualquer as THREE.MeshStandardMaterial;
      if (!material?.isMeshStandardMaterial || !material.vertexColors || originais.has(material)) continue;
      const original = { onBeforeCompile: material.onBeforeCompile, customProgramCacheKey: material.customProgramCacheKey };
      originais.set(material, original);
      const chaveAnterior = original.customProgramCacheKey.call(material);
      material.onBeforeCompile = (shader, renderer) => {
        original.onBeforeCompile.call(material, shader, renderer);
        shader.uniforms.cabDetalhe = { value: detalhe };
        shader.uniforms.cabEscala = { value: ESCALA_DETALHE };
        shader.vertexShader = 'varying vec3 cabP;\nvarying vec3 cabN;\nvarying vec3 cabVX;\nvarying vec3 cabVY;\nvarying vec3 cabVZ;\n'
          + shader.vertexShader.replace('#include <begin_vertex>', VERTEX);
        shader.fragmentShader = 'uniform sampler2D cabDetalhe;\nuniform float cabEscala;\nvarying vec3 cabP;\nvarying vec3 cabN;\nvarying vec3 cabVX;\nvarying vec3 cabVY;\nvarying vec3 cabVZ;\n'
          + shader.fragmentShader.replace('#include <lights_physical_fragment>', FRAGMENTO);
      };
      material.customProgramCacheKey = () => `${chaveAnterior}|gameplay-cabine-acabamento-v1`;
      material.needsUpdate = true;
    }
  }
  return {
    desfazer() {
      for (const [material, original] of originais) {
        material.onBeforeCompile = original.onBeforeCompile;
        material.customProgramCacheKey = original.customProgramCacheKey;
        material.needsUpdate = true;
      }
      originais.clear();
      for (const { mesh, original, vincada } of geometrias) {
        if (mesh.geometry === vincada) mesh.geometry = original;
        vincada.dispose();
      }
      geometrias.length = 0;
    },
  };
}
