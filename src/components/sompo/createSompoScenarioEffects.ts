import * as THREE from 'three';
import type { SompoEffectFrame, SompoVisualEffect } from '../../../shared/sompo-scenario-effects.js';
import type { SompoTruckModel } from './createSompoTruckModel';

const rand = (i: number) => { const n = Math.sin(i * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
const clamp = THREE.MathUtils.clamp;
type ParticleStyle = { color: number; count: number; size: number; life: number; origin: 'wheels' | 'front-wheel' | 'engine' | 'exhaust' | 'impact'; motion: 'smoke' | 'dust' | 'spray' | 'mud'; burst?: boolean; opacity?: number };
const PARTICLES: Partial<Record<SompoVisualEffect, ParticleStyle>> = {
  'road-dust': { color: 0xb5a17b, count: 36, size: 0.8, life: 1.8, origin: 'wheels', motion: 'dust', opacity: 0.19 },
  'shoulder-dust': { color: 0xb5a17b, count: 48, size: 1.2, life: 2, origin: 'wheels', motion: 'dust', opacity: 0.30 },
  'tire-smoke': { color: 0xbdc3c4, count: 60, size: 0.9, life: 2.1, origin: 'wheels', motion: 'smoke', opacity: 0.28 },
  'brake-smoke': { color: 0xa3a5a4, count: 54, size: 0.8, life: 2.6, origin: 'wheels', motion: 'smoke', opacity: 0.25 },
  'engine-smoke': { color: 0x303433, count: 64, size: 1.5, life: 4, origin: 'engine', motion: 'smoke', opacity: 0.62 },
  'engine-steam': { color: 0xe0e4de, count: 24, size: 0.85, life: 2.6, origin: 'engine', motion: 'smoke', opacity: 0.18 },
  exhaust: { color: 0x575e60, count: 24, size: 0.65, life: 2.2, origin: 'exhaust', motion: 'smoke', opacity: 0.22 },
  'blowout-dust': { color: 0xb5b0a4, count: 54, size: 1.15, life: 2.3, origin: 'front-wheel', motion: 'dust', burst: true, opacity: 0.38 },
  'impact-dust': { color: 0xa48e6f, count: 84, size: 1.9, life: 4.2, origin: 'impact', motion: 'dust', burst: true, opacity: 0.42 },
  'wheel-spray': { color: 0xb5c9d2, count: 180, size: 0.07, life: 1.1, origin: 'wheels', motion: 'spray', opacity: 0.55 },
  'mud-spray': { color: 0x58432d, count: 100, size: 0.15, life: 1.4, origin: 'wheels', motion: 'mud', opacity: 0.9 },
  'heat-haze': { color: 0xe9e1ce, count: 18, size: 0.65, life: 1.7, origin: 'engine', motion: 'smoke', opacity: 0.035 },
};

function puffTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  // Overlapping turbulent lobes keep smoke from looking like uniform glowing dots.
  for (let i = 0; i < 22; i += 1) {
    const x = 36 + rand(i) * 56; const y = 36 + rand(i + 30) * 56; const radius = 18 + rand(i + 60) * 24;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, 'rgba(255,255,255,.16)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(canvas);
}

function billboardBatch(count: number, map: THREE.Texture, color: number) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const alpha = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
  geometry.setAttribute('instanceAlpha', alpha);
  const material = new THREE.MeshBasicMaterial({ map, color, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'attribute float instanceAlpha; varying float particleAlpha;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nparticleAlpha = instanceAlpha;');
    shader.fragmentShader = 'varying float particleAlpha;\n' + shader.fragmentShader.replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\ndiffuseColor.a *= particleAlpha;');
  };
  const mesh = new THREE.InstancedMesh(geometry, material, count); mesh.frustumCulled = false; mesh.visible = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return { mesh, alpha };
}

/** Bounded pools, sampled from declarative cues. No per-frame geometry allocation or timers. */
export function createSompoScenarioEffects(scene: THREE.Scene, model: SompoTruckModel, camera: THREE.Camera) {
  const root = new THREE.Group(); root.name = 'sompo-scenario-effects'; root.visible = false; scene.add(root);
  const attachments = new THREE.Group(); attachments.name = 'scenario-truck-attachments'; attachments.visible = false; model.root.add(attachments);
  const puff = puffTexture();
  const transform = new THREE.Object3D(); const point = new THREE.Vector3(); const velocity = new THREE.Vector3();
  const cameraRotation = new THREE.Quaternion();
  const pools = new Map<SompoVisualEffect, ReturnType<typeof billboardBatch>>();
  for (const [name, style] of Object.entries(PARTICLES)) {
    const pool = billboardBatch(style.count, puff, style.color); pool.mesh.name = name; root.add(pool.mesh); pools.set(name as SompoVisualEffect, pool);
  }
  // Flame billboards use a shaped silhouette and a hot core, not a geometric cone.
  const flameCanvas = document.createElement('canvas'); flameCanvas.width = 128; flameCanvas.height = 256;
  const ctx = flameCanvas.getContext('2d', { willReadFrequently: true })!;
  const gradient = ctx.createLinearGradient(0, 256, 0, 0);
  gradient.addColorStop(0, 'rgba(255,244,171,0)'); gradient.addColorStop(0.18, '#fff2b8');
  gradient.addColorStop(0.43, '#ffa51d'); gradient.addColorStop(0.72, '#eb3f06'); gradient.addColorStop(1, 'rgba(173,27,0,0)');
  ctx.fillStyle = gradient; ctx.beginPath(); ctx.moveTo(64, 254);
  ctx.bezierCurveTo(5, 231, 2, 191, 34, 142); ctx.bezierCurveTo(58, 106, 26, 77, 57, 2);
  ctx.bezierCurveTo(43, 98, 102, 110, 96, 161); ctx.bezierCurveTo(140, 204, 111, 245, 64, 254); ctx.fill();
  const flameMap = new THREE.CanvasTexture(flameCanvas); flameMap.colorSpace = THREE.SRGBColorSpace;
  const flames = billboardBatch(9, flameMap, 0xffffff);
  flames.mesh.name = 'engine-flames';
  (flames.mesh.material as THREE.MeshBasicMaterial).blending = THREE.AdditiveBlending;
  (flames.mesh.material as THREE.MeshBasicMaterial).color.setRGB(2.8, 2.2, 1.6);
  root.add(flames.mesh);
  const fireLight = new THREE.PointLight(0xff6d12, 0, 7, 2); fireLight.position.set(3.7, 1.15, 0.8); attachments.add(fireLight);
  const glowMaterial = new THREE.MeshStandardMaterial({ color: 0x201008, emissive: 0xff4a06, emissiveIntensity: 0, roughness: 0.6, transparent: true, opacity: 0 });
  const engineGlow = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 1.65), glowMaterial); engineGlow.position.set(3.8, 0.9, 0); attachments.add(engineGlow);
  const brakeGlow = new THREE.InstancedMesh(new THREE.TorusGeometry(0.23, 0.028, 6, 20), new THREE.MeshBasicMaterial({ color: 0xff5a14, transparent: true, opacity: 0, toneMapped: false }), 6); attachments.add(brakeGlow);

  const debrisMaterial = new THREE.MeshStandardMaterial({ color: 0x242725, roughness: 0.95 });
  const debris = new THREE.InstancedMesh(rubberFragmentGeometry(), debrisMaterial, 42); debris.frustumCulled = false; debris.castShadow = true; root.add(debris);
  const gravel = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x857963, roughness: 1 }), 32); root.add(gravel);
  const marks = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x101413, transparent: true, opacity: 0.6, depthWrite: false }), 64); marks.name = 'persistent-skid-marks'; root.add(marks);
  const mudRuts = new THREE.Group(); mudRuts.name = 'wheel-excavations'; root.add(mudRuts);
  const rutMaterial = new THREE.MeshStandardMaterial({ color: 0x392a1d, roughness: 1 });
  for (const z of [-1, 1]) {
    const rut = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 0.46), rutMaterial); rut.rotation.x = -Math.PI / 2; rut.position.set(-1.4, 0.028, z); mudRuts.add(rut);
    for (const side of [-1, 1]) {
      const ridge = new THREE.Mesh(mudRidgeGeometry(), rutMaterial); ridge.position.set(-1.4, 0.03, z + side * 0.27); mudRuts.add(ridge);
    }
  }
  const lamps: { mesh: THREE.Mesh; kind: SompoVisualEffect }[] = [];
  const lampGeometry = new THREE.BoxGeometry(0.035, 0.065, 0.17);
  for (const [kind, color, x] of [['brake-lights', 0xff1808, -4.39], ['reverse-lights', 0xfff4db, -4.40], ['running-lights', 0xffedd0, 4.39], ['hazard-lights', 0xff9208, 4.40]] as const) {
    for (const side of [-1, 1]) {
      const lamp = new THREE.Mesh(lampGeometry, new THREE.MeshBasicMaterial({ color, toneMapped: false }));
      lamp.position.set(x, kind === 'hazard-lights' ? 0.88 : 0.62, side * (kind === 'reverse-lights' ? 0.73 : 0.95));
      attachments.add(lamp); lamps.push({ mesh: lamp, kind });
      if (kind === 'hazard-lights') {
        const rear = lamp.clone(); rear.position.x = -4.40; attachments.add(rear); lamps.push({ mesh: rear, kind });
      }
    }
  }
  const guides = new THREE.Group(); guides.name = 'reverse-clearance-guides'; root.add(guides);
  const guideMaterial = new THREE.MeshBasicMaterial({ color: 0xc5a650, transparent: true, opacity: 0.45 });
  for (const side of [-1, 1]) {
    const guide = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.055), guideMaterial); guide.position.set(-7, 0.033, side * 1.35); guide.rotation.x = -Math.PI / 2; guides.add(guide);
  }
  const strapMaterial = new THREE.MeshStandardMaterial({ color: 0xae692d, roughness: 0.85 });
  const straps = new THREE.Group(); straps.name = 'strained-cargo-restraints'; attachments.add(straps);
  for (const x of [-2.8, 1.5]) for (const z of [-1.1, 1.1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.055, 1.95, 0.022), strapMaterial); strap.position.set(x, 1.94, z); straps.add(strap);
  }

  let asset: string | undefined; let damagedWheel: THREE.Mesh | undefined;
  let intact: Float32Array | undefined; let originalChildren: boolean[] = []; let lastDamage = -1;
  let anchors: THREE.Vector3[] = []; let front = new THREE.Vector3(3.28, 0.46, 1.02);
  const origins = new Map<string, THREE.Vector3>();
  let previousTime = -1; let previousScenario = '';
  function refreshModel() {
    if (asset === model.root.userData.asset && anchors.length) return;
    asset = model.root.userData.asset;
    model.root.updateWorldMatrix(true, true);
    const candidates = model.wheels.map((wheel) => ({ wheel, position: model.root.worldToLocal(wheel.getWorldPosition(new THREE.Vector3())) }));
    const preferred = candidates.find(({ wheel }) => wheel.userData.blowoutTarget)
      ?? candidates.find(({ wheel }) => !!wheel.userData.intactTirePositions)
      ?? candidates.filter(({ position }) => position.z > 0.5).sort((a, b) => b.position.x - a.position.x)[0];
    damagedWheel = preferred?.wheel;
    if (damagedWheel) {
      intact = new Float32Array(damagedWheel.geometry.attributes.position.array);
      originalChildren = damagedWheel.children.map((child) => child.visible);
      front = preferred!.position.clone(); if (front.z < 0.5) front.z = 1.02;
      lastDamage = -1;
    }
    const xs = [...new Set(candidates.map(({ position }) => Math.round(position.x * 10) / 10))].sort((a, b) => b - a).slice(0, 3);
    anchors = (xs.length ? xs : [3.28, -1.2, -2.12]).flatMap((x) => [-1, 1].map((z) => new THREE.Vector3(x, 0.42, z * 1.02)));
    anchors.forEach((anchor, i) => { transform.position.copy(anchor); transform.rotation.set(0, 0, 0); transform.scale.setScalar(1); transform.updateMatrix(); brakeGlow.setMatrixAt(i, transform.matrix); });
    brakeGlow.count = anchors.length; brakeGlow.instanceMatrix.needsUpdate = true;
  }
  function worldOrigin(style: ParticleStyle, i: number) {
    if (style.origin === 'wheels') point.copy(anchors[i % anchors.length]);
    else if (style.origin === 'front-wheel') point.copy(front);
    else if (style.origin === 'engine') point.set(3.65, 1.05, 0.72);
    else if (style.origin === 'exhaust') point.set(1.5, 0.68, -0.85);
    else point.set(3.6, 0.6, 0.6);
    return model.root.localToWorld(point);
  }
  function damage(amount: number) {
    if (!damagedWheel || !intact || amount === lastDamage) return;
    lastDamage = amount;
    const positions = damagedWheel.geometry.attributes.position as THREE.BufferAttribute;
    const radius = damagedWheel.userData.radius ?? 0.58;
    const combined = !!damagedWheel.userData.intactTirePositions;
    for (let i = 0; i < positions.count; i += 1) {
      const x = intact[i * 3]; const axle = intact[i * 3 + 1]; const z = intact[i * 3 + 2];
      const r = Math.hypot(x, z); const angle = Math.atan2(z, x);
      // Keep the metal hub intact; crumple the outer sidewall into torn, uneven rubber.
      const radial = r > radius * 0.62 && (!combined || axle > 0)
        ? 1 - amount * (0.36 + 0.10 * Math.sin(angle * 9) + 0.05 * Math.sin(angle * 17)) : 1;
      positions.setXYZ(i, x * radial, axle + (radial < 1 ? amount * 0.07 * Math.sin(angle * 5) : 0), z * radial);
    }
    positions.needsUpdate = true; damagedWheel.geometry.computeVertexNormals();
    damagedWheel.children.forEach((child, i) => { child.visible = /tread/.test(child.name) && amount > 0.6 ? false : originalChildren[i]; });
    damagedWheel.userData.destroyed = amount > 0.9;
  }

  const truckWorld = new THREE.Vector3();
  return {
    /** Desloca âncoras de mundo quando a cena re-centra a origem (trilha longa). */
    rebase(shift: number) {
      for (const origin of origins.values()) origin.x -= shift;
    },
    update(frame: SompoEffectFrame, elapsed: number, scenarioId: string, speed: number, reducedMotion: boolean, slope: number, outcomeKey = '', slopePivotX = 0, direction = 1, worldXAt?: (atMs: number) => number) {
      refreshModel(); root.visible = attachments.visible = true;
      const runKey = `${scenarioId} ${outcomeKey}`;
      if (runKey !== previousScenario || elapsed < previousTime) origins.clear();
      previousScenario = runKey; previousTime = elapsed;
      camera.getWorldQuaternion(cameraRotation); model.root.updateWorldMatrix(true, true);
      model.root.getWorldPosition(truckWorld);
      const floorAt = (x: number) => Math.tan(slope) * (x - slopePivotX);
      const cues = new Map(frame.cues.map((cue) => [cue.effect, cue]));
      const intensity = (name: SompoVisualEffect) => cues.get(name)?.intensity ?? 0;
      const clock = reducedMotion ? 0 : elapsed / 1000;
      const anchorAt = (key: string, atMs: number) => {
        if (!origins.has(key)) {
          const anchor = point.clone();
          if (worldXAt) anchor.x += worldXAt(atMs) - worldXAt(elapsed);
          origins.set(key, anchor);
        }
        return origins.get(key)!;
      };
      damage(intensity('tire-damage'));
      for (const [name, pool] of pools) {
        const cue = cues.get(name); pool.mesh.visible = !!cue && cue.intensity > 0 && !reducedMotion;
        if (!pool.mesh.visible || !cue) continue;
        const style = PARTICLES[name]!;
        const age = cue.ageMs / 1000;
        for (let i = 0; i < style.count; i += 1) {
          const life = style.life * (0.7 + rand(i + 20) * 0.5);
          const particleAge = style.burst ? age - rand(i) * 0.12 : (age + rand(i + 237) * life) % life;
          const progress = clamp(particleAge / life, 0, 1);
          const emitter = worldOrigin(style, i);
          if (style.motion === 'mud') emitter.y = Math.max(emitter.y, floorAt(emitter.x) + 0.08);
          if (style.burst) {
            point.copy(anchorAt(name, cue.startMs));
          }
          const side = i % 2 ? 1 : -1;
          if (style.motion === 'spray' || style.motion === 'mud') {
            velocity.set(direction * (-1.7 - rand(i) * 2.6), 2 + rand(i + 2) * 2.2, side * (0.65 + rand(i + 4)));
            point.addScaledVector(velocity, particleAge); point.y -= 4.9 * particleAge * particleAge;
          } else if (style.burst) {
            const theta = rand(i + 1) * Math.PI * 2;
            point.x += Math.cos(theta) * particleAge * (1 + rand(i + 2) * 2);
            point.z += Math.sin(theta) * particleAge * (1 + rand(i + 3) * 2);
            point.y += particleAge * (0.35 + rand(i + 4) * 0.65);
          } else {
            // Com deslocamento real, o rastro recua na velocidade verdadeira (m/s)
            // e fica para trás no mundo em vez de acompanhar o caminhão.
            point.x -= particleAge * (direction * .45 + speed / 3.6) + rand(i) * 0.2;
            point.y += particleAge * (style.motion === 'smoke' ? 0.8 : 0.3);
            point.z += (rand(i + 6) - 0.5) * particleAge * 0.9;
          }
          const size = style.size * (0.55 + rand(i + 7) * 0.5) * (style.motion === 'spray' || style.motion === 'mud' ? 1 : 0.5 + progress * 1.5);
          transform.position.copy(point); transform.quaternion.copy(cameraRotation);
          transform.scale.set(size, style.motion === 'spray' ? size * 2.5 : size, 1); transform.updateMatrix(); pool.mesh.setMatrixAt(i, transform.matrix);
          const visibility = particleAge < 0 || particleAge > life || point.y < floorAt(point.x) + 0.015 ? 0 : 1;
          pool.alpha.setX(i, visibility * cue.intensity * (style.opacity ?? 0.3) * Math.sin(Math.PI * progress) ** 0.6);
        }
        pool.mesh.instanceMatrix.needsUpdate = true; pool.alpha.needsUpdate = true;
      }
      if (intensity('sensor-warning') > 0 && model.rayMaterial) model.rayMaterial.opacity = reducedMotion ? 1 : 0.7 + Math.sin(clock * 6) * 0.25;
      const fire = intensity('engine-fire');
      flames.mesh.visible = fire > 0;
      for (let i = 0; i < 9 && fire > 0; i += 1) {
        point.set(3.55 + rand(i) * 0.55, 1.0 + rand(i + 10) * 0.22, 0.60 + rand(i + 20) * 0.45); model.root.localToWorld(point);
        const pulse = 0.8 + Math.sin(clock * (8 + rand(i) * 7) + i) * 0.15;
        transform.position.copy(point); transform.position.y += fire * pulse * 0.42; transform.quaternion.copy(cameraRotation);
        transform.scale.set(0.34 * pulse * fire, (0.7 + rand(i + 3) * 0.9) * fire * pulse, 1); transform.updateMatrix(); flames.mesh.setMatrixAt(i, transform.matrix);
        flames.alpha.setX(i, 0.7 * fire);
      }
      flames.mesh.instanceMatrix.needsUpdate = true; flames.alpha.needsUpdate = true;
      fireLight.intensity = fire * (18 + Math.sin(clock * 17) * 3); glowMaterial.emissiveIntensity = fire * 4; glowMaterial.opacity = fire * 0.8; engineGlow.visible = fire > 0;
      (brakeGlow.material as THREE.MeshBasicMaterial).opacity = intensity('brake-glow') * 0.8; brakeGlow.visible = intensity('brake-glow') > 0;
      lamps.forEach(({ mesh, kind }) => { mesh.visible = intensity(kind) > 0 && (kind !== 'hazard-lights' || reducedMotion || Math.sin(clock * 7) > 0); });
      guides.visible = intensity('maneuver-guides') > 0; straps.visible = intensity('cargo-strain') > 0;
      straps.rotation.x = reducedMotion ? 0 : Math.sin(clock * 4) * 0.012 * intensity('cargo-strain');
      const cargo = model.root.userData.cargoBody as THREE.Object3D | undefined;
      if (cargo) cargo.position.z = intensity('cargo-shift') * (0.12 + (reducedMotion ? 0 : Math.sin(clock * 2) * 0.025));
      const pieces = cues.get('rubber-shards') ?? cues.get('debris');
      debris.visible = !!pieces;
      if (pieces) {
        const rubber = pieces.effect === 'rubber-shards';
        const key = pieces.effect;
        if (!origins.has(key)) {
          worldOrigin({ origin: rubber ? 'front-wheel' : 'impact' } as ParticleStyle, 0); anchorAt(key, pieces.startMs);
        }
        const anchor = origins.get(key)!;
        for (let i = 0; i < 42; i += 1) {
          const t = reducedMotion ? 2 : Math.min(3, pieces.ageMs / 1000);
          const angle = rand(i + 25) * Math.PI * 2; const spread = (rubber ? 1.8 : 2.4) * (0.5 + rand(i));
          point.copy(anchor); point.x += Math.cos(angle) * t * spread; point.z += Math.sin(angle) * t * spread;
          const floor = floorAt(point.x) + 0.035;
          point.y = Math.max(floor, anchor.y + t * (1.6 + rand(i + 1) * 2.4) - 4.9 * t * t);
          const landed = point.y <= floor;
          transform.position.copy(point); transform.rotation.set(landed ? 0 : t * (4 + rand(i)), angle + t, landed ? 0 : t * 6);
          transform.scale.set(0.08 + rand(i + 2) * 0.18, rubber ? 0.022 : 0.04, 0.035 + rand(i + 3) * 0.12); transform.updateMatrix(); debris.setMatrixAt(i, transform.matrix);
        }
        debris.instanceMatrix.needsUpdate = true;
      }
      const skid = cues.get('skid-marks'); marks.visible = !!skid;
      if (skid) {
        // A marca nasce onde a frenagem começou e se estende até onde o caminhão
        // realmente chegou: deslocamento de mundo, não relógio.
        model.root.localToWorld(point.set(front.x, 0, 0));
        const origin = anchorAt('skid-marks', skid.startMs);
        const frontNowX = model.root.localToWorld(point.set(front.x, 0, 0)).x;
        const length = clamp(Math.abs(frontNowX - origin.x), 0.6, 45);
        for (let i = 0; i < 64; i += 1) {
          const along = Math.floor(i / 2) / 31; const x = origin.x + direction * along * length;
          const curve = scenarioId === 'fast-corner' ? along * along * 1.3 : scenarioId === 'tire-blowout' ? -along * 0.55 : 0;
          transform.position.set(x, floorAt(x) + 0.029, origin.z + (i % 2 ? 1 : -1) * 1.01 + curve);
          transform.rotation.set(-Math.PI / 2, 0, curve * 0.1); transform.scale.set(length / 31 * (0.86 + rand(i) * 0.14), 0.20 + rand(i + 1) * 0.06, 1); transform.updateMatrix(); marks.setMatrixAt(i, transform.matrix);
        }
        marks.instanceMatrix.needsUpdate = true;
      }
      mudRuts.visible = intensity('mud-ruts') > 0; mudRuts.scale.y = intensity('mud-ruts');
      mudRuts.position.x = truckWorld.x;
      guides.position.x = truckWorld.x;
      const mudClumps = intensity('mud-spray') > 0;
      gravel.visible = (intensity('gravel') > 0 || mudClumps) && !reducedMotion;
      (gravel.material as THREE.MeshStandardMaterial).color.set(mudClumps ? 0x5e4228 : 0x857963);
      if (gravel.visible) {
        for (let i = 0; i < 32; i += 1) {
          const age = (clock + rand(i + 200)) % 1; point.copy(anchors[i % anchors.length]); model.root.localToWorld(point);
          transform.position.set(point.x - direction * age * 3, Math.max(0.035, 0.08 + age * (mudClumps ? 3.2 : 1.4) - age * age * 4.9), point.z + (i % 2 ? 1 : -1) * age);
          transform.rotation.set(i + age * 3, i, 0); transform.scale.setScalar((mudClumps ? 0.04 : 0.025) + rand(i) * 0.028); transform.updateMatrix(); gravel.setMatrixAt(i, transform.matrix);
        }
        gravel.instanceMatrix.needsUpdate = true;
      }
      // Expose a small read-only diagnostic surface for local browser verification.
      root.userData.activeEffects = [...cues.keys()]; root.userData.destroyedTire = !!damagedWheel?.userData.destroyed;
    },
    dispose() { damage(0); attachments.removeFromParent(); root.removeFromParent();
      const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>();
      for (const group of [attachments, root]) group.traverse((object) => { const mesh = object as THREE.Mesh; if (mesh.geometry) geometries.add(mesh.geometry); if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => materials.add(material)); });
      geometries.forEach((geometry) => geometry.dispose()); materials.forEach((material) => material.dispose()); puff.dispose(); flameMap.dispose();
    },
  };
}

function rubberFragmentGeometry() {
  const geometry = new THREE.BoxGeometry(1, 1, 1, 3, 1, 1);
  const positions = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    positions.setXYZ(i, x, y, z * (0.7 + 0.25 * Math.cos(x * 11)) + Math.sin(x * 3.2) * 0.5);
  }
  geometry.computeVertexNormals(); return geometry;
}

function mudRidgeGeometry() {
  const geometry = new THREE.BoxGeometry(4.5, 0.09, 0.22, 24, 1, 3);
  const p = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const edge = Math.max(0, 1 - (Math.abs(x) / 2.25) ** 4);
    p.setXYZ(i, x, y * (0.5 + rand(Math.round(x * 100)) * 1.5) * edge, z * (0.7 + rand(Math.round(x * 90)) * 0.6));
  }
  geometry.computeVertexNormals(); return geometry;
}
