import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { sompoRenderBudget } from './sompoStage';
import { SompoDepthAOPass } from './createSompoDepthAO';

/**
 * Cadeia real de pós: render HDR com MSAA 4× → AO de profundidade →
 * ACES/sRGB no OutputPass. MSAA resolve arestas geométricas e fios, enquanto
 * alphaToCoverage usa as mesmas quatro amostras na folhagem recortada.
 * No perfil compacto segue o passe único anterior, sem custo extra.
 */
export function createSompoPostProcessing(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, ambientOcclusionEnabled = true) {
  if (sompoRenderBudget().compact) {
    return {
      resize(_width: number, _height: number) {},
      render(_delta: number) { renderer.render(scene, camera); },
      dispose() {},
    };
  }
  // A profundidade resolvida do alvo multiamostrado alimenta o AO sem repetir
  // a geometria; o segundo buffer do composer herda o mesmo attachment.
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType) });
  const composer = new EffectComposer(renderer, target);
  // Escala interna 1,0: respeita integralmente o pixelRatio do renderer.
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.addPass(new RenderPass(scene, camera));
  const ambientOcclusion = new SompoDepthAOPass(camera);
  ambientOcclusion.enabled = ambientOcclusionEnabled;
  composer.addPass(ambientOcclusion);
  // Materiais já chegam finitos ao alvo; evitar um blit fullscreen só para
  // sanitização preserva orçamento para MSAA sem reduzir resolução.
  composer.addPass(new OutputPass());
  return {
    resize(width: number, height: number) {
      composer.setSize(Math.max(1, width), Math.max(1, height));
    },
    render(_delta: number) { composer.render(); },
    dispose() { ambientOcclusion.dispose(); composer.dispose(); target.dispose(); },
  };
}
