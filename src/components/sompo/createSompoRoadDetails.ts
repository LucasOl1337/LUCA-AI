import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const rand = (i: number) => { const n = Math.sin(i * 127.1 + 21.7) * 43758.5453; return n - Math.floor(n); };

/** Low-frequency world-space variation breaks repetition without another full-size PBR atlas. */
export function varySompoSurface(material: THREE.MeshStandardMaterial, amount = 0.18) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec3 ruralWorld;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nruralWorld = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = `varying vec3 ruralWorld;
      float ruralHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float ruralNoise(vec2 p) { vec2 a=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(ruralHash(a),ruralHash(a+vec2(1,0)),f.x),mix(ruralHash(a+vec2(0,1)),ruralHash(a+vec2(1,1)),f.x),f.y); }
    ` + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float macro = ruralNoise(ruralWorld.xz * 0.16) * 0.65 + ruralNoise(ruralWorld.xz * 0.041 + 7.0) * 0.35;
      diffuseColor.rgb *= 1.0 + (macro - 0.5) * ${(amount * 2).toFixed(3)};`);
  };
  material.customProgramCacheKey = () => `sompo-macro-${amount}`;
}

export function wornRoadPaint() {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 128;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#f0ede4'; ctx.fillRect(0, 0, 1024, 128);
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 2700; i += 1) {
    ctx.fillStyle = `rgba(0,0,0,${0.18 + rand(i) * 0.82})`;
    const y = rand(i + 40) * 128;
    ctx.fillRect(rand(i + 70) * 1024, y, 1 + rand(i + 1) * 6, 1 + rand(i + 3) * (y < 18 || y > 110 ? 24 : 4));
  }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 16;
  return map;
}

export function createSompoRoadDetails(parent: THREE.Group, grassMap: THREE.Texture) {
  const root = new THREE.Group(); root.name = 'rural-surface-details'; parent.add(root);
  const transform = new THREE.Object3D();
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  for (let i = 0; i < 32; i += 1) {
    const x = 48 + rand(i) * 160, y = 48 + rand(i + 2) * 160, r = 12 + rand(i + 8) * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  }
  const patchMap = new THREE.CanvasTexture(canvas);
  const patches = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: patchMap, color: 0x302e22, transparent: true, opacity: 0.28, depthWrite: false }), 70);
  patches.name = 'irregular-road-stains'; root.add(patches);
  for (let i = 0; i < 70; i += 1) {
    transform.position.set(rand(i) * 180 - 90, 0.009, -5.65 + rand(i + 3) * 7.4); transform.rotation.set(-Math.PI / 2, 0, rand(i + 1) * 6.28); transform.scale.set(0.4 + rand(i + 5) * 3, 0.25 + rand(i + 9), 1); transform.updateMatrix(); patches.setMatrixAt(i, transform.matrix);
  }
  const rutMap = new THREE.CanvasTexture(canvas.cloneNode(true) as HTMLCanvasElement);
  // cloneNode does not copy canvas pixels: draw actual irregular tyre impressions.
  const rutCanvas = rutMap.image as HTMLCanvasElement; const rutCtx = rutCanvas.getContext('2d', { willReadFrequently: true })!;
  for (let i = 0; i < 60; i += 1) {
    rutCtx.fillStyle = `rgba(255,255,255,${0.12 + rand(i) * 0.28})`;
    rutCtx.fillRect(i * 4.3, 30 + rand(i + 1) * 20, 2, 140 + rand(i + 2) * 30);
  }
  rutMap.wrapS = THREE.RepeatWrapping; rutMap.repeat.x = 65; rutMap.anisotropy = 16;
  const rutMaterial = new THREE.MeshBasicMaterial({ map: rutMap, color: 0x372b1f, transparent: true, opacity: 0.75, depthWrite: false });
  const ruts: THREE.Mesh[] = [];
  for (const shoulder of [2.7, -6.85]) for (const side of [-1, 1]) {
    const rut = new THREE.Mesh(new THREE.PlaneGeometry(230, 0.25), rutMaterial); rut.name = 'shoulder-tyre-impressions'; rut.rotation.x = -Math.PI / 2; rut.position.set(0, -0.006, shoulder + side * 0.36); root.add(rut); ruts.push(rut);
  }
  // Crossed cards are local renders of the CC0 Bermuda Grass mesh, not hand-drawn blades.
  const card = new THREE.PlaneGeometry(1, 1); card.translate(0, 0.5, 0);
  const other = card.clone().rotateY(Math.PI / 2);
  const grassGeometry = mergeGeometries([card, other]); card.dispose(); other.dispose();
  const grassMaterial = new THREE.MeshStandardMaterial({ map: grassMap, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1, color: 0xbdc59c });
  const time = { value: 0 };
  grassMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.grassTime = time;
    shader.vertexShader = 'uniform float grassTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.x += sin(grassTime * 1.3 + instanceMatrix[3].x * 0.6) * position.y * position.y * 0.055;');
  };
  const grass = new THREE.InstancedMesh(grassGeometry, grassMaterial, 520); grass.name = 'near-road-grass-tufts'; grass.receiveShadow = true; grass.visible = false; root.add(grass);
  for (let i = 0; i < 520; i += 1) {
    const x = rand(i + 12) * 130 - 65; const z = i % 2 ? 3.7 + rand(i + 20) * 2.7 : -7.7 - rand(i + 20) * 2.0;
    const size = 0.27 + rand(i + 31) * 0.5;
    transform.position.set(x, -0.028, z); transform.rotation.set(0, rand(i + 42) * Math.PI, 0); transform.scale.set(size * 1.2, size, size); transform.updateMatrix(); grass.setMatrixAt(i, transform.matrix);
    grass.setColorAt(i, new THREE.Color().setHSL(0.19 + rand(i) * 0.07, 0.16 + rand(i + 8) * 0.1, 0.63 + rand(i + 9) * 0.2));
  }
  return {
    update(elapsed: number, wet: boolean, reducedMotion: boolean) {
      time.value = reducedMotion ? 0 : elapsed / 1000;
      grass.visible = !!grassMap.image;
      grassMaterial.color.set(wet ? 0x85977a : 0xbdc59c);
      (patches.material as THREE.MeshBasicMaterial).opacity = wet ? 0.4 : 0.28;
    },
    dispose() { patchMap.dispose(); rutMap.dispose(); },
  };
}
