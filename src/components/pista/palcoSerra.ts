/**
 * Palco three.js da serra: renderer SOMPO, cenário, atores, pós e qualidade
 * adaptativa (PERFIL_GAMEPLAY, mesmo regulador do trator). O laço de jogo vem
 * de fora (`passo`), dentro do rAF daqui, como no palco do trator.
 */
import * as THREE from 'three';
import { createSompoRenderer, createSompoRenderMeter, disposeSompoObject } from '../sompo/sompoStage';
import { createSompoPostProcessing } from '../sompo/createSompoPostProcessing';
import { criarPortaoDeAquecimento, pixelRatioDoDegrau, PERFIL_GAMEPLAY, qualidadeInicial, regularQualidade } from '../sompo/qualidadeAdaptativa';
import type { SompoRenderStats } from '../sompo/sompoStudioConfig';
import { montarCenarioSerra } from './cenarioSerra';
import { criarAtoresSerra, type VistaPista } from './atoresSerra';
import { PISTA_SERRA } from './pistaSerra';
import type { RetratoPista } from './corridaPista';

export interface OpcoesPalcoSerra {
  mount: HTMLElement;
  /** Laço de jogo: chamado uma vez por quadro, devolve o retrato a desenhar. */
  passo: (dt: number) => { retrato: RetratoPista; vista: VistaPista; olhar: { yaw: number; pitch: number } };
  aoStats?: (stats: SompoRenderStats) => void;
  aoModelo?: (status: string) => void;
  aoErroWebgl?: () => void;
}

export function montarPalcoSerra({ mount, passo, aoStats, aoModelo, aoErroWebgl }: OpcoesPalcoSerra) {
  let renderer: THREE.WebGLRenderer;
  try { renderer = createSompoRenderer(mount).renderer; } catch { aoErroWebgl?.(); return { reiniciar() {}, dispose() {} }; }
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.3, 1400);
  const cenario = montarCenarioSerra(scene, renderer, PISTA_SERRA);
  const atores = criarAtoresSerra(scene, camera, PISTA_SERRA, (status) => { mount.dataset.modelo = status; aquecimento.abrir(); aoModelo?.(status); });
  const post = createSompoPostProcessing(renderer, scene, camera);
  const perfil = PERFIL_GAMEPLAY, degraus = perfil.degraus;
  let qualidade = qualidadeInicial(perfil.degrauInicial ?? 0, perfil);
  const aplicar = () => {
    const d = degraus[qualidade.degrau], ratio = pixelRatioDoDegrau(d, window.devicePixelRatio);
    if (ratio !== renderer.getPixelRatio()) { renderer.setPixelRatio(ratio); post.setPixelRatio(ratio); redimensionar(); }
    post.setEnabled(d.pos);
    if (renderer.shadowMap.enabled !== d.sombras) {
      renderer.shadowMap.enabled = d.sombras;
      scene.traverse((n) => { const m = n as THREE.Mesh; if (m.isMesh) for (const x of Array.isArray(m.material) ? m.material : [m.material]) x.needsUpdate = true; });
    }
    mount.dataset.qualidade = String(qualidade.degrau);
  };
  const aquecimento = criarPortaoDeAquecimento();
  const medidor = createSompoRenderMeter(renderer, (stats) => {
    aoStats?.(stats);
    if (!aquecimento.passa()) return;
    const antes = qualidade.degrau;
    qualidade = regularQualidade(qualidade, stats.fps, performance.now(), perfil);
    if (qualidade.degrau !== antes) aplicar();
  });
  const redimensionar = () => {
    const w = Math.max(1, mount.clientWidth), h = Math.max(1, mount.clientHeight);
    renderer.setSize(w, h, false); post.resize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  const observador = new ResizeObserver(redimensionar); observador.observe(mount);
  redimensionar(); aplicar();
  const reduzido = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let quadro = 0, ultimo = performance.now(), vivo = true;
  const laco = (agora: number) => {
    if (!vivo) return;
    quadro = requestAnimationFrame(laco);
    const dt = Math.min(0.1, Math.max(0, (agora - ultimo) / 1000)); ultimo = agora;
    medidor.begin();
    const { retrato, vista, olhar } = passo(dt);
    atores.quadro(retrato, dt, vista, !!reduzido?.matches, olhar);
    const p = atores.posicao(); cenario.seguir(p.x, p.y, p.z);
    post.render(dt);
    medidor.end();
  };
  quadro = requestAnimationFrame(laco);
  renderer.domElement.addEventListener('webglcontextlost', () => aoErroWebgl?.());
  return {
    reiniciar() { atores.reiniciar(); },
    dispose() {
      vivo = false; cancelAnimationFrame(quadro); observador.disconnect();
      atores.dispose(); cenario.dispose(); post.dispose(); disposeSompoObject(scene);
      renderer.dispose(); renderer.domElement.remove();
    },
  };
}
