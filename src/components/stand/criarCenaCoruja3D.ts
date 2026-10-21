import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { restoreSompoTextures, useSompoExternalTextures } from '../sompo/restoreSompoTextures';
import type { EstadoVoz } from './canal';
import {
  CLIPE_ENTRADA, CLIPE_POR_VOZ, CORUJA_3D_URL, CROSSFADE_S, ENQUADRAMENTO, MORPH_BICO, MORPH_PISCAR, OSSO_PESCOCO,
  acenoFala, brilhoCoruja3D, novaMemoriaRosto, rostoCoruja3D, type MemoriaBrilho,
} from './coruja3dRig';

/**
 * Cena three.js da Coruja 3D. Fica num módulo próprio, importado sob demanda
 * por `AvatarCoruja3D`, para o three/GLTFLoader não entrarem no chunk do stand
 * quando a variante é outra. Erro de WebGL ou de carga sobe por `aoFalhar`.
 */
export interface CenaCoruja3D { dispose(): void }

interface Opcoes {
  canvas: HTMLCanvasElement;
  voz(): EstadoVoz;
  nivel: { current: number };
  parado: boolean;
  aoPronto(): void;
  aoFalhar(erro: unknown): void;
  /** Por quadro, depois do render: voz em vigor e nível de fala suavizado (0..1), para o halo. */
  aoQuadro?(voz: EstadoVoz, fala: number, agoraMs: number): void;
}

/** Índices dos morph targets do rosto numa malha; ausentes ficam -1 (GLB sem rosto segue sem ele). */
interface Rosto { influencias: number[]; piscar: number; bico: number }

function acharRosto(raiz: THREE.Object3D): Rosto[] {
  const rostos: Rosto[] = [];
  raiz.traverse((no) => {
    const malha = no as THREE.Mesh;
    const nomes = malha.isMesh ? malha.morphTargetDictionary : undefined;
    if (!nomes || !malha.morphTargetInfluences) return;
    const r = { influencias: malha.morphTargetInfluences, piscar: nomes[MORPH_PISCAR] ?? -1, bico: nomes[MORPH_BICO] ?? -1 };
    if (r.piscar >= 0 || r.bico >= 0) rostos.push(r);
  });
  return rostos;
}

function liberar(raiz: THREE.Object3D) {
  const materiais = new Set<THREE.Material>();
  const texturas = new Set<THREE.Texture>();
  raiz.traverse((no) => {
    const malha = no as THREE.Mesh;
    if (!malha.isMesh) return;
    malha.geometry.dispose();
    for (const m of Array.isArray(malha.material) ? malha.material : [malha.material]) {
      materiais.add(m);
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) texturas.add(v);
    }
  });
  materiais.forEach((m) => m.dispose());
  texturas.forEach((t) => t.dispose());
}

export function criarCenaCoruja3D({ canvas, voz, nivel, parado, aoPronto, aoFalhar, aoQuadro }: Opcoes): CenaCoruja3D {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  // Penas finas serrilham em tela 1x: desenha a pelo menos 1,5x (teto 2x) e o navegador reduz.
  renderer.setPixelRatio(Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(0x000000, 0);

  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(ENQUADRAMENTO.fov, 1, 0.1, 20);
  cena.add(new THREE.HemisphereLight(0xdcefff, 0x10203a, 0.9));
  const chave = new THREE.DirectionalLight(0xffffff, 2.2);
  chave.position.set(1.6, 2.4, 3);
  cena.add(chave);
  const recorte = new THREE.DirectionalLight(0x64d2ff, 1.6);
  recorte.position.set(-2, 1.6, -1.5);
  cena.add(recorte);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const sala = new RoomEnvironment();
  const ambiente = pmrem.fromScene(sala, 0.04);
  cena.environment = ambiente.texture;
  cena.environmentIntensity = 0.55;
  liberar(sala);
  pmrem.dispose();

  const abortar = new AbortController();
  const relogio = new THREE.Timer();
  const memoria: MemoriaBrilho = { nivel: 0 };
  const memoriaRosto = novaMemoriaRosto(performance.now());
  const movimentoReduzido = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let rostos: Rosto[] = [];
  let entrada: THREE.AnimationAction | null = null;
  let modelo: THREE.Object3D | null = null;
  let mixer: THREE.AnimationMixer | null = null;
  let acoes = new Map<string, THREE.AnimationAction>();
  let atual: THREE.AnimationAction | null = null;
  let vozAtual: EstadoVoz | null = null;
  let pescoco: THREE.Object3D | null = null;
  const emissivos: THREE.MeshStandardMaterial[] = [];
  let quadro = 0;
  let encerrado = false;
  const qPai = new THREE.Quaternion();
  const qAceno = new THREE.Quaternion();
  const eixo = new THREE.Vector3();

  function enquadrar() {
    // Dentro do foreignObject o tamanho CSS é o da arte (1024); vale o tamanho na tela.
    const caixa = canvas.getBoundingClientRect();
    const largura = Math.max(1, Math.round(caixa.width));
    const altura = Math.max(1, Math.round(caixa.height));
    const aspecto = largura / altura;
    renderer.setSize(largura, altura, false);
    camera.aspect = aspecto;
    // Distância que cabe a coruja inteira na altura e na largura do quadro.
    const meiaVertical = THREE.MathUtils.degToRad(ENQUADRAMENTO.fov / 2);
    const distAltura = (ENQUADRAMENTO.altura / 2) / Math.tan(meiaVertical);
    const distLargura = (ENQUADRAMENTO.largura / 2) / (Math.tan(meiaVertical) * aspecto);
    const dist = Math.max(distAltura, distLargura);
    camera.position.set(0, ENQUADRAMENTO.alvoY + 0.05, dist);
    camera.lookAt(0, ENQUADRAMENTO.alvoY, 0);
    camera.updateProjectionMatrix();
  }

  function trocarEstado(proxima: EstadoVoz) {
    if (proxima === vozAtual || !mixer) return;
    vozAtual = proxima;
    const acao = acoes.get(CLIPE_POR_VOZ[proxima]);
    if (!acao || acao === atual) return;
    acao.reset().setEffectiveWeight(1).play();
    if (atual) atual.crossFadeTo(acao, CROSSFADE_S, false);
    atual = acao;
  }

  function desenhar(agora: number) {
    relogio.update(agora);
    const dt = Math.min(relogio.getDelta(), 0.1);
    trocarEstado(voz());
    mixer?.update(dt);
    const v = vozAtual ?? 'ocioso';
    const brilho = brilhoCoruja3D(memoria, v, nivel.current, agora);
    for (const m of emissivos) m.emissiveIntensity = brilho;
    const rosto = rostoCoruja3D(memoriaRosto, v, nivel.current, agora, {
      acenando: entrada !== null && atual === entrada && entrada.isRunning(),
      movimentoReduzido: movimentoReduzido?.matches ?? false,
    });
    for (const r of rostos) {
      if (r.piscar >= 0) r.influencias[r.piscar] = rosto.piscar;
      if (r.bico >= 0) r.influencias[r.bico] = rosto.bico;
    }
    const aceno = acenoFala(memoria, v);
    if (pescoco?.parent && aceno > 0.0005) {
      // Soma o aceno por cima do clipe: eixo lateral do mundo (X) levado ao espaço do pai do osso.
      pescoco.parent.updateWorldMatrix(true, false);
      const paiInv = pescoco.parent.getWorldQuaternion(qPai).invert();
      eixo.set(1, 0, 0).applyQuaternion(paiInv);
      pescoco.quaternion.premultiply(qAceno.setFromAxisAngle(eixo, aceno));
    }
    renderer.render(cena, camera);
    aoQuadro?.(v, memoria.nivel, agora);
  }

  function laco(agora: number) {
    if (encerrado) return;
    if (!document.hidden) desenhar(agora);
    quadro = requestAnimationFrame(laco);
  }

  const observador = new ResizeObserver(() => { enquadrar(); if (parado && modelo) renderer.render(cena, camera); });
  observador.observe(canvas.closest('svg') ?? canvas);
  enquadrar();

  (async () => {
    const resposta = await fetch(CORUJA_3D_URL, { signal: abortar.signal });
    if (!resposta.ok) throw new Error(`Coruja 3D: HTTP ${resposta.status}`);
    const gltf = await useSompoExternalTextures(new GLTFLoader()).parseAsync(await resposta.arrayBuffer(), '/stand/avatar/coruja-3d/');
    await restoreSompoTextures(gltf, CORUJA_3D_URL, abortar.signal);
    if (encerrado) { liberar(gltf.scene); return; }
    modelo = gltf.scene;
    // O modelo olha para +X (Tripo); a câmera está em +Z.
    modelo.rotation.y = -Math.PI / 2;
    modelo.traverse((no) => {
      const malha = no as THREE.Mesh;
      if (malha.isMesh) {
        malha.frustumCulled = false; // a pele animada sai do bounding box de repouso
        const m = malha.material as THREE.MeshStandardMaterial;
        // O mesh do Tripo tem frestas de subpixel entre as penas; com face única o fundo
        // vaza por elas em pontinhos escuros. Dupla face tapa com o interior claro.
        m.side = THREE.DoubleSide;
        if (m.emissiveMap) { m.emissive.set(0xffffff); emissivos.push(m); }
      }
    });
    pescoco = modelo.getObjectByName(OSSO_PESCOCO) ?? null;
    rostos = acharRosto(modelo);
    cena.add(modelo);
    mixer = new THREE.AnimationMixer(modelo);
    acoes = new Map(gltf.animations.map((clipe) => [clipe.name, mixer!.clipAction(clipe)]));
    for (const nome of Object.values(CLIPE_POR_VOZ)) if (!acoes.has(nome)) throw new Error(`Coruja 3D: sem clipe ${nome}`);
    if (parado) {
      vozAtual = 'ocioso';
      acoes.get(CLIPE_POR_VOZ.ocioso)!.play();
      mixer.update(0);
      for (const m of emissivos) m.emissiveIntensity = 0.55;
      renderer.render(cena, camera);
      aoPronto();
      return;
    }
    // Entrada: acena uma vez (só ocioso) e cai no clipe do estado; se a voz mudar
    // no meio, `trocarEstado` faz o crossfade e o fim do aceno não mexe em nada.
    entrada = acoes.get(CLIPE_ENTRADA) ?? null;
    if (entrada && voz() === 'ocioso') {
      const aceno = entrada;
      aceno.setLoop(THREE.LoopOnce, 1).clampWhenFinished = true;
      aceno.play();
      atual = aceno;
      vozAtual = 'ocioso';
      mixer.addEventListener('finished', function aoAcabar(e) {
        if (e.action !== aceno) return;
        mixer?.removeEventListener('finished', aoAcabar);
        if (atual !== aceno) return;
        vozAtual = null;
        trocarEstado(voz());
      });
    } else {
      trocarEstado(voz());
    }
    relogio.update();
    aoPronto();
    quadro = requestAnimationFrame(laco);
  })().catch((erro) => { if (!encerrado) aoFalhar(erro); });

  return {
    dispose() {
      encerrado = true;
      abortar.abort();
      cancelAnimationFrame(quadro);
      observador.disconnect();
      mixer?.stopAllAction();
      relogio.dispose();
      if (modelo) liberar(modelo);
      ambiente.dispose();
      renderer.dispose();
    },
  };
}
