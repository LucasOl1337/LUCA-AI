import * as THREE from 'three';
import type { SompoStudioConfig } from './sompoStudioConfig';

const palettes = {
  day: { top: '#5596b6', horizon: '#c6d7d2', sun: '#fff3d7', ground: '#45563b', direction: [26, 42, 18], strength: 2.2 },
  golden: { top: '#739da9', horizon: '#cbd0b9', sun: '#ffdb98', ground: '#4a5034', direction: [14, 18, 24], strength: 2.4 },
  overcast: { top: '#758992', horizon: '#bec9c5', sun: '#d8e8ee', ground: '#424b3c', direction: [12, 40, 16], strength: 0.65 },
};

/** Sky, sun and haze share a palette; the sky follows the camera, never the vehicle. */
export function createSompoAtmosphere(scene: THREE.Scene, renderer: THREE.WebGLRenderer, sun: THREE.DirectionalLight) {
  const uniforms = {
    top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunlight: { value: new THREE.Color() },
    sunDirection: { value: new THREE.Vector3() }, cloudiness: { value: 0.3 }, clock: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms,
    vertexShader: 'varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec3 direction; uniform vec3 top,horizon,sunlight,sunDirection; uniform float cloudiness,clock;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){vec3 d=normalize(direction);float h=max(d.y,0.0);vec3 c=mix(horizon,top,pow(h,.32));
        vec2 p=d.xz/max(.12,d.y+.18)*3.0+vec2(clock*.0015,0);float n=noise(p)*.55+noise(p*2.03)*.3+noise(p*4.01)*.15;
        float cloud=smoothstep(.59-cloudiness*.12,.77-cloudiness*.12,n)*smoothstep(0.,.2,h)*.65;
        c=mix(c,mix(horizon,vec3(1.),.45),cloud);float s=max(0.,dot(d,normalize(sunDirection)));
        c+=sunlight*(pow(s,70.)*.06+pow(s,1600.)*.7);gl_FragColor=vec4(c,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 16, 10), material);
  sky.name = 'sompo-atmospheric-sky'; sky.renderOrder = -100; sky.frustumCulled = false; scene.add(sky);
  const sunOffset = new THREE.Vector3();
  return {
    update(config: SompoStudioConfig, camera: THREE.Camera, anchor: THREE.Vector3, elapsed: number, wet = false, night = false) {
      const mode = wet ? 'overcast' : config.lighting;
      const palette = palettes[mode];
      sky.position.copy(camera.position); scene.background = null;
      uniforms.clock.value = elapsed / 1000;
      sun.position.copy(anchor).add(sunOffset.set(...palette.direction as [number,number,number]));
      sun.target.position.copy(anchor); sun.target.updateMatrixWorld();
      uniforms.top.value.set(night ? '#071422' : palette.top); uniforms.horizon.value.set(night ? '#263846' : palette.horizon);
      uniforms.sunlight.value.set(night ? '#759bba' : palette.sun); uniforms.sunDirection.value.set(...palette.direction as [number,number,number]);
      uniforms.cloudiness.value = mode === 'overcast' ? 1 : 0.25;
      sun.color.set(night ? '#9bbaca' : palette.sun); sun.intensity = night ? 0.45 : palette.strength;
      renderer.toneMappingExposure = config.exposure;
      scene.environmentIntensity = night ? 0.22 : mode === 'overcast' ? 0.6 : 0.55;
      if (scene.fog instanceof THREE.Fog) { scene.fog.color.set(night ? '#172733' : palette.horizon); scene.fog.near = wet ? 45 : 65; scene.fog.far = wet ? 160 : 230; }
    },
    dispose() { sky.removeFromParent(); sky.geometry.dispose(); material.dispose(); },
  };
}
