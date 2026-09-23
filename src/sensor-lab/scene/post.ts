import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/**
 * Cadeia de pós do laboratório: cena em HDR com MSAA e profundidade →
 * desfoque de profundidade por coleta em espiral (lê o depth buffer da própria
 * passada, sem renderizar a cena de novo) → bloom do que passa de 1 →
 * tone mapping ACES → vinheta, aberração cromática leve e grão.
 */

const FULLSCREEN_VERTEX = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

const DOF_TAPS = 36;

export interface PostChain {
  setSize(width: number, height: number): void;
  setFocus(distance: number, aperture: number): void;
  setDepthOfField(enabled: boolean): void;
  render(elapsed: number): void;
  dispose(): void;
}

export function createPostChain(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, options: { samples: number; bloom: boolean }): PostChain {
  const depthTexture = new THREE.DepthTexture(1, 1, THREE.FloatType);
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: options.samples, depthTexture, depthBuffer: true });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));

  const dof = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      tDepth: { value: null },
      cameraNear: { value: camera.near },
      cameraFar: { value: camera.far },
      focusDistance: { value: 10 },
      aperture: { value: 0.2 },
      maxBlur: { value: 12 },
      resolution: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader: `#include <packing>
      uniform sampler2D tDiffuse; uniform sampler2D tDepth;
      uniform float cameraNear; uniform float cameraFar;
      uniform float focusDistance; uniform float aperture; uniform float maxBlur;
      uniform vec2 resolution;
      varying vec2 vUv;
      float viewDepth(vec2 uv){
        float depth = texture2D(tDepth, uv).x;
        return -perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
      }
      float circle(float z){ return clamp(abs(z - focusDistance) * aperture / max(z, 1e-3), 0.0, 1.0) * maxBlur; }
      void main(){
        vec3 base = texture2D(tDiffuse, vUv).rgb;
        if (maxBlur < 0.5) { gl_FragColor = vec4(base, 1.0); return; }
        float centerDepth = viewDepth(vUv);
        float centerSize = circle(centerDepth);
        vec3 sum = base;
        float weight = 1.0;
        for (int i = 0; i < ${DOF_TAPS}; i++) {
          float fi = float(i) + 0.5;
          float radius = sqrt(fi / ${DOF_TAPS}.0) * maxBlur;
          float angle = fi * 2.39996323;
          vec2 uv = vUv + vec2(cos(angle), sin(angle)) * radius / resolution;
          vec3 color = texture2D(tDiffuse, uv).rgb;
          float depth = viewDepth(uv);
          float size = circle(depth);
          // Fundo desfocado não vaza por cima de primeiro plano nítido.
          if (depth > centerDepth) size = min(size, centerSize * 2.0);
          float w = smoothstep(radius - 1.5, radius + 0.5, size);
          sum += color * w;
          weight += w;
        }
        gl_FragColor = vec4(sum / weight, 1.0);
      }`,
  });
  composer.addPass(dof);

  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.45, 1.3);
  bloom.enabled = options.bloom;
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, resolution: { value: new THREE.Vector2(1, 1) }, time: { value: 0 } },
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 resolution; uniform float time; varying vec2 vUv;
      void main(){
        vec2 p = vUv - 0.5;
        float r2 = dot(p, p);
        vec2 shift = p * r2 * 0.01;
        vec3 c = vec3(texture2D(tDiffuse, vUv + shift).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - shift).b);
        float edge = length(p * vec2(resolution.x / max(resolution.y, 1.0), 1.0));
        c *= 1.0 - smoothstep(0.42, 1.08, edge) * 0.38;
        float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(lum), c, 1.05);
        c = mix(c, c * vec3(0.96, 1.0, 1.06), smoothstep(0.35, 0.0, lum) * 0.35);
        float grain = fract(sin(dot(gl_FragCoord.xy + fract(time) * 173.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
        c += grain * 0.014 * (1.0 - lum * 0.6);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  composer.addPass(grade);

  let dofEnabled = true;
  let focus = { distance: 10, aperture: 0.2 };

  return {
    setSize(width, height) {
      composer.setSize(width, height);
      const pixelRatio = renderer.getPixelRatio();
      const w = Math.max(1, Math.round(width * pixelRatio));
      const h = Math.max(1, Math.round(height * pixelRatio));
      dof.uniforms.resolution.value.set(w, h);
      grade.uniforms.resolution.value.set(w, h);
      bloom.resolution.set(w, h);
      // Desfoque medido em pixels de tela: acompanha a densidade.
      dof.uniforms.maxBlur.value = dofEnabled ? Math.min(18, 9 * pixelRatio) : 0;
    },
    setFocus(distance, aperture) {
      focus = { distance, aperture };
      dof.uniforms.focusDistance.value = distance;
      dof.uniforms.aperture.value = aperture;
    },
    setDepthOfField(enabled) {
      dofEnabled = enabled;
      dof.enabled = enabled;
    },
    render(elapsed) {
      dof.uniforms.cameraNear.value = camera.near;
      dof.uniforms.cameraFar.value = camera.far;
      // O RenderPass escreve no buffer de leitura do momento; a profundidade vem dele.
      dof.uniforms.tDepth.value = composer.readBuffer.depthTexture;
      dof.uniforms.focusDistance.value = focus.distance;
      grade.uniforms.time.value = elapsed;
      composer.render();
    },
    dispose() {
      composer.dispose();
      target.dispose();
      depthTexture.dispose();
      bloom.dispose();
    },
  };
}
