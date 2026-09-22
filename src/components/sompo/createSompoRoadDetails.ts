import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { restoreSompoTextures, useSompoExternalTextures } from './restoreSompoTextures';
import { disposeSompoObject } from './sompoStage';
import { sompoTerrainHeight, sompoVegetationDensity } from './createSompoTerrain';

const rand = (i: number) => { const n = Math.sin(i * 127.1 + 21.7) * 43758.5453; return n - Math.floor(n); };

/** Recoloca um item da trilha infinita no período mais próximo do caminhão. */
export function wrapSompoX(baseX: number, truckX: number, span: number) {
  return baseX + (span * Math.round((truckX - baseX) / span));
}

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
      float micro = ruralNoise(ruralWorld.xz * 1.9 + 3.1) * 0.7 + ruralNoise(ruralWorld.xz * 6.3 + 11.7) * 0.3;
      diffuseColor.rgb *= (1.0 + (macro - 0.5) * ${(amount * 2).toFixed(3)}) * (1.0 + (micro - 0.5) * ${(amount * 0.9).toFixed(3)});`);
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

/** Tufo de capim baixo: lâminas finas e curtas, algumas deitadas tipo palha
 * seca, base espalhada: lê como gramado e não como agave. `tall` gera a
 * touceira mais alta do pasto. */
export function grassTuftGeometry(blades: number, seed: number, tall = false) {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < blades; i += 1) {
    const dry = i % 4 === 3;
    const height = (dry ? 0.15 + rand(seed + i * 5 + 2) * 0.1 : 0.26 + rand(seed + i * 7 + 5) * 0.16) * (tall ? 1.7 : 1);
    const blade = new THREE.PlaneGeometry(0.015 + rand(seed + i * 3) * 0.008, height, 1, 2);
    blade.translate(0, height / 2, 0);
    const positions = blade.attributes.position as THREE.BufferAttribute;
    const bend = dry ? 0.6 + rand(seed + i * 7 + 3) * 0.55 : 0.12 + rand(seed + i * 7 + 3) * 0.3;
    const bladeT = new Float32Array(positions.count);
    for (let v = 0; v < positions.count; v += 1) {
      const t = positions.getY(v) / height;
      bladeT[v] = t;
      positions.setX(v, positions.getX(v) * (1 - t * 0.78));
      positions.setZ(v, positions.getZ(v) + t * t * bend * height * (dry ? 3 : 1.8));
    }
    blade.setAttribute('bladeT', new THREE.BufferAttribute(bladeT, 1));
    blade.rotateY((i / blades) * Math.PI * 2 + rand(seed + i) * 0.9);
    const spread = rand(seed + i * 13) * (tall ? 0.16 : 0.075);
    const angle = rand(seed + i * 11) * Math.PI * 2;
    blade.translate(Math.cos(angle) * spread, 0, Math.sin(angle) * spread);
    parts.push(blade);
  }
  const geometry = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  const positions = geometry.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(positions.count * 3);
  for (let v = 0; v < positions.count; v += 1) {
    const shade = 0.42 + Math.min(1, positions.getY(v) / 0.35) * 0.62;
    colors[v * 3] = shade; colors[v * 3 + 1] = shade; colors[v * 3 + 2] = shade * 0.9;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Pé de lavoura: cutout r7 com tassel e vãos de folha, cruzado para
 * virar volume em vez de um cartão. Espiga na metade alta. */
function cropPlantGeometry(detail: 'near' | 'far' = 'near') {
  const cardH = detail === 'near' ? 2.42 : 2.18;
  const cardW = detail === 'near' ? 0.92 : 0.82;
  const leafParts: THREE.BufferGeometry[] = [];
  for (const yaw of [0.12, Math.PI / 2 + 0.12]) {
    const card = new THREE.PlaneGeometry(cardW, cardH);
    card.translate(0, cardH / 2 + 0.08, 0);
    card.rotateY(yaw);
    leafParts.push(card);
  }
  const geometry = mergeGeometries(leafParts);
  leafParts.forEach((part) => part.dispose());
  if (!geometry) throw new Error('crop plant');
  geometry.scale(1, 1 / (cardH + 0.08), 1); // Instance Y scale is height in metres.
  geometry.computeVertexNormals();
  return geometry;
}

function lumpyGeometry(base: THREE.BufferGeometry, roughness: number, seed: number) {
  const positions = base.attributes.position as THREE.BufferAttribute;
  for (let v = 0; v < positions.count; v += 1) {
    const scale = 1 + (rand(seed + Math.round(positions.getX(v) * 13 + positions.getY(v) * 29 + positions.getZ(v) * 47)) - 0.5) * roughness;
    positions.setXYZ(v, positions.getX(v) * scale, positions.getY(v) * (1 + (scale - 1) * 0.5), positions.getZ(v) * scale);
  }
  base.computeVertexNormals();
  return base;
}

interface InstanceSlot { x: number; z: number; y?: number; rotation: number; tilt?: number; scale: THREE.Vector3 }

/** Conjunto instanciado com reciclagem por instância na trilha infinita. */
function makeTrail(mesh: THREE.InstancedMesh, slots: InstanceSlot[], span: number, onGround: boolean, sink = 0) {
  const transform = new THREE.Object3D();
  const lastX = new Float64Array(slots.length).fill(NaN);
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Math.hypot(span / 2 + 12, 80));
  return {
    mesh,
    update(truckX: number) {
      let changed = false;
      mesh.boundingSphere!.center.x = truckX;
      for (const [index, slot] of slots.entries()) {
        const x = wrapSompoX(slot.x, truckX, span);
        if (lastX[index] === x) continue;
        lastX[index] = x;
        changed = true;
        const y = slot.y ?? (onGround ? sompoTerrainHeight(x, slot.z) - sink : -sink);
        transform.position.set(x, y, slot.z);
        transform.rotation.set(slot.tilt ?? 0, slot.rotation, (slot.tilt ?? 0) * 0.6);
        transform.scale.copy(slot.scale);
        transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
      }
      if (changed) mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

/**
 * Trail that only submits plants inside the camera frustum. The wrapped span
 * keeps 240 m of rows around the truck, but the side camera sees ~70 m of it;
 * every hidden plant still cost its vertices twice (colour and shadow pass).
 * The margin keeps shadows that fall into frame from plants just outside it.
 */
function makeCulledTrail(mesh: THREE.InstancedMesh, slots: InstanceSlot[], span: number, sink: number, camera: THREE.Camera, radius: number) {
  const transform = new THREE.Object3D();
  const frustum = new THREE.Frustum(), clip = new THREE.Matrix4(), sphere = new THREE.Sphere();
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Math.hypot(span / 2 + 12, 80));
  return {
    mesh,
    update(truckX: number) {
      mesh.updateWorldMatrix(true, false);
      clip.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(mesh.matrixWorld);
      frustum.setFromProjectionMatrix(clip);
      mesh.boundingSphere!.center.x = truckX;
      let count = 0;
      for (const slot of slots) {
        const x = wrapSompoX(slot.x, truckX, span);
        const y = slot.y ?? sompoTerrainHeight(x, slot.z) - sink;
        sphere.center.set(x, y + slot.scale.y * .5, slot.z); sphere.radius = radius;
        if (!frustum.intersectsSphere(sphere)) continue;
        transform.position.set(x, y, slot.z);
        transform.rotation.set(slot.tilt ?? 0, slot.rotation, (slot.tilt ?? 0) * 0.6);
        transform.scale.copy(slot.scale);
        transform.updateMatrix();
        mesh.setMatrixAt(count++, transform.matrix);
      }
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

export function createSompoRoadDetails(parent: THREE.Group, camera?: THREE.Camera) {
  let disposed = false;
  const assetAbort = new AbortController();
  const maizeTrails: { update(truckX: number): void }[] = [];
  let latestTruckX = 0;
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
  const patchSlots: { x: number; z: number; spin: number; sx: number; sy: number }[] = [];
  for (let i = 0; i < 70; i += 1) {
    patchSlots.push({ x: rand(i) * 200 - 100, z: -5.65 + rand(i + 3) * 7.4, spin: rand(i + 1) * 6.28, sx: 0.4 + rand(i + 5) * 3, sy: 0.25 + rand(i + 9) });
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
    // 260/65 = período de 4 m: o plano recicla em saltos de 20 m sem costura visível.
    const rut = new THREE.Mesh(new THREE.PlaneGeometry(260, 0.25), rutMaterial); rut.name = 'shoulder-tyre-impressions'; rut.rotation.x = -Math.PI / 2; rut.position.set(0, -0.006, shoulder + side * 0.36); root.add(rut); ruts.push(rut);
  }

  const time = { value: 0 };
  const wind = { value: 0.65 };
  const windify = (material: THREE.MeshStandardMaterial, strength: number) => {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.grassTime = time;
      shader.uniforms.grassWind = wind;
      shader.vertexShader = 'uniform float grassTime; uniform float grassWind;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed.x += (sin(grassTime * 1.3 + instanceMatrix[3].x * 0.6) + sin(grassTime * 0.83 + instanceMatrix[3].z * 1.1) * 0.6) * position.y * position.y * grassWind * ${strength.toFixed(3)};`);
    };
    material.customProgramCacheKey = () => `sompo-wind-${strength}`;
  };
  // Rampa calibrada da técnica sylva (inner-green-3d, MIT): verde fundo no
  // pé da lâmina, ponta quente iluminada, sombreado por profundidade. O que
  // separa gramado real de veludo verde chapado. bladeT = altura na lâmina.
  const grassRamp = (material: THREE.MeshStandardMaterial) => {
    const prev = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      prev(shader, renderer);
      shader.vertexShader = 'attribute float bladeT; varying float vBladeT; varying float vGTone;\n' + shader.vertexShader
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vBladeT = bladeT;
          vGTone = fract(sin(instanceMatrix[3].x * 12.9 + instanceMatrix[3].z * 7.7) * 43758.5453);`);
      shader.fragmentShader = 'varying float vBladeT; varying float vGTone;\n' + shader.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 gRamp = mix(vec3(.030,.048,.008), vec3(.11,.17,.028), smoothstep(0., .6, vBladeT));
          gRamp = mix(gRamp, vec3(.20,.28,.07), smoothstep(.4, 1., vBladeT) * (.4 + .6 * vGTone));
          gRamp = mix(gRamp, vec3(.30,.39,.10), smoothstep(.78, 1., vBladeT) * vGTone * .5);
          // diffuseColor chega como instanceColor (matiz seco/verde por tufo).
          diffuseColor.rgb = gRamp * (diffuseColor.rgb * 1.0 + .12);`);
    };
    material.customProgramCacheKey = () => `sompo-grass-ramp-v1`;
  };

  // Gramado de beira de pista: tufos baixos e densos sobre faixa já coberta
  // pelo pasto: lê como capim contínuo, não como espinhos em terra pelada.
  const tuftGeometry = grassTuftGeometry(10, 11);
  const grassMaterial = new THREE.MeshStandardMaterial({ vertexColors: false, roughness: 1, side: THREE.DoubleSide, color: 0xffffff });
  windify(grassMaterial, 0.055);
  grassRamp(grassMaterial);
  const grass = new THREE.InstancedMesh(tuftGeometry, grassMaterial, 3000);
  grass.name = 'near-road-grass-tufts'; grass.receiveShadow = true; root.add(grass);
  const grassSlots: InstanceSlot[] = [];
  for (let i = 0; i < 3000; i += 1) {
    const band = rand(i + 55);
    // Maioria na margem norte; sul entre acostamento e cerca; alguns no
    // acostamento de terra colado no asfalto, onde o capim invade de verdade.
    const z = band < 0.6 ? 3.35 + rand(i + 20) * 3.6
      : band < 0.88 ? -7.4 - rand(i + 20) * 2.9
      : band < 0.95 ? 2.35 + rand(i + 20) * 1.05
      : -6.4 - rand(i + 20) * 0.95;
    const onShoulder = band >= 0.88;
    const size = 0.55 + rand(i + 31) * 0.7;
    // Capim mais alto colado na cerca; manchas achatadas leem como palha/capim
    // rasteiro cobrindo o solo entre os tufos.
    const nearFence = !onShoulder && band < 0.6 && z > 5.4 ? 1.35 : 1;
    const matted = !onShoulder && rand(i + 91) < 0.14;
    grassSlots.push({
      x: rand(i + 12) * 160 - 80, z, y: -0.03, rotation: rand(i + 42) * Math.PI,
      scale: matted
        ? new THREE.Vector3(size * 1.9, size * 0.28, size * 1.9)
        : new THREE.Vector3(size, size * (0.62 + rand(i + 44) * 0.42) * (onShoulder ? 0.55 : nearFence), size),
    });
    const pick = rand(i + 77);
    grass.setColorAt(i, matted || pick < 0.2
      ? new THREE.Color().setHSL(0.115 + rand(i) * 0.02, 0.3 + rand(i + 8) * 0.14, 0.3 + rand(i + 9) * 0.1)
      : new THREE.Color().setHSL(0.185 + rand(i) * 0.06, 0.24 + rand(i + 8) * 0.12, 0.28 + rand(i + 9) * 0.13));
  }
  const grassTrail = makeTrail(grass, grassSlots, 160, false, 0.03);

  // Quebra de repetição no 1º plano: tufos altos e secos (capim barba-de-bode)
  // entremeados na faixa: silhueta e palheta diferentes do gramado rasteiro.
  const tallWeedMaterial = grassMaterial.clone();
  windify(tallWeedMaterial, 0.08);
  grassRamp(tallWeedMaterial);
  const tallWeeds = new THREE.InstancedMesh(grassTuftGeometry(7, 137, true), tallWeedMaterial, 210);
  tallWeeds.name = 'roadside-tall-weeds'; tallWeeds.receiveShadow = true; root.add(tallWeeds);
  const weedSlots: InstanceSlot[] = [];
  for (let i = 0; i < 210; i += 1) {
    const band = rand(i + 855);
    const z = band < 0.55 ? 3.6 + rand(i + 820) * 3.4
      : band < 0.85 ? -7.3 - rand(i + 820) * 2.7
      : 2.4 + rand(i + 820) * 0.9;
    const size = 0.5 + rand(i + 831) * 0.65;
    weedSlots.push({
      x: rand(i + 812) * 160 - 80, z, y: -0.03, rotation: rand(i + 842) * Math.PI,
      scale: new THREE.Vector3(size * (0.8 + rand(i + 844) * 0.5), size * (0.75 + rand(i + 846) * 0.6), size * (0.8 + rand(i + 844) * 0.5)),
    });
    // Maioria seco/dourado; fração verde-oliva: é a textura da beira real.
    tallWeeds.setColorAt(i, rand(i + 877) < 0.7
      ? new THREE.Color().setHSL(0.105 + rand(i + 878) * 0.03, 0.34 + rand(i + 879) * 0.16, 0.3 + rand(i + 880) * 0.12)
      : new THREE.Color().setHSL(0.175 + rand(i + 878) * 0.04, 0.28 + rand(i + 879) * 0.12, 0.26 + rand(i + 880) * 0.1));
  }
  const weedTrail = makeTrail(tallWeeds, weedSlots, 160, false, 0.03);

  const clumpMaterial = grassMaterial.clone();
  windify(clumpMaterial, 0.075);
  grassRamp(clumpMaterial);
  const clumps = new THREE.InstancedMesh(grassTuftGeometry(11, 57, true), clumpMaterial, 300);
  clumps.name = 'pasture-grass-clumps'; clumps.receiveShadow = true; root.add(clumps);
  const clumpSlots: InstanceSlot[] = [];
  for (let i = 0; i < 300; i += 1) {
    const x = rand(i + 301) * 220 - 110;
    const z = 8.5 + rand(i + 302) * 31;
    const density = sompoVegetationDensity(x, z);
    const size = (0.8 + rand(i + 303) * 1.2) * (0.55 + density * 0.8);
    clumpSlots.push({ x, z, rotation: rand(i + 304) * Math.PI, scale: new THREE.Vector3(size, size * 1.05, size) });
    clumps.setColorAt(i, rand(i + 350) < 0.22
      ? new THREE.Color().setHSL(0.115 + rand(i + 305) * 0.02, 0.3 + rand(i + 308) * 0.12, 0.3 + rand(i + 306) * 0.1)
      : new THREE.Color().setHSL(0.19 + rand(i + 305) * 0.055, 0.22 + rand(i + 308) * 0.1, 0.27 + rand(i + 306) * 0.13));
  }
  const clumpTrail = makeTrail(clumps, clumpSlots, 220, true, 0.05);

  // Arbustos: só o CC0 ph-shrub_02 da folhagem licenciada. Os icosaedros
  // amassados de cor sólida que ficavam aqui liam como pedra verde.

  // Continuous cultivated rows across the full wrapping span. The former
  // cols*spacing covered only ~150 of 240 metres, leaving a moving bare gap.
  const cropLeafMaterial = new THREE.MeshStandardMaterial({
    color: 0xf2f4e8, roughness: 0.78, side: THREE.DoubleSide, alphaTest: 0.38, alphaToCoverage: true,
  });
  windify(cropLeafMaterial, 0.04);
  if (typeof document !== 'undefined' && typeof document.createElementNS === 'function') {
    new THREE.TextureLoader().load('/sompo/gen/maize-distant-albedo.png', (map) => {
      if (disposed) { map.dispose(); return; }
      map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
      cropLeafMaterial.map = map; cropLeafMaterial.needsUpdate = true;
    });
  }
  const cropRows = 26;
  const nearSlots: InstanceSlot[] = [], farSlots: InstanceSlot[] = [];
  const nearColors: THREE.Color[] = [], farColors: THREE.Color[] = [];
  for (let row = 0; row < cropRows; row += 1) {
    const dist = 8.4 + row * (row < 8 ? 1.12 : 1.02);
    const near = dist < 16.5;
    const farField = dist >= 26.4;
    const cols = near ? 192 : farField ? 128 : 160;
    const spacing = 240 / cols;
    for (let column = 0; column < cols; column += 1) {
      const i = row * 320 + column;
      const z = -8.4 - row * (near ? 1.12 : 1.02) + (rand(i + 401) - 0.5) * (near ? 0.48 : 0.22);
      const nearFence = row < 4;
      if (nearFence && rand(i + 419) < 0.03) continue;
      if (near && !nearFence && rand(i + 419) < 0.05) continue;
      if (!near && !farField && rand(i + 419) < 0.04) continue;
      if (farField && rand(i + 419) < 0.08) continue;
      const height = (near ? 2.12 : 1.92) + rand(i + 403) * (near ? 0.22 : 0.16);
      const width = 0.86 + rand(i + 412) * 0.20;
      (near ? nearSlots : farSlots).push({
        x: column * spacing - 120 + (rand(i + 402) - 0.5) * .35,
        z,
        rotation: rand(i + 404) * Math.PI * 2,
        tilt: (rand(i + 407) - 0.5) * (near ? 0.08 : 0.06),
        // Authored maize is normalized in all axes: preserve leaf proportions
        // when taking its one-metre plant to the requested field height.
        scale: new THREE.Vector3(near ? width * height : width, height, near ? width * height : width),
      });
      const tone = new THREE.Color().setHSL(0.28 + rand(i + 405) * 0.025, 0.34 + rand(i + 408) * 0.06, 0.56 + rand(i + 406) * 0.08);
      (near ? nearColors : farColors).push(tone);
    }
  }
  const cropsNear = new THREE.InstancedMesh(cropPlantGeometry('near'), cropLeafMaterial, nearSlots.length);
  const cropsFar = new THREE.InstancedMesh(cropPlantGeometry('far'), cropLeafMaterial, farSlots.length);
  cropsNear.name = 'row-crop-field-near'; cropsFar.name = 'row-crop-field-far';
  cropsNear.receiveShadow = cropsFar.receiveShadow = true;
  root.add(cropsNear, cropsFar);
  nearColors.forEach((color, index) => cropsNear.setColorAt(index, color));
  farColors.forEach((color, index) => cropsFar.setColorAt(index, color));
  const cropNearTrail = makeTrail(cropsNear, nearSlots, 240, true, 0.04);
  const cropFarTrail = makeTrail(cropsFar, farSlots, 240, true, 0.04);

  // Near plants have independently curved leaves in 3D. Reuse each geometry
  // across the field; distant plants retain the lightweight photographic cutout.
  if (typeof document !== 'undefined' && typeof document.createElementNS === 'function') {
    void fetch('/models/sompo/maize-curved.glb', { signal: assetAbort.signal })
      .then(async response => {
        if (!response.ok) throw new Error(`Maize HTTP ${response.status}`);
        const gltf = await useSompoExternalTextures(new GLTFLoader()).parseAsync(await response.arrayBuffer(), '/models/sompo/');
        try {
          await restoreSompoTextures(gltf, '/models/sompo/maize-curved.glb', assetAbort.signal);
          return gltf;
        } catch (error) {
          disposeSompoObject(gltf.scene);
          throw error;
        }
      }).then(gltf => {
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse(node => {
          const source = node as THREE.Mesh;
          if (!source.isMesh) return;
          if (disposed) {
            source.geometry.dispose();
            for (const m of Array.isArray(source.material) ? source.material : [source.material]) {
              for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
              m.dispose();
            }
            return;
          }
          const material = source.material as THREE.MeshStandardMaterial;
          material.transparent = false;
          material.alphaTest = material.map ? 0.18 : 0;
          material.alphaToCoverage = !!material.map;
          material.side = THREE.DoubleSide;
          material.roughness = .86;
          material.metalness = 0;
          if (material.map) {
            material.color.set(0xffffff);
            material.map.anisotropy = 8;
          }
          windify(material, .035);
          const compileLeaves = material.onBeforeCompile;
          material.onBeforeCompile = (shader, renderer) => {
            compileLeaves.call(material, shader, renderer);
            shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>',
              'diffuseColor.rgb /= max(.3, sqrt(diffuseColor.a));\n#include <alphatest_fragment>');
          };
          material.customProgramCacheKey = () => 'sompo-maize-coverage-v1';
          source.geometry.applyMatrix4(source.matrixWorld);
          const plants = new THREE.InstancedMesh(source.geometry, material, nearSlots.length);
          plants.name = `maize-near-${source.name}`;
          plants.castShadow = plants.receiveShadow = true;
          root.add(plants);
          // The authored atlas already contains the leaf albedo; multiplying it
          // by a second dark green tint made the complete field nearly black.
          const trail = camera ? makeCulledTrail(plants, nearSlots, 240, .025, camera, 4.5) : makeTrail(plants, nearSlots, 240, true, .025);
          trail.update(latestTruckX);
          maizeTrails.push(trail);
        });
        if (!disposed && maizeTrails.length) cropsNear.visible = false;
      }).catch(() => { /* Preserve cutout vegetation if the detailed asset is unavailable. */ });
  }

  // Distant mass only, well behind the fence so it is not a green wall.
  const canopyMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1, side: THREE.DoubleSide, alphaTest: 0.42, alphaToCoverage: true,
  });
  windify(canopyMaterial, 0.025);
  if (typeof document !== 'undefined' && typeof document.createElementNS === 'function') {
    new THREE.TextureLoader().load('/sompo/gen/maize-distant-albedo.png', map => {
      if (disposed) { map.dispose(); return; }
      map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
      canopyMaterial.map = map; canopyMaterial.needsUpdate = true;
    });
  }
  const canopy = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), canopyMaterial, 12);
  canopy.name = 'astra-corn-canopy-cards'; canopy.receiveShadow = true; root.add(canopy);
  const canopySlots: InstanceSlot[] = [];
  for (let i = 0; i < 12; i++) canopySlots.push({
    x: (i % 4) * 22 - 88, z: -42 - Math.floor(i / 4) * 8.5,
    y: 2.15, rotation: (rand(i + 901) - .5) * .4,
    scale: new THREE.Vector3(1.7 + rand(i + 903) * .35, 3.4 + rand(i + 902) * .25, 1),
  });
  const canopyTrail = makeTrail(canopy, canopySlots, 240, false);

  // Pedras e cupinzeiros de cerrado espalhados no pasto.
  const rocks = new THREE.InstancedMesh(
    lumpyGeometry(new THREE.IcosahedronGeometry(1, 1), 0.55, 7),
    new THREE.MeshStandardMaterial({ color: 0x8d8171, roughness: 0.95 }),
    26,
  );
  rocks.name = 'pasture-rocks'; rocks.castShadow = rocks.receiveShadow = true; root.add(rocks);
  const rockSlots: InstanceSlot[] = [];
  for (let i = 0; i < 26; i += 1) {
    const size = 0.16 + rand(i + 501) * 0.55;
    rockSlots.push({
      x: rand(i + 502) * 240 - 120,
      z: (i % 3 === 0 ? -1 : 1) * (7.8 + rand(i + 503) * 26),
      rotation: rand(i + 504) * Math.PI * 2,
      scale: new THREE.Vector3(size * (1 + rand(i + 505) * 0.6), size, size),
    });
  }
  const rockTrail = makeTrail(rocks, rockSlots, 240, true, 0.06);

  return {
    update(elapsed: number, wet: boolean, reducedMotion: boolean, truckX: number, windStrength = 0.65) {
      latestTruckX = truckX;
      maizeTrails.forEach(trail => trail.update(truckX));
      wind.value = windStrength;
      time.value = reducedMotion ? 0 : elapsed / 1000;
      grassMaterial.color.set(wet ? 0x9aa383 : 0xffffff);
      clumpMaterial.color.set(wet ? 0x93a07f : 0xf5f2e2);
      cropLeafMaterial.color.set(wet ? 0xc4c8b0 : 0xe4dfc4);
      (patches.material as THREE.MeshBasicMaterial).opacity = wet ? 0.4 : 0.28;
      for (const [index, slot] of patchSlots.entries()) {
        transform.position.set(wrapSompoX(slot.x, truckX, 200), 0.009, slot.z);
        transform.rotation.set(-Math.PI / 2, 0, slot.spin);
        transform.scale.set(slot.sx, slot.sy, 1);
        transform.updateMatrix();
        patches.setMatrixAt(index, transform.matrix);
      }
      patches.instanceMatrix.needsUpdate = true;
      for (const rut of ruts) rut.position.x = Math.round(truckX / 20) * 20;
      grassTrail.update(truckX);
      weedTrail.update(truckX);
      clumpTrail.update(truckX);
      canopyTrail.update(truckX);
      cropNearTrail.update(truckX);
      cropFarTrail.update(truckX);
      rockTrail.update(truckX);
    },
    dispose() { disposed = true; assetAbort.abort(); patchMap.dispose(); rutMap.dispose(); },
  };
}
