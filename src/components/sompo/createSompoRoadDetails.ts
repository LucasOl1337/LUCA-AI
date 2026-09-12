import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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

/** Tufo de capim com lâminas 3D curvas de verdade (sem cards com alpha). */
function grassTuftGeometry(blades: number, seed: number) {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < blades; i += 1) {
    const blade = new THREE.PlaneGeometry(0.034, 0.65, 1, 3);
    blade.translate(0, 0.325, 0);
    const positions = blade.attributes.position as THREE.BufferAttribute;
    const bend = 0.28 + rand(seed + i * 7 + 3) * 0.55;
    const height = 0.65 + rand(seed + i * 7 + 5) * 0.6;
    for (let v = 0; v < positions.count; v += 1) {
      const t = positions.getY(v);
      positions.setX(v, positions.getX(v) * (1 - (t ** 1.4) * 0.85));
      positions.setZ(v, positions.getZ(v) + (t * t * bend));
      positions.setY(v, t * height);
    }
    blade.rotateY((i / blades) * Math.PI * 2 + rand(seed + i) * 0.9);
    parts.push(blade);
  }
  const geometry = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  const positions = geometry.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(positions.count * 3);
  for (let v = 0; v < positions.count; v += 1) {
    const shade = 0.5 + Math.min(1, positions.getY(v) / 0.9) * 0.55;
    colors[v * 3] = shade; colors[v * 3 + 1] = shade; colors[v * 3 + 2] = shade * 0.92;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Pé de lavoura: colmo + 7 folhas arqueadas, malha real — denso o bastante pra ler como fileira. */
function cropPlantGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const stalk = new THREE.CylinderGeometry(0.02, 0.036, 1.1, 5);
  stalk.translate(0, 0.55, 0);
  parts.push(stalk);
  for (let leaf = 0; leaf < 7; leaf += 1) {
    const bladePart = new THREE.PlaneGeometry(0.22, 0.58, 1, 3);
    bladePart.translate(0, 0.29, 0);
    const positions = bladePart.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < positions.count; v += 1) {
      const t = positions.getY(v) / 0.58;
      positions.setX(v, positions.getX(v) * (1 - t * 0.62));
      positions.setZ(v, positions.getZ(v) + (t * t * 0.72));
      positions.setY(v, positions.getY(v) * (1 - t * 0.3) + 0.2 + leaf * 0.125);
    }
    bladePart.rotateY((leaf / 7) * Math.PI * 2 + 0.7 + leaf * 0.31);
    parts.push(bladePart);
  }
  const geometry = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
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

interface InstanceSlot { x: number; z: number; y?: number; rotation: number; scale: THREE.Vector3 }

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
        transform.rotation.set(0, slot.rotation, 0);
        transform.scale.copy(slot.scale);
        transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
      }
      if (changed) mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

export function createSompoRoadDetails(parent: THREE.Group) {
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
      shader.vertexShader = 'uniform float grassTime; uniform float grassWind;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed.x += sin(grassTime * 1.3 + instanceMatrix[3].x * 0.6) * position.y * position.y * grassWind * ${strength.toFixed(3)};`);
    };
    material.customProgramCacheKey = () => `sompo-wind-${strength}`;
  };

  // Tufos 3D à beira da pista (faixa plana) e touceiras maiores no pasto.
  const tuftGeometry = grassTuftGeometry(7, 11);
  const grassMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide, color: 0xa8bf7e });
  windify(grassMaterial, 0.055);
  const grass = new THREE.InstancedMesh(tuftGeometry, grassMaterial, 1250);
  grass.name = 'near-road-grass-tufts'; grass.receiveShadow = true; root.add(grass);
  const grassSlots: InstanceSlot[] = [];
  for (let i = 0; i < 1250; i += 1) {
    const roadside = i % 2 === 0;
    const z = roadside ? 3.45 + rand(i + 20) * 3.4 : -7.5 - rand(i + 20) * 2.6;
    const size = 0.6 + rand(i + 31) * 0.95;
    // Capim mais alto colado na cerca, como na beira de estrada real.
    const nearFence = roadside && z > 5.4 ? 1.45 : 1;
    grassSlots.push({ x: rand(i + 12) * 160 - 80, z, y: -0.03, rotation: rand(i + 42) * Math.PI, scale: new THREE.Vector3(size, size * (0.85 + rand(i + 44) * 0.55) * nearFence, size) });
    grass.setColorAt(i, new THREE.Color().setHSL(0.19 + rand(i) * 0.07, 0.28 + rand(i + 8) * 0.14, 0.4 + rand(i + 9) * 0.18));
  }
  const grassTrail = makeTrail(grass, grassSlots, 160, false, 0.03);

  const clumpMaterial = grassMaterial.clone();
  windify(clumpMaterial, 0.075);
  const clumps = new THREE.InstancedMesh(grassTuftGeometry(9, 57), clumpMaterial, 300);
  clumps.name = 'pasture-grass-clumps'; clumps.receiveShadow = true; root.add(clumps);
  const clumpSlots: InstanceSlot[] = [];
  for (let i = 0; i < 300; i += 1) {
    const x = rand(i + 301) * 220 - 110;
    const z = 8.5 + rand(i + 302) * 31;
    const density = sompoVegetationDensity(x, z);
    const size = (0.9 + rand(i + 303) * 1.4) * (0.55 + density * 0.8);
    clumpSlots.push({ x, z, rotation: rand(i + 304) * Math.PI, scale: new THREE.Vector3(size, size * 1.15, size) });
    clumps.setColorAt(i, new THREE.Color().setHSL(0.2 + rand(i + 305) * 0.06, 0.3, 0.36 + rand(i + 306) * 0.16));
  }
  const clumpTrail = makeTrail(clumps, clumpSlots, 220, true, 0.05);

  // Arbustos de cerrado na borda da lavoura e do pasto.
  const bushMaterial = new THREE.MeshStandardMaterial({ color: 0x51683a, roughness: 1 });
  windify(bushMaterial, 0.02);
  const bushes = new THREE.InstancedMesh(
    lumpyGeometry(new THREE.IcosahedronGeometry(1, 2), 0.42, 31),
    bushMaterial,
    46,
  );
  bushes.name = 'cerrado-shrubs'; bushes.castShadow = bushes.receiveShadow = true; root.add(bushes);
  const bushSlots: InstanceSlot[] = [];
  for (let i = 0; i < 46; i += 1) {
    const size = 0.5 + rand(i + 701) * 0.9;
    bushSlots.push({
      x: rand(i + 702) * 230 - 115,
      z: i % 3 === 0 ? -(11 + rand(i + 703) * 9) : 8 + rand(i + 703) * 30,
      rotation: rand(i + 704) * Math.PI,
      scale: new THREE.Vector3(size * (1.1 + rand(i + 705) * 0.5), size * (0.55 + rand(i + 706) * 0.4), size),
    });
    bushes.setColorAt(i, new THREE.Color().setHSL(0.22 + rand(i + 707) * 0.05, 0.3 + rand(i + 708) * 0.12, 0.26 + rand(i + 709) * 0.12));
  }
  const bushTrail = makeTrail(bushes, bushSlots, 230, true, 0.04);

  // Lavoura em fileiras subindo a encosta, acompanhando o relevo.
  const cropMaterial = new THREE.MeshStandardMaterial({ color: 0x588a33, roughness: 0.95, side: THREE.DoubleSide });
  windify(cropMaterial, 0.04);
  const cropRows = 24;
  const cropCols = 170;
  const crops = new THREE.InstancedMesh(cropPlantGeometry(), cropMaterial, cropRows * cropCols);
  crops.name = 'row-crop-field'; crops.receiveShadow = true; root.add(crops);
  const cropSlots: InstanceSlot[] = [];
  for (let row = 0; row < cropRows; row += 1) {
    for (let column = 0; column < cropCols; column += 1) {
      const i = row * cropCols + column;
      const z = -14.6 - row * 1.5 + (rand(i + 401) - 0.5) * 0.3;
      const size = 1.15 + rand(i + 403) * 0.65;
      cropSlots.push({
        x: column * 1.35 - 114.75 + (rand(i + 402) - 0.5) * 0.6,
        z,
        rotation: rand(i + 404) * Math.PI * 2,
        scale: new THREE.Vector3(size, size, size),
      });
      crops.setColorAt(i, new THREE.Color().setHSL(0.255 + rand(i + 405) * 0.04, 0.48, 0.25 + rand(i + 406) * 0.09));
    }
  }
  const cropTrail = makeTrail(crops, cropSlots, 240, true, 0.04);

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

  const mounds = new THREE.InstancedMesh(
    lumpyGeometry(new THREE.ConeGeometry(0.75, 1.6, 8, 4), 0.3, 91),
    new THREE.MeshStandardMaterial({ color: 0x9c5a33, roughness: 1 }),
    10,
  );
  mounds.name = 'cerrado-termite-mounds'; mounds.castShadow = mounds.receiveShadow = true; root.add(mounds);
  const moundSlots: InstanceSlot[] = [];
  for (let i = 0; i < 10; i += 1) {
    const size = 0.5 + rand(i + 601) * 0.8;
    moundSlots.push({
      x: rand(i + 602) * 240 - 120,
      z: 10 + rand(i + 603) * 24,
      rotation: rand(i + 604) * Math.PI,
      scale: new THREE.Vector3(size, size + 0.35 + rand(i + 605) * 0.5, size),
    });
  }
  const moundTrail = makeTrail(mounds, moundSlots, 240, true, 0.02);

  return {
    update(elapsed: number, wet: boolean, reducedMotion: boolean, truckX: number, windStrength = 0.65) {
      wind.value = windStrength;
      time.value = reducedMotion ? 0 : elapsed / 1000;
      grassMaterial.color.set(wet ? 0x7f9470 : 0x9cb872);
      clumpMaterial.color.set(wet ? 0x71836a : 0x9cb476);
      bushMaterial.color.set(wet ? 0x43543a : 0x51683a);
      cropMaterial.color.set(wet ? 0x476838 : 0x588a33);
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
      clumpTrail.update(truckX);
      bushTrail.update(truckX);
      cropTrail.update(truckX);
      rockTrail.update(truckX);
      moundTrail.update(truckX);
    },
    dispose() { patchMap.dispose(); rutMap.dispose(); },
  };
}
