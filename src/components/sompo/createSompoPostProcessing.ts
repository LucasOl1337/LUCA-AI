import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { sompoRenderBudget } from './sompoStage';
import { SompoDepthAOPass } from './createSompoDepthAO';

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
  // Depth resolved from the MSAA buffer feeds the ambient-occlusion pass; the
  // composer's second buffer clones it.
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType) });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const ambientOcclusion = new SompoDepthAOPass(camera);
  composer.addPass(ambientOcclusion);
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
  return {
    resize(width: number, height: number) {
      composer.setSize(Math.max(1, width), Math.max(1, height));
      grade.uniforms.resolution.value.set(Math.max(1, width), Math.max(1, height));
    },
    render(_delta: number) { composer.render(); },
    dispose() { ambientOcclusion.dispose(); composer.dispose(); target.dispose(); },
  };
}
