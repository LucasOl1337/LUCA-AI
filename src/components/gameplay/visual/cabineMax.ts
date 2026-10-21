/**
 * Cabine do Trator MAX no gameplay (contrato `CabineGameplay` da Direção).
 *
 * O palco carrega a variante `max-tractor-cabine.glb` pelo gancho `modeloUrl`
 * (mesmo gerador e bounds do /sompo, sem painel, assento e volante antigos;
 * build-max-tractor.py com MAX_TRACTOR_VARIANT=cabine). A cabine então só:
 *  - põe a superfície do `rig-volante` num pivô que gira com o esterço;
 *  - monta o console e o banco do Tripo na cabine (e a tela `tela-luca-ai`, se houver);
 *  - veste os fardos do palco com o fardo do Tripo (os procedurais ficam ocultos).
 * Tudo volta ao original em `desmontar`. O /sompo e o palco não mudam.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { restoreSompoTextures, useSompoExternalTextures } from '../../sompo/restoreSompoTextures';
import { urlPublica } from '../../sompo/urlsPublicas';
import type { CabineGameplay, CriarCabineGameplay, QuadroCabine } from '../cabineGameplay';
import type { EstadoGameplay } from '../estadoGameplay';
import { criarCampoVisual } from './campoVisual';

export const CABINE_MAX_URL = '/models/gameplay/max-tractor-cabine.glb';
export const PROPS_CABINE_URL = Object.freeze({
  console: '/models/gameplay/cabine-console.glb',
  banco: '/models/gameplay/cabine-banco.glb',
  fardo: '/models/gameplay/fardo-feno.glb',
});
/** Grupo do fardo que o palco cria por obstáculo (createSompoAgriStage). */
export const NOME_FARDO_PALCO = 'agri-max-obstacle-hay-bale';
/** Fardo procedural do palco: raio 0,72 m e comprimento 1,25 m, eixo em Z, base em y=0. */
const FARDO_PALCO = { raio: 0.72, comprimento: 1.25 } as const;

export interface VolanteRig {
  /** Centro do aro no referencial da máquina (+X frente, +Y cima). */
  center: readonly [number, number, number];
  /** Eixo da coluna, unitário, apontando para o operador. */
  axis: readonly [number, number, number];
  rimRadius: number;
}

export interface AssetsCabine {
  rig: VolanteRig;
  /** Props do Tripo: +Y cima, frente +Z, base em y=0 (package-tripo-props.py). */
  console: THREE.Object3D;
  banco: THREE.Object3D;
  fardo: THREE.Object3D;
}

/** Tela do console (a `criarTelaPainel` da Operador cumpre isto). */
export interface TelaCabine {
  textura: THREE.Texture;
  desenhar(estado: EstadoGameplay): boolean;
  descartar(): void;
}

/**
 * Encaixe medido no GLB da variante (piso y=1,38 de x -1,0 a 0,15; degrau lateral
 * 1,79 em |z|≥0,57; parede de trás x=-1,18; olho MAX_CABIN_EYE (-0,65; 2,5; 0)).
 */
export const ENCAIXE_CABINE = Object.freeze({
  olho: [-0.65, 2.5, 0] as const,
  // Console no canto da frente à direita, numa coluna que sai do piso, com a frente
  // (+Z do prop) virada para o operador e 23° para o olho: a tela fica na borda de
  // baixo da vista de frente, à direita do volante, sem cobri-lo.
  console: { posicao: [-0.04, 1.86, 0.43] as const, escala: 0.36, rumo: -Math.PI / 2 - 0.4 },
  coluna: { raio: 0.035, base: 1.38 },
  // Tela central do console (coordenadas do console): face do painel em z≈-0,22.
  tela: { centro: [0, 0.7, -0.212] as const, largura: 0.26 },
  // Banco encostado na parede de trás, sobre o piso, de frente para +X.
  banco: { posicao: [-0.87, 1.38, 0] as const, escala: 0.85 },
});

export async function carregarPropTripo(url: string, signal: AbortSignal) {
  const resposta = await fetch(urlPublica(url), { signal });
  if (!resposta.ok) throw new Error(`Prop ${url}: HTTP ${resposta.status}`);
  const gltf = await useSompoExternalTextures(new GLTFLoader()).parseAsync(await resposta.arrayBuffer(), '/models/gameplay/');
  await restoreSompoTextures(gltf, url, signal);
  return gltf.scene;
}

async function carregarAssetsPadrao(signal: AbortSignal): Promise<AssetsCabine> {
  const [provenance, console, banco, fardo] = await Promise.all([
    fetch(urlPublica(CABINE_MAX_URL.replace(/\.glb$/, '.provenance.json')), { signal }).then((r) => { if (!r.ok) throw new Error(`Cabine MAX provenance: HTTP ${r.status}`); return r.json(); }),
    carregarPropTripo(PROPS_CABINE_URL.console, signal),
    carregarPropTripo(PROPS_CABINE_URL.banco, signal),
    carregarPropTripo(PROPS_CABINE_URL.fardo, signal),
  ]);
  const rig = provenance?.rig?.steeringWheel as VolanteRig | undefined;
  if (!rig?.center || !rig?.axis) throw new Error('Cabine MAX: provenance sem rig.steeringWheel');
  return { rig, console, banco, fardo };
}

/**
 * Superfícies do `rig-volante` dentro de `agri-body`: o rigSompoAgriAsset junta o
 * nó ao corpo (não casa com rig-body/wheel/hitch), mas mantém um mesh por nó do
 * GLB. O volante é o único que cabe numa esfera em volta do centro do aro.
 */
export function acharVolante(corpo: THREE.Object3D, rig: VolanteRig) {
  const centro = new THREE.Vector3(...rig.center);
  const raio = rig.rimRadius + 0.12;
  const achados: THREE.Mesh[] = [];
  for (const filho of corpo.children) {
    const mesh = filho as THREE.Mesh;
    if (!mesh.isMesh) continue;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const caixa = mesh.geometry.boundingBox!;
    if (caixa.min.distanceTo(centro) < raio && caixa.max.distanceTo(centro) < raio) achados.push(mesh);
  }
  return achados;
}

function liberar(raiz: THREE.Object3D) {
  raiz.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      for (const valor of Object.values(material)) if (valor instanceof THREE.Texture) valor.dispose();
      material.dispose();
    }
  });
}

function sombras(raiz: THREE.Object3D, projeta: boolean) {
  raiz.traverse((node) => { const mesh = node as THREE.Mesh; if (mesh.isMesh) { mesh.castShadow = projeta; mesh.receiveShadow = true; } });
}

export interface OpcoesCabineMax {
  /** Troca a origem dos assets (teste, prévia). Padrão: provenance da variante e os três GLBs do Tripo. */
  carregar?: (signal: AbortSignal) => Promise<AssetsCabine>;
  /** Tela `tela-luca-ai` do console (ex.: `criarTelaPainel` da Operador). Sem ela, o console mostra a própria textura. */
  criarTela?: () => TelaCabine;
}

type VolanteMovido = { mesh: THREE.Mesh; pai: THREE.Object3D; posicao: THREE.Vector3; sombra: boolean };
type FardoVestido = { grupo: THREE.Object3D; ocultos: THREE.Object3D[]; roupa: THREE.Object3D };

export function criarCabineMax(opcoes: OpcoesCabineMax = {}): CabineGameplay {
  const carregar = opcoes.carregar ?? carregarAssetsPadrao;
  const abort = new AbortController();
  let maquina: THREE.Object3D | null = null;
  let assets: AssetsCabine | null = null;
  let montada = false;
  let semVolante = false;
  let pivo: THREE.Group | null = null;
  let volantes: VolanteMovido[] = [];
  let tela: TelaCabine | null = null;
  let campo: ReturnType<typeof criarCampoVisual> | null = null;
  const extras: THREE.Object3D[] = [];
  const fardos = new Map<THREE.Object3D, FardoVestido>();
  const eixo = new THREE.Vector3();

  function aplicar() {
    if (montada || semVolante || !assets || !maquina) return;
    const corpo = maquina.getObjectByName('agri-body');
    if (!corpo) return; // modelo ainda carregando: tenta no próximo quadro
    const achados = acharVolante(corpo, assets.rig);
    if (!achados.length) {
      // Fallback procedural (ou GLB do catálogo): sem a variante, a cabine não se monta.
      semVolante = true;
      console.warn('Cabine MAX: palco sem a variante com rig-volante; segue a cabine do modelo carregado.');
      return;
    }
    montada = true;
    const { rig } = assets;
    eixo.fromArray(rig.axis).normalize();
    pivo = new THREE.Group();
    pivo.name = 'cabine-volante-pivo';
    pivo.position.fromArray(rig.center);
    corpo.add(pivo);
    volantes = achados.map((mesh) => {
      const movido = { mesh, pai: mesh.parent!, posicao: mesh.position.clone(), sombra: mesh.castShadow };
      pivo!.add(mesh);
      mesh.position.set(-rig.center[0], -rig.center[1], -rig.center[2]);
      mesh.name = 'cabine-volante';
      mesh.castShadow = false;
      return movido;
    });

    const consoleProp = assets.console;
    consoleProp.name = 'cabine-console';
    consoleProp.position.fromArray(ENCAIXE_CABINE.console.posicao);
    consoleProp.scale.setScalar(ENCAIXE_CABINE.console.escala);
    consoleProp.rotation.y = ENCAIXE_CABINE.console.rumo;
    sombras(consoleProp, false);
    // Coluna do piso até a base do console (no referencial do console, que tem escala).
    const { raio, base } = ENCAIXE_CABINE.coluna;
    const altura = (ENCAIXE_CABINE.console.posicao[1] - base) / ENCAIXE_CABINE.console.escala;
    const coluna = new THREE.Mesh(
      new THREE.CylinderGeometry(raio / ENCAIXE_CABINE.console.escala, raio / ENCAIXE_CABINE.console.escala, altura, 12).translate(0, -altura / 2, 0),
      new THREE.MeshStandardMaterial({ color: 0x1c1e20, roughness: 0.55, metalness: 0.4 }),
    );
    coluna.name = 'cabine-console-coluna';
    coluna.receiveShadow = true;
    consoleProp.add(coluna);
    if (opcoes.criarTela) {
      try {
        tela = opcoes.criarTela();
        const { centro, largura } = ENCAIXE_CABINE.tela;
        const plano = new THREE.Mesh(
          new THREE.PlaneGeometry(largura, largura * 10 / 16),
          new THREE.MeshBasicMaterial({ map: tela.textura, toneMapped: false }),
        );
        plano.name = 'tela-luca-ai';
        plano.position.fromArray(centro);
        consoleProp.add(plano);
      } catch (erro) {
        console.warn('Tela do console não montou; segue o console sem ela.', erro);
        tela = null;
      }
    }
    corpo.add(consoleProp);
    extras.push(consoleProp);

    const banco = assets.banco;
    banco.name = 'cabine-banco';
    banco.position.fromArray(ENCAIXE_CABINE.banco.posicao);
    banco.scale.setScalar(ENCAIXE_CABINE.banco.escala);
    banco.rotation.y = Math.PI / 2; // frente (+Z do prop) para +X, onde o operador olha
    sombras(banco, false);
    corpo.add(banco);
    extras.push(banco);
    if (maquina.parent) campo = criarCampoVisual(maquina.parent, assets.fardo);
  }

  /** Veste cada fardo novo do palco com o do Tripo, na mesma escala do procedural. */
  function vestirFardos() {
    const mundo = maquina?.parent;
    if (!mundo || !assets) return;
    for (const grupo of mundo.children) {
      if (grupo.name !== NOME_FARDO_PALCO || fardos.has(grupo)) continue;
      const ocultos = grupo.children.filter((filho) => filho.visible);
      ocultos.forEach((filho) => { filho.visible = false; });
      const roupa = assets.fardo.clone();
      roupa.name = 'fardo-feno-tripo';
      const caixa = new THREE.Box3().setFromObject(assets.fardo);
      const tamanho = caixa.getSize(new THREE.Vector3());
      roupa.scale.set(2 * FARDO_PALCO.raio / tamanho.x, 2 * FARDO_PALCO.raio / tamanho.y, FARDO_PALCO.comprimento / tamanho.z);
      roupa.position.y = -caixa.min.y * roupa.scale.y;
      sombras(roupa, true);
      grupo.add(roupa);
      fardos.set(grupo, { grupo, ocultos, roupa });
    }
  }

  return {
    montar(alvo) {
      maquina = alvo;
      void carregar(abort.signal).then((prontos) => {
        if (abort.signal.aborted) { liberar(prontos.console); liberar(prontos.banco); liberar(prontos.fardo); return; }
        assets = prontos;
        aplicar();
      }).catch((erro) => {
        if (!abort.signal.aborted) console.warn('Cabine MAX não carregou; segue a cabine do modelo carregado.', erro);
      });
    },
    quadro({ estado, anguloAroRad }: QuadroCabine) {
      if (!montada) aplicar();
      if (!montada) return;
      vestirFardos();
      // + = horário visto do banco. O eixo aponta para o operador, e girar +θ nele é anti-horário para quem
      // olha da ponta, então o aro gira -θ.
      pivo!.quaternion.setFromAxisAngle(eixo, -anguloAroRad);
      tela?.desenhar(estado);
    },
    desmontar() {
      abort.abort();
      campo?.descartar();
      campo = null;
      for (const { mesh, pai, posicao, sombra } of volantes) {
        pai.add(mesh);
        mesh.position.copy(posicao);
        mesh.castShadow = sombra;
        mesh.name = 'agri-body-surface';
      }
      pivo?.removeFromParent();
      for (const { ocultos, roupa } of fardos.values()) {
        roupa.removeFromParent();
        ocultos.forEach((filho) => { filho.visible = true; });
      }
      extras.forEach((extra) => extra.removeFromParent());
      for (const nome of ['tela-luca-ai', 'cabine-console-coluna']) {
        const extra = assets?.console.getObjectByName(nome) as THREE.Mesh | undefined;
        if (extra) { extra.geometry.dispose(); (extra.material as THREE.Material).dispose(); extra.removeFromParent(); }
      }
      tela?.descartar();
      if (assets) { liberar(assets.console); liberar(assets.banco); liberar(assets.fardo); }
      volantes = []; extras.length = 0; fardos.clear();
      pivo = null; tela = null; assets = null; maquina = null; montada = false; semVolante = false;
    },
  };
}

export const criarCabineGameplayMax: CriarCabineGameplay = () => criarCabineMax();
