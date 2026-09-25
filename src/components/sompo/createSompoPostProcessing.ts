import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { sompoRenderBudget } from './sompoStage';
import { SompoDepthAOPass } from './createSompoDepthAO';

/**
 * Cadeia real de pós: render HDR → AO de profundidade → SMAA em linear →
 * ACES/sRGB no OutputPass → vinheta e dither discretos. O alvo intermediário
 * não usa MSAA: o SMAA resolve a borda uma vez, sem quadruplicar o custo de
 * fragmento de toda a cena rural.
 * No perfil compacto segue o passe único anterior, sem custo extra.
 */
export function createSompoPostProcessing(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderScale = 1, ambientOcclusionEnabled = true) {
  if (sompoRenderBudget().compact) {
    return {
      resize(_width: number, _height: number) {},
      render(_delta: number) { renderer.render(scene, camera); },
      dispose() {},
    };
  }
  // A profundidade do render principal alimenta o AO sem repetir a geometria;
  // o segundo buffer do composer herda o mesmo attachment.
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 0, depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType) });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(THREE.MathUtils.clamp(renderScale, .5, 1));
  composer.addPass(new RenderPass(scene, camera));
  const ambientOcclusion = new SompoDepthAOPass(camera);
  ambientOcclusion.enabled = ambientOcclusionEnabled;
  composer.addPass(ambientOcclusion);
  // Protege a cadeia de valores inválidos vindos de materiais customizados.
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
  const smaa = new SMAAPass();
  composer.addPass(smaa);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, resolution: { value: new THREE.Vector2(1, 1) }, texel: { value: new THREE.Vector2(1, 1) } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse; uniform vec2 resolution,texel;
      // Ruído azul barato (interleaved gradient noise).
      float ign(vec2 p){return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715))));}
      void main(){
        vec3 c=texture2D(tDiffuse,vUv).rgb;
        vec3 blur=(texture2D(tDiffuse,vUv+vec2(texel.x,0.)).rgb+texture2D(tDiffuse,vUv-vec2(texel.x,0.)).rgb
          +texture2D(tDiffuse,vUv+vec2(0.,texel.y)).rgb+texture2D(tDiffuse,vUv-vec2(0.,texel.y)).rgb)*.25;
        c=clamp(c+(c-blur)*.16,0.,1.);                              // nitidez pós-upscale
        float lum=dot(c,vec3(.2126,.7152,.0722));
        vec2 p=(vUv-.5)*vec2(resolution.x/max(1.,resolution.y),1.);
        c*=1.-.12*smoothstep(.5,1.15,length(p));                   // vinheta óptica leve
        // Grão fixo na tela: forte nos meios-tons, some nas altas e nos pretos.
        // Em 8 bits faz o papel de dither e quebra o degrau do céu e da névoa.
        // Não anima por quadro: em A/B intercalado contra a main, o grão vivo
        // custou +2,7 a +3,6 ms por quadro e o fixo +0,1 a +0,3 ms.
        vec2 px=gl_FragCoord.xy;
        float n=ign(px)+ign(px+vec2(17.,43.))-1.;
        float mid=4.*lum*(1.-lum);
        c+=n*(.0015+.0035*mid);
        gl_FragColor=vec4(c,1.);
      }`,
  });
  composer.addPass(grade);
  return {
    resize(width: number, height: number) {
      composer.setSize(Math.max(1, width), Math.max(1, height));
      grade.uniforms.resolution.value.set(Math.max(1, width), Math.max(1, height));
      grade.uniforms.texel.value.set(1 / Math.max(1, width * renderScale), 1 / Math.max(1, height * renderScale));
    },
    render(_delta: number) { composer.render(); },
    dispose() { ambientOcclusion.dispose(); smaa.dispose(); composer.dispose(); target.dispose(); },
  };
}
