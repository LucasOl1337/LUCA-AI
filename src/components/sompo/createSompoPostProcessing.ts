import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { sompoRenderBudget } from './sompoStage';

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
      render(_delta: number) { renderer.render(scene, camera); },
      dispose() {},
    };
  }
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  // Um texel NaN/Inf contaminaria todos os mips do bloom e apagaria o frame
  // inteiro. O passe zera qualquer valor inválido antes da extração de altas.
  const sanitize = new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse;
      void main(){
        vec4 c=texture2D(tDiffuse,vUv);
        if(isnan(c.r)||isinf(c.r))c.r=0.;
        if(isnan(c.g)||isinf(c.g))c.g=0.;
        if(isnan(c.b)||isinf(c.b))c.b=0.;
        gl_FragColor=vec4(c.rgb,1.);
      }`,
  });
  composer.addPass(sanitize);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.32, 1.25);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, resolution: { value: new THREE.Vector2(1, 1) } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse; uniform vec2 resolution;
      void main(){
        vec3 c=texture2D(tDiffuse,vUv).rgb;
        float lum=dot(c,vec3(.2126,.7152,.0722));
        c=mix(vec3(lum),c,1.16);                                   // saturação
        c=mix(c,c*c*(3.-2.*c),.28);                                // contraste suave
        c*=mix(vec3(1.),vec3(1.085,1.,.90),smoothstep(.55,1.,lum)*.55); // altas quentes
        c*=mix(vec3(1.),vec3(.955,1.,1.06),smoothstep(.5,0.,lum)*.38); // sombras frias
        vec2 p=(vUv-.5)*vec2(resolution.x/max(1.,resolution.y),1.);
        c*=1.-.30*smoothstep(.42,1.15,length(p));                  // vinheta
        gl_FragColor=vec4(c,1.);
      }`,
  });
  composer.addPass(grade);
  return {
    resize(width: number, height: number) {
      composer.setSize(Math.max(1, width), Math.max(1, height));
      grade.uniforms.resolution.value.set(Math.max(1, width), Math.max(1, height));
    },
    render(_delta: number) { composer.render(); },
    dispose() { composer.dispose(); target.dispose(); },
  };
}
