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
 * seca, base espalhada — lê como gramado e não como agave. `tall` gera a
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

/** Pé de lavoura: colmo + 9 folhas largas arqueadas que fecham a copa entre
 * plantas da fileira — a lavoura lê como massa contínua, não como talos
 * espaçados. Dois grupos de material: [colmo simples, folhas com textura alfa]. */
function cropPlantGeometry(leaves = 9) {
  const stalk = new THREE.CylinderGeometry(0.02, 0.036, 1.1, 5);
  stalk.translate(0, 0.55, 0);
  const leafParts: THREE.BufferGeometry[] = [];
  for (let leaf = 0; leaf < leaves; leaf += 1) {
    const wide = leaf % 3 !== 2;
    const bladePart = new THREE.PlaneGeometry(wide ? 0.44 : 0.26, 0.8, 1, 3);
    bladePart.translate(0, 0.36, 0);
    const positions = bladePart.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < positions.count; v += 1) {
      const t = positions.getY(v) / 0.72;
      positions.setX(v, positions.getX(v) * (1 - t * 0.55));
      positions.setZ(v, positions.getZ(v) + (t * t * 0.8));
      positions.setY(v, positions.getY(v) * (1 - t * 0.34) + 0.14 + leaf * (leaves < 9 ? 0.19 : 0.105));
    }
    bladePart.rotateY((leaf / leaves) * Math.PI * 2 + 0.7 + leaf * 0.31);
    leafParts.push(bladePart);
  }
  const leafFan = mergeGeometries(leafParts);
  leafParts.forEach((part) => part.dispose());
  const geometry = mergeGeometries([stalk, leafFan], true);
  stalk.dispose(); leafFan.dispose();
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
      shader.vertexShader = 'uniform float grassTime; uniform float grassWind;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed.x += (sin(grassTime * 1.3 + instanceMatrix[3].x * 0.6) + sin(grassTime * 0.83 + instanceMatrix[3].z * 1.1) * 0.6) * position.y * position.y * grassWind * ${strength.toFixed(3)};`);
    };
    material.customProgramCacheKey = () => `sompo-wind-${strength}`;
  };
  // Rampa calibrada da técnica sylva (inner-green-3d, MIT): verde fundo no
  // pé da lâmina, ponta quente iluminada, sombreado por profundidade — o que
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
          gRamp = mix(gRamp, vec3(.26,.40,.068), smoothstep(.4, 1., vBladeT) * (.4 + .6 * vGTone));
          gRamp = mix(gRamp, vec3(.55,.8,.16), smoothstep(.78, 1., vBladeT) * vGTone * .5);
          // diffuseColor chega como instanceColor (matiz seco/verde por tufo).
          diffuseColor.rgb = gRamp * (diffuseColor.rgb * 2.3 + .3);`);
    };
    material.customProgramCacheKey = () => `sompo-grass-ramp-v1`;
  };

  // Gramado de beira de pista: tufos baixos e densos sobre faixa já coberta
  // pelo pasto — lê como capim contínuo, não como espinhos em terra pelada.
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
  // entremeados na faixa — silhueta e palheta diferentes do gramado rasteiro.
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
    // Maioria seco/dourado; fração verde-oliva — é a textura da beira real.
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

  // Lavoura em fileiras logo atrás da cerca, subindo a encosta. Verde
  // profundo com variação por fase: altura, prumo e matiz mudam de pé pra pé,
  // e uma fração amarelada quebra a uniformidade como numa lavoura real.
  const cropLeafMaterial = new THREE.MeshStandardMaterial({ color: 0xf2f5e2, roughness: 0.85, side: THREE.DoubleSide, emissive: 0x1c2a10, emissiveIntensity: 0.55 });
  const cropStalkMaterial = new THREE.MeshStandardMaterial({ color: 0x3d5c22, roughness: 0.95 });
  windify(cropLeafMaterial, 0.04); windify(cropStalkMaterial, 0.04);
  // Folha real com alfa: gira o UV pra folha da textura correr na vertical do
  // card (no PNG ela vai na diagonal); tinte da instância claro pra não destruir a nervura.
  if (typeof document !== 'undefined' && typeof document.createElementNS === 'function') new THREE.TextureLoader().load('/sompo/gen/folha-milho.webp', (map) => {
    map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
    map.center.set(0.5, 0.5); map.rotation = -0.3; map.repeat.set(0.95, 0.95);
    cropLeafMaterial.map = map; cropLeafMaterial.alphaTest = 0.42; cropLeafMaterial.needsUpdate = true;
  });
  const cropRows = 30;
  const cropCols = 215;
  // LOD por faixa: perto da cerca (|z|<20) o pé fica completo (9 folhas);
  // no fundo do talhão 4 folhas bastam — a copa continua fechada e o custo
  // de vértice cai ~30% sem rarefazer a leitura do carpete.
  const cropNearCount = 7 * cropCols, cropFarCount = (cropRows - 7) * cropCols;
  const cropsNear = new THREE.InstancedMesh(cropPlantGeometry(9), [cropStalkMaterial, cropLeafMaterial], cropNearCount);
  const cropsFar = new THREE.InstancedMesh(cropPlantGeometry(4), [cropStalkMaterial, cropLeafMaterial], cropFarCount);
  cropsNear.name = 'row-crop-field-near'; cropsFar.name = 'row-crop-field-far';
  cropsNear.receiveShadow = cropsFar.receiveShadow = true;
  root.add(cropsNear, cropsFar);
  const nearSlots: InstanceSlot[] = [], farSlots: InstanceSlot[] = [];
  for (let row = 0; row < cropRows; row += 1) {
    for (let column = 0; column < cropCols; column += 1) {
      const i = row * cropCols + column;
      const z = -11.9 - row * 1.22 + (rand(i + 401) - 0.5) * 0.3;
      const size = 1.3 + rand(i + 403) * 0.9;
      const near = row < 7;
      (near ? nearSlots : farSlots).push({
        x: column * 1.08 - 115.9 + (rand(i + 402) - 0.5) * 0.55,
        z,
        rotation: rand(i + 404) * Math.PI * 2,
        tilt: (rand(i + 407) - 0.5) * 0.14,
        scale: new THREE.Vector3(size, size * (0.82 + rand(i + 408) * 0.4), size),
      });
      const dry = rand(i + 409) < 0.09;
      (near ? cropsNear : cropsFar).setColorAt((near ? nearSlots : farSlots).length - 1, dry
        ? new THREE.Color().setHSL(0.15 + rand(i + 405) * 0.03, 0.4, 0.52 + rand(i + 406) * 0.12)
        : new THREE.Color().setHSL(0.25 + rand(i + 405) * 0.05, 0.48 + rand(i + 411) * 0.16, 0.52 + rand(i + 406) * 0.2));
    }
  }
  const cropNearTrail = makeTrail(cropsNear, nearSlots, 240, true, 0.04);
  const cropFarTrail = makeTrail(cropsFar, farSlots, 240, true, 0.04);

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
      wind.value = windStrength;
      time.value = reducedMotion ? 0 : elapsed / 1000;
      grassMaterial.color.set(wet ? 0x9aa383 : 0xffffff);
      clumpMaterial.color.set(wet ? 0x93a07f : 0xf5f2e2);
      bushMaterial.color.set(wet ? 0x43543a : 0x51683a);
      cropLeafMaterial.color.set(wet ? 0xa8b090 : 0xf2f5e2);
      cropStalkMaterial.color.set(wet ? 0x2f4719 : 0x3d5c22);
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
      bushTrail.update(truckX);
      cropNearTrail.update(truckX);
      cropFarTrail.update(truckX);
      rockTrail.update(truckX);
    },
    dispose() { patchMap.dispose(); rutMap.dispose(); },
  };
}
