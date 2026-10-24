import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { sompoRenderBudget } from './sompoStage';
import { SompoDepthAOPass } from './createSompoDepthAO';
import { Pass } from 'three/addons/postprocessing/Pass.js';

/** Desenha a cena no alvo MSAA dela, fora do vaivém de buffers do composer. */
class SompoScenePass extends Pass {
  constructor(private readonly inner: RenderPass, private readonly sceneTarget: THREE.WebGLRenderTarget) { super(); this.needsSwap = false; }
  setSize(width: number, height: number) { this.sceneTarget.setSize(width, height); }
  render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, _read: THREE.WebGLRenderTarget, delta: number, maskActive: boolean) { this.inner.render(renderer, this.sceneTarget, this.sceneTarget, delta, maskActive); }
  dispose() { this.inner.dispose(); this.sceneTarget.dispose(); }
}

/**
 * Cadeia real de pós: render HDR (alvo HalfFloat com MSAA) → bloom só do que
 * passa de 1.0 (sol, reflexos, céu) → tone mapping/sRGB no OutputPass → grade
 * cinematográfica leve (vinheta, saturação, split quente/frio) em sRGB.
 * No perfil compacto segue o passe único anterior, sem custo extra.
 */
export function createSompoPostProcessing(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  if (sompoRenderBudget().compact) {
    return {
      resize(_width: number, _height: number) {},
      setPixelRatio(_ratio: number) {},
      setEnabled(_enabled: boolean) {},
      setGrade(_enabled: boolean) {},
      render(_delta: number) { renderer.render(scene, camera); },
      dispose() {},
    };
  }
  // Só a cena tem geometria a suavizar: ela vai para um alvo próprio com MSAA e
  // profundidade resolvida (o AO lê). Os buffers do composer são simples: num
  // quad de tela cheia o MSAA repete o mesmo valor nas 4 amostras e só custava
  // limpar e resolver cor e profundidade a cada passada.
  const sceneTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType) });
  sceneTarget.texture.name = 'SompoPost.scene';
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new SompoScenePass(new RenderPass(scene, camera), sceneTarget));
  const ambientOcclusion = new SompoDepthAOPass(camera, sceneTarget);
  composer.addPass(ambientOcclusion);
  // The AO composite sanitizes its HDR output before bloom in the same draw.
  // Limiar acima do teto branco do baú ao sol: em 1.1 ele florescia num halo
  // leitoso sobre a carroceria e os aros; farol, sol e reflexo seguem acima.
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.2, 0.35, 1.6);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, resolution: { value: new THREE.Vector2(1, 1) } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse; uniform vec2 resolution;
      // Ruído azul barato (interleaved gradient noise).
      float ign(vec2 p){return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715))));}
      void main(){
        vec3 c=texture2D(tDiffuse,vUv).rgb;
        float lum=dot(c,vec3(.2126,.7152,.0722));
        c=mix(vec3(lum),c,1.12);                                   // saturação
        c=mix(c,c*c*(3.-2.*c),.4);                                 // contraste (curva S)
        c*=mix(vec3(1.),vec3(1.1,1.,.86),smoothstep(.45,1.,lum)*.6);  // altas quentes
        c*=mix(vec3(1.),vec3(.9,.98,1.1),smoothstep(.5,0.,lum)*.5);    // sombras frias
        c=max(c,vec3(.018,.02,.026));                               // preto sem esmagar
        c=c-max(c-.82,0.)*.55;                                      // ombro: branco sem clipar
        vec2 p=(vUv-.5)*vec2(resolution.x/max(1.,resolution.y),1.);
        c*=1.-.30*smoothstep(.42,1.15,length(p));                  // vinheta
        // Grão fixo na tela: forte nos meios-tons, some nas altas e nos pretos.
        // Em 8 bits faz o papel de dither e quebra o degrau do céu e da névoa.
        // Não anima por quadro: em A/B intercalado contra a main, o grão vivo
        // custou +2,7 a +3,6 ms por quadro e o fixo +0,1 a +0,3 ms.
        vec2 px=gl_FragCoord.xy;
        float n=ign(px)+ign(px+vec2(17.,43.))-1.;
        float mid=4.*lum*(1.-lum);
        c+=n*(.004+.012*mid);
        gl_FragColor=vec4(c,1.);
      }`,
  });
  composer.addPass(grade);
  // Totem com FPS baixo desliga a cadeia inteira e cai no render direto.
  let enabled = true;
  let disposed = false;
  return {
    resize(width: number, height: number) {
      composer.setSize(Math.max(1, width), Math.max(1, height));
      grade.uniforms.resolution.value.set(Math.max(1, width), Math.max(1, height));
    },
    setPixelRatio(ratio: number) { composer.setPixelRatio(ratio); },
    setEnabled(value: boolean) { enabled = value; },
    /** Quem já gradua no tone mapping (look do gameplay) desliga este passe para não graduar duas vezes. */
    setGrade(value: boolean) { grade.enabled = value; },
    render(_delta: number) { if (enabled) composer.render(); else renderer.render(scene, camera); },
    dispose() {
      if (disposed) return;
      disposed = true;
      // EffectComposer owns its two buffers, not the passes (including disabled ones).
      for (const pass of composer.passes) pass.dispose();
      // Three r185's bloom.dispose() omits this extraction material.
      bloom.materialHighPassFilter.dispose();
      composer.dispose();
    },
  };
}
