import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

class HalfResolutionGtao extends GTAOPass {
  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean) {
    const hidden: THREE.Object3D[] = [];
    this.scene.traverseVisible((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      // The normal override cannot reproduce foliage/particle alpha: treating their
      // entire cards as solid occluders causes black rectangles and wastes fill rate.
      if (materials.every((material) => material.transparent || material.alphaTest > 0)) {
        hidden.push(object); object.visible = false;
      }
    });
    const shadowAutoUpdate = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false; // RenderPass already updated moving shadows this frame.
    try { super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive); }
    finally { renderer.shadowMap.autoUpdate = shadowAutoUpdate; hidden.forEach((object) => { object.visible = true; }); }
  }
  override setSize(width: number, height: number) { super.setSize(Math.max(1, Math.round(width / 2)), Math.max(1, Math.round(height / 2))); }
}
class HalfResolutionBloom extends UnrealBloomPass {
  override setSize(width: number, height: number) { super.setSize(Math.max(1, Math.round(width / 2)), Math.max(1, Math.round(height / 2))); }
}

/** Restrict AO and bloom to half-resolution targets; keep the final scene/sharp typography at full resolution. */
export function createSompoPostProcessing(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 });
  const composer = new EffectComposer(renderer, target);
  const render = new RenderPass(scene, camera);
  const ao = new HalfResolutionGtao(scene, camera, 512, 256);
  ao.updateGtaoMaterial({ radius: 0.7, thickness: 0.5, distanceExponent: 1.5, distanceFallOff: 1, samples: 8, scale: 1 });
  ao.updatePdMaterial({ radius: 3, rings: 2, samples: 8 });
  ao.blendIntensity = 0.55;
  const bloom = new HalfResolutionBloom(new THREE.Vector2(512, 256), 0.10, 0.35, 1.35);
  const output = new OutputPass();
  const vignette = new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 color=texture2D(tDiffuse,vUv); float edge=smoothstep(0.25,0.72,length(vUv-0.5)); gl_FragColor=vec4(color.rgb*(1.0-edge*0.16),color.a); }',
  });
  for (const pass of [render, ao, bloom, output, vignette]) composer.addPass(pass);
  return {
    resize(width: number, height: number) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(width, height); },
    render(delta: number) { composer.render(delta); },
    dispose() { for (const pass of composer.passes) pass.dispose(); composer.dispose(); },
  };
}
