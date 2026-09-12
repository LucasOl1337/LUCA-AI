import * as THREE from 'three';
import type { SompoStudioConfig } from './sompoStudioConfig';

const palettes = {
  day: { top: '#5596b6', horizon: '#c6d7d2', sun: '#fff3d7', ground: '#45563b', direction: [26, 42, 18], strength: 2.2, warmth: 0.15 },
  golden: { top: '#739da9', horizon: '#d9b586', sun: '#ffd9a0', ground: '#4a5034', direction: [8, 4.8, -30], strength: 2.35, warmth: 1 },
  overcast: { top: '#758992', horizon: '#bec9c5', sun: '#d8e8ee', ground: '#424b3c', direction: [12, 40, 16], strength: 0.65, warmth: 0 },
};

/** Posição U do sol dentro do equirect kloppenheim_06 (medida no HDR: texel mais brilhante). */
const HDRI_SUN_U = 0.613;

/**
 * Céu real: o domo amostra o HDRI equiretangolar (foto de verdade) e pinta por
 * cima as silhuetas de serra e a névoa do horizonte — a borda entre o relevo e o
 * céu fica limpa em qualquer azimute. Sem HDRI carregado, cai no gradiente
 * procedural. O sol da cena (DirectionalLight) e o sol da foto ficam no mesmo
 * azimute via `skyYaw`, então sombras e reflexos concordam com o céu visível.
 */
export function createSompoAtmosphere(scene: THREE.Scene, renderer: THREE.WebGLRenderer, sun: THREE.DirectionalLight) {
  const uniforms = {
    top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunlight: { value: new THREE.Color() },
    sunDirection: { value: new THREE.Vector3() }, cloudiness: { value: 0.3 }, clock: { value: 0 },
    skyDry: { value: null as THREE.Texture | null }, skyWet: { value: null as THREE.Texture | null },
    useHdri: { value: 0 }, wetSky: { value: 0 }, skyYaw: { value: 0 }, sunAzimuth: { value: 0 },
    warmth: { value: 1 }, haze: { value: new THREE.Color() }, night: { value: 0 },
    ridgeNear: { value: new THREE.Color() }, ridgeFar: { value: new THREE.Color() },
    groundNear: { value: new THREE.Color() },
  };
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms,
    vertexShader: 'varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec3 direction;
      uniform vec3 top,horizon,sunlight,sunDirection,haze,ridgeNear,ridgeFar,groundNear;
      uniform float cloudiness,clock,useHdri,wetSky,skyYaw,sunAzimuth,warmth,night;
      uniform sampler2D skyDry,skyWet;
      float wrapDelta(float a){return atan(sin(a),cos(a));}
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      float fbm(vec2 p){return noise(p)*.55+noise(p*2.03)*.3+noise(p*4.01)*.15;}
      float hash1(float p){return fract(sin(p*127.1)*43758.5453);}
      float noise1(float p){float i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(hash1(i),hash1(i+1.),f);}
      float ridge1(float a){return noise1(a*2.1+7.3)*.55+noise1(a*4.7+31.7)*.3+noise1(a*9.3+53.1)*.15;}
      float ridge2(float a){return noise1(a*1.3+17.9)*.6+noise1(a*3.1+71.3)*.28+noise1(a*6.9+11.1)*.12;}
      vec3 equirect(vec3 d,sampler2D map){
        float u=fract(atan(d.z,d.x)*.15915494+.5+skyYaw);
        float v=asin(clamp(d.y,-1.,1.))*.31830988+.535; // puxa a faixa de nuvens pra dentro do quadro
        return texture2D(map,vec2(u,v)).rgb;
      }
      void main(){
        vec3 d=normalize(direction);
        float az=atan(d.z,d.x);
        vec3 sd=normalize(sunDirection);
        float sunAmt=max(0.,dot(d,sd));
        // ── Céu ──────────────────────────────────────────────────────────
        vec3 c;
        if(night>.5){
          c=mix(vec3(.10,.16,.21),vec3(.016,.038,.075),pow(clamp(d.y*1.4,0.,1.),.55));
          c+=sunlight*pow(sunAmt,40.)*.05;
        } else if(useHdri>.5){
          vec3 sky=mix(equirect(d,skyDry),equirect(d,skyWet),wetSky);
          float lum=dot(sky,vec3(.299,.587,.114));
          sky=mix(vec3(lum),sky,1.5);                        // saturação da foto
          sky=sky/(1.+sky*.3);                               // soft clip: o glow da foto é largo
          float sunProx=pow(max(dot(normalize(d.xz),normalize(sd.xz)),0.)*.5+.5,3.);
          float lowBand=1.-smoothstep(.0,.34,d.y);
          sky*=mix(vec3(1.),vec3(1.42,1.05,.60),lowBand*(.5+.5*sunProx)*warmth); // banho âmbar
          sky*=mix(vec3(1.),vec3(.82,.92,1.18),(1.-lowBand)*(.42+.3*(1.-sunProx))); // topo azulado longe do sol
          c=sky;
          c+=sunlight*(pow(sunAmt,80.)*.18+pow(sunAmt,14.)*.07)*warmth;   // halo dourado
        } else {
          float h=max(d.y,0.);c=mix(horizon,top,pow(h,.32));
          vec2 p=d.xz/max(.12,d.y+.18)*3.0+vec2(clock*.0015,0);
          float n=fbm(p);float cloud=smoothstep(.59-cloudiness*.12,.77-cloudiness*.12,n)*smoothstep(0.,.2,h)*.65;
          c=mix(c,mix(horizon,vec3(1.),.45),cloud);
          c+=sunlight*(pow(sunAmt,70.)*.06+pow(sunAmt,1600.)*.7);
        }
        // ── Névoa do horizonte (perspectiva aérea na borda do relevo) ────
        float sunSide=pow(max(dot(normalize(d.xz),normalize(sd.xz)),0.)*.5+.5,3.);
        vec3 hazeCol=mix(haze,sunlight,.5*sunSide*warmth);
        float horizonBand=1.-smoothstep(.004,.05,d.y);
        c=mix(c,hazeCol,horizonBand*smoothstep(-.35,0.,d.y)*.34);
        // ── Serras: camada distante azulada, camada próxima verde ────────
        float sunGap=exp(-pow(wrapDelta(az-sunAzimuth)/.5,2.));   // sol nasce numa forquilha
        float farTop=(.034+ridge1(az)*.105)*(1.-.5*sunGap*.4);
        float nearTop=(.018+ridge2(az+2.7)*.068)*(1.-.62*sunGap);
        vec3 farCol=mix(hazeCol,ridgeFar,.74);
        vec3 nearCol=mix(hazeCol,ridgeNear,.82);
        if(d.y<farTop){
          float soft=smoothstep(farTop,farTop-.012,d.y);
          c=mix(c,farCol,soft*.9);
        }
        if(d.y<nearTop){
          float soft=smoothstep(nearTop,nearTop-.014,d.y);
          c=mix(c,nearCol,soft*.92);
        }
        // ── Abaixo do horizonte: chão distante some na névoa ────────────
        if(d.y<0.) c=mix(hazeCol,groundNear,smoothstep(-.02,-.3,d.y));
        // ── Sol: disco HDR + glow para o bloom segurar ──────────────────
        if(night<.5) c+=sunlight*(smoothstep(.99988,.99996,sunAmt)*6.+pow(sunAmt,900.)*1.4+pow(sunAmt,34.)*.12*warmth);
        gl_FragColor=vec4(c,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 18), material);
  sky.name = 'sompo-atmospheric-sky'; sky.renderOrder = -100; sky.frustumCulled = false; scene.add(sky);
  const sunOffset = new THREE.Vector3();
  const textures: Partial<Record<'dry' | 'wet', THREE.Texture>> = {};
  return {
    /** Recebe o equirect cru do loader de ambiente (foto real, não PMREM). */
    setSkyTexture(kind: 'dry' | 'wet', texture: THREE.Texture) {
      textures[kind] = texture;
      uniforms.skyDry.value = textures.dry ?? null;
      uniforms.skyWet.value = textures.wet ?? textures.dry ?? null;
      uniforms.useHdri.value = textures.dry || textures.wet ? 1 : 0;
    },
    update(config: SompoStudioConfig, camera: THREE.Camera, anchor: THREE.Vector3, elapsed: number, wet = false, night = false) {
      const mode = wet ? 'overcast' : config.lighting;
      const palette = palettes[mode];
      sky.position.copy(camera.position); scene.background = null;
      uniforms.clock.value = elapsed / 1000;
      uniforms.night.value = night ? 1 : 0;
      uniforms.wetSky.value = wet ? 1 : 0;
      sunOffset.set(...palette.direction as [number, number, number]).normalize();
      sun.position.copy(anchor).addScaledVector(sunOffset, 46);
      sun.target.position.copy(anchor); sun.target.updateMatrixWorld();
      const sunAzimuth = Math.atan2(sunOffset.z, sunOffset.x);
      uniforms.sunAzimuth.value = sunAzimuth;
      // Gira a amostragem até o sol da foto cair exatamente no azimute da luz.
      uniforms.skyYaw.value = HDRI_SUN_U - 0.5 - sunAzimuth / (Math.PI * 2);
      scene.environmentRotation.y = uniforms.skyYaw.value * Math.PI * 2;
      uniforms.top.value.set(night ? '#071422' : palette.top); uniforms.horizon.value.set(night ? '#263846' : palette.horizon);
      uniforms.sunlight.value.set(night ? '#759bba' : palette.sun); uniforms.sunDirection.value.copy(sunOffset);
      uniforms.cloudiness.value = mode === 'overcast' ? 1 : 0.25;
      uniforms.warmth.value = palette.warmth;
      uniforms.haze.value.set(night ? '#172733' : palette.horizon);
      uniforms.groundNear.value.set(night ? '#0d1820' : palette.ground);
      uniforms.ridgeFar.value.set(night ? '#101c26' : mode === 'overcast' ? '#4d5d63' : '#68798f');
      uniforms.ridgeNear.value.set(night ? '#14211f' : mode === 'overcast' ? '#3d4c40' : '#4c5e3e');
      sun.color.set(night ? '#9bbaca' : palette.sun); sun.intensity = night ? 0.45 : palette.strength;
      renderer.toneMappingExposure = config.exposure;
      scene.environmentIntensity = night ? 0.22 : mode === 'overcast' ? 0.6 : 0.62;
      if (scene.fog instanceof THREE.Fog) {
        // Névoa de distância esfria e perde saturação: serras ficam azuladas
        // em camadas como na referência em vez de virarem uma parede âmbar.
        scene.fog.color.set(night ? '#172733' : mode === 'overcast' ? '#a9b2ae' : '#bcb4a0');
        scene.fog.near = wet ? 70 : 128; scene.fog.far = wet ? 260 : 420;
      }
    },
    dispose() { sky.removeFromParent(); sky.geometry.dispose(); material.dispose(); },
  };
}
