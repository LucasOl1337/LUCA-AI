import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { restoreSompoTextures, useSompoExternalTextures } from '../sompo/restoreSompoTextures';
import { soltarLutCompartilhada } from '../sompo/soltarLutCompartilhada';
import type { EstadoVoz } from './canal';
import {
  CLIPE_ENTRADA, CLIPE_FELIZ, CLIPE_POR_VOZ, CORUJA_3D_PUBLICO, CORUJA_3D_URL, CROSSFADE_S, ENQUADRAMENTO, MALHA_OLHOS, MORPH_BICO,
  OSSO_CABECA, OSSO_PESCOCO, acenoFala, brilhoCoruja3D, cabecaViva, novaMemoriaCabeca, novaMemoriaRosto, rostoCoruja3D, type MemoriaBrilho,
} from './coruja3dRig';
import { OLHOS_CANVAS, desenharOlhos, novaMemoriaOlhos, olhosCoruja3D } from './coruja3dOlhos';

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

/** Morph `bico_abre` numa malha (bico de cima na malha principal, boca e bico de baixo no rosto). */
interface Rosto { influencias: number[]; bico: number; malha: THREE.Mesh; soAberto: boolean }

/** Abaixo disso a boca recolhida fica escondida: recolhida, ela vaza como riscos sob a ponta do bico. */
const BICO_VISIVEL = 0.02;

function acharRosto(raiz: THREE.Object3D): Rosto[] {
  const rostos: Rosto[] = [];
  raiz.traverse((no) => {
    const malha = no as THREE.Mesh;
    const nomes = malha.isMesh ? malha.morphTargetDictionary : undefined;
    if (!nomes || !malha.morphTargetInfluences) return;
    const bico = nomes[MORPH_BICO] ?? -1;
    const soAberto = [malha.name, malha.parent?.name].some((n) => n?.startsWith('CorujaRosto'));
    if (bico >= 0) rostos.push({ influencias: malha.morphTargetInfluences, bico, malha, soAberto });
  });
  return rostos;
}

/**
 * Tela dos olhos: canvas 2D como textura da malha `CorujaOlhos`. Transparente
 * fora do olho; emissivo fraco, como uma tela atrás do vidro do visor.
 */
function criarTelaOlhos() {
  const canvas = document.createElement('canvas');
  canvas.width = OLHOS_CANVAS.largura;
  canvas.height = OLHOS_CANVAS.altura;
  const ctx = canvas.getContext('2d');
  const textura = new THREE.CanvasTexture(canvas);
  textura.flipY = false; // UV do glTF: v=0 no topo da imagem
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.anisotropy = 4;
  const material = new THREE.MeshStandardMaterial({
    map: textura, emissiveMap: textura, emissive: 0xffffff, emissiveIntensity: 0.32,
    transparent: true, depthWrite: false, roughness: 0.18, metalness: 0,
  });
  return { ctx, textura, material };
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
  const memoriaOlhos = novaMemoriaOlhos(performance.now());
  const memoriaCabeca = novaMemoriaCabeca();
  /** Tela dos olhos: nasce com o modelo (só se o GLB tiver a malha). */
  let tela: ReturnType<typeof criarTelaOlhos> | null = null;
  let ultimoDesenho = '';
  const movimentoReduzido = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let rostos: Rosto[] = [];
  let entrada: THREE.AnimationAction | null = null;
  let modelo: THREE.Object3D | null = null;
  let mixer: THREE.AnimationMixer | null = null;
  let acoes = new Map<string, THREE.AnimationAction>();
  let atual: THREE.AnimationAction | null = null;
  let vozAtual: EstadoVoz | null = null;
  let pescoco: THREE.Object3D | null = null;
  let cabeca: THREE.Object3D | null = null;
  const repouso = new Map<THREE.Object3D, THREE.Quaternion>();
  /** Clipe de uma vez em curso (aceno de entrada ou feliz depois da fala). */
  let umaVez: THREE.AnimationAction | null = null;
  const emissivos: THREE.MeshStandardMaterial[] = [];
  let quadro = 0;
  let encerrado = false;
  const qPai = new THREE.Quaternion();
  const qAceno = new THREE.Quaternion();
  const eixo = new THREE.Vector3();

  /** Gira o osso por cima do clipe em torno de um eixo do mundo (x, y ou z da cena). */
  function somarRotacao(osso: THREE.Object3D, x: number, y: number, z: number, angulo: number) {
    if (!osso.parent || Math.abs(angulo) < 0.0002) return;
    osso.parent.updateWorldMatrix(true, false);
    const paiInv = osso.parent.getWorldQuaternion(qPai).invert();
    eixo.set(x, y, z).applyQuaternion(paiInv);
    osso.quaternion.premultiply(qAceno.setFromAxisAngle(eixo, angulo));
  }

  function tocarUmaVez(acao: THREE.AnimationAction) {
    acao.reset().setLoop(THREE.LoopOnce, 1);
    acao.clampWhenFinished = true;
    acao.setEffectiveWeight(1).play();
    if (atual && atual !== acao) atual.crossFadeTo(acao, CROSSFADE_S, false);
    atual = acao;
    umaVez = acao;
  }

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
    const anterior = vozAtual;
    vozAtual = proxima;
    // Fim da fala: um feliz curto (asas e cabeça) antes de voltar ao ocioso.
    const feliz = acoes.get(CLIPE_FELIZ);
    if (anterior === 'falando' && proxima === 'ocioso' && feliz && !(movimentoReduzido?.matches ?? false)) {
      tocarUmaVez(feliz);
      return;
    }
    umaVez = null;
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
    // Ossos com soma procedural voltam ao repouso antes do mixer (clipe que não os
    // anima não deixa a soma acumular de um quadro para o outro).
    for (const [osso, q] of repouso) osso.quaternion.copy(q);
    mixer?.update(dt);
    const v = vozAtual ?? 'ocioso';
    const brilho = brilhoCoruja3D(memoria, v, nivel.current, agora);
    for (const m of emissivos) m.emissiveIntensity = brilho;
    const reduzido = movimentoReduzido?.matches ?? false;
    const acenando = entrada !== null && umaVez === entrada && entrada.isRunning();
    const rosto = rostoCoruja3D(memoriaRosto, v, nivel.current, agora, { acenando, movimentoReduzido: reduzido });
    for (const r of rostos) {
      r.influencias[r.bico] = rosto.bico;
      if (r.soAberto) r.malha.visible = rosto.bico > BICO_VISIVEL;
    }
    const olhos = olhosCoruja3D(memoriaOlhos, v, rosto.piscar, agora, { feliz: acenando, movimentoReduzido: reduzido });
    pintarOlhos(olhos);
    // Aceno da fala no pescoço (eixo lateral da cena) e a cabeça seguindo o olhar.
    if (pescoco) somarRotacao(pescoco, 1, 0, 0, acenoFala(memoria, v));
    if (cabeca && !reduzido) {
      const c = cabecaViva(memoriaCabeca, olhos, v, agora);
      somarRotacao(cabeca, 0, 1, 0, c.guinada);
      somarRotacao(cabeca, 1, 0, 0, c.arfagem);
      somarRotacao(cabeca, 0, 0, 1, c.rolagem);
    }
    renderer.render(cena, camera);
    aoQuadro?.(v, memoria.nivel, agora);
  }

  function pintarOlhos(olhos: ReturnType<typeof olhosCoruja3D>) {
    if (!tela?.ctx) return;
    const chave = [olhos.abertura, olhos.x, olhos.y, olhos.feliz, olhos.pupila].map((n) => n.toFixed(3)).join();
    if (chave === ultimoDesenho) return;
    ultimoDesenho = chave;
    desenharOlhos(tela.ctx, olhos);
    tela.textura.needsUpdate = true;
  }

  function laco(agora: number) {
    if (encerrado) return;
    if (!document.hidden) desenhar(agora);
    quadro = requestAnimationFrame(laco);
  }

  const observador = new ResizeObserver(() => { enquadrar(); if (parado && modelo) renderer.render(cena, camera); });
  observador.observe(canvas.closest('svg') ?? canvas);
  enquadrar();

  // GPU reiniciada ou contexto tomado: o canvas pararia; cai na Coruja A pelo mesmo caminho de erro.
  const contextoPerdido = (evento: Event) => {
    evento.preventDefault();
    if (encerrado) return;
    cancelAnimationFrame(quadro);
    aoFalhar(new Error('Coruja 3D: contexto WebGL perdido'));
  };
  canvas.addEventListener('webglcontextlost', contextoPerdido);

  (async () => {
    const resposta = await fetch(CORUJA_3D_URL, { signal: abortar.signal });
    if (!resposta.ok) throw new Error(`Coruja 3D: HTTP ${resposta.status}`);
    const gltf = await useSompoExternalTextures(new GLTFLoader()).parseAsync(await resposta.arrayBuffer(), '/stand/avatar/coruja-3d/');
    // O GLB vem com hash de /assets/; o manifesto e as imagens seguem no caminho público.
    await restoreSompoTextures(gltf, CORUJA_3D_PUBLICO, abortar.signal);
    if (encerrado) { liberar(gltf.scene); return; }
    modelo = gltf.scene;
    // O modelo olha para +X (Tripo); a câmera está em +Z.
    modelo.rotation.y = -Math.PI / 2;
    modelo.traverse((no) => {
      const malha = no as THREE.Mesh;
      if (malha.isMesh) {
        malha.frustumCulled = false; // a pele animada sai do bounding box de repouso
        // O rosto tem dois materiais (o da coruja e o interior escuro da boca).
        if (malha.name === MALHA_OLHOS || malha.parent?.name === MALHA_OLHOS) {
          (malha.material as THREE.Material).dispose();
          tela ??= criarTelaOlhos();
          malha.material = tela.material;
          malha.renderOrder = 2;
          return;
        }
        for (const m of (Array.isArray(malha.material) ? malha.material : [malha.material]) as THREE.MeshStandardMaterial[]) {
          // O mesh do Tripo tem frestas de subpixel entre as penas; com face única o fundo
          // vaza por elas em pontinhos escuros. Dupla face tapa com o interior claro.
          m.side = THREE.DoubleSide;
          if (m.emissiveMap && !emissivos.includes(m)) { m.emissive.set(0xffffff); emissivos.push(m); }
        }
      }
    });
    pescoco = modelo.getObjectByName(OSSO_PESCOCO) ?? null;
    cabeca = modelo.getObjectByName(OSSO_CABECA) ?? null;
    for (const osso of [pescoco, cabeca]) if (osso) repouso.set(osso, osso.quaternion.clone());
    rostos = acharRosto(modelo);
    for (const r of rostos) if (r.soAberto) r.malha.visible = false;
    cena.add(modelo);
    mixer = new THREE.AnimationMixer(modelo);
    acoes = new Map(gltf.animations.map((clipe) => [clipe.name, mixer!.clipAction(clipe)]));
    for (const nome of Object.values(CLIPE_POR_VOZ)) if (!acoes.has(nome)) throw new Error(`Coruja 3D: sem clipe ${nome}`);
    if (parado) {
      vozAtual = 'ocioso';
      acoes.get(CLIPE_POR_VOZ.ocioso)!.play();
      mixer.update(0);
      for (const m of emissivos) m.emissiveIntensity = 0.55;
      pintarOlhos(olhosCoruja3D(memoriaOlhos, 'ocioso', 0, performance.now(), { movimentoReduzido: true }));
      renderer.render(cena, camera);
      aoPronto();
      return;
    }
    // Entrada: acena uma vez (só ocioso) e cai no clipe do estado; se a voz mudar
    // no meio, `trocarEstado` faz o crossfade e o fim do aceno não mexe em nada.
    entrada = acoes.get(CLIPE_ENTRADA) ?? null;
    // Fim de um clipe de uma vez (aceno ou feliz): volta ao clipe do estado em vigor.
    mixer.addEventListener('finished', (e) => {
      if (e.action !== umaVez || atual !== umaVez) return;
      umaVez = null;
      const ocioso = acoes.get(CLIPE_POR_VOZ[voz()])!;
      ocioso.reset().setEffectiveWeight(1).play();
      atual!.crossFadeTo(ocioso, CROSSFADE_S, false);
      atual = ocioso;
      vozAtual = voz();
    });
    if (entrada && voz() === 'ocioso') {
      vozAtual = 'ocioso';
      tocarUmaVez(entrada);
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
      canvas.removeEventListener('webglcontextlost', contextoPerdido);
      soltarLutCompartilhada(renderer, cena);
      abortar.abort();
      cancelAnimationFrame(quadro);
      observador.disconnect();
      mixer?.stopAllAction();
      relogio.dispose();
      if (modelo) liberar(modelo);
      tela?.material.dispose();
      tela?.textura.dispose();
      ambiente.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
