import * as THREE from 'three';
import { createSompoCropRows } from './createSompoCropRows';
import { varySompoSurface } from './createSompoRoadDetails';
import { disposeSompoObject } from './sompoStage';
import type { SompoAgriVisualFrame } from '../../../shared/sompo-agri-scenarios.js';

export const SOMPO_AGRI_ENVIRONMENTS = Object.freeze({
  'row-crop-field': Object.freeze({ sky: 0xb8d6dd, ground: 0x6f542d, crop: 0xb99438, slope: 0.025, mud: 0, night: false, barn: false }),
  'sloped-field': Object.freeze({ sky: 0xb8d6dd, ground: 0x79613a, crop: 0x769247, slope: 0.17, mud: 0, night: false, barn: false }),
  'muddy-field': Object.freeze({ sky: 0x92a6a5, ground: 0x4a3829, crop: 0x6d8449, slope: 0.035, mud: 1, night: false, barn: false }),
  'farm-barn': Object.freeze({ sky: 0xb7c8c8, ground: 0x735d3f, crop: 0x789347, slope: 0, mud: 0, night: false, barn: true }),
  'row-crop-field-night': Object.freeze({ sky: 0x07111d, ground: 0x29291e, crop: 0x544e28, slope: 0.025, mud: 0, night: true, barn: false }),
});

export type SompoAgriEnvironmentId = keyof typeof SOMPO_AGRI_ENVIRONMENTS;

function terrainHeight(x: number, z: number, slope: number) {
  const base = (z * slope) + (Math.sin(x * 0.075) * 0.18) + (Math.cos(z * 0.11) * 0.1);
  // Anel de morros: o talhão termina num relevo de borda, não num corte reto.
  // A crista varia por azimute (cristas altas e trechos baixos) pra ler como
  // serra de verdade no horizonte em vez de um anel uniforme.
  const rim = Math.max(Math.abs(x) / 150, Math.abs(z) / 110);
  const crest = Math.sin(x * 0.013 + 2.1) * Math.cos(z * 0.017 - 0.8);
  const crest2 = Math.sin(x * 0.029 - 0.7) * Math.sin(z * 0.023 + 1.9);
  const rise = Math.max(0, rim - 0.5) ** 2 * 68 * (0.68 + crest * 0.22 + crest2 * 0.1);
  const roll = Math.sin(x * 0.031 + 1.7) * Math.cos(z * 0.043 + 0.6);
  return base + rise * (0.72 + roll * 0.28);
}

function createTerrain(environment: (typeof SOMPO_AGRI_ENVIRONMENTS)[SompoAgriEnvironmentId]) {
  const geometry = new THREE.PlaneGeometry(300, 220, 150, 110);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    positions.setY(index, terrainHeight(positions.getX(index), positions.getZ(index), environment.slope));
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color: environment.ground,
    roughness: environment.mud ? 0.72 : 0.96,
    metalness: 0,
  });
  varySompoSurface(material, 0.26);
  const terrain = new THREE.Mesh(geometry, material);
  terrain.name = 'sompo-agri-terrain';
  terrain.receiveShadow = true;
  return terrain;
}

function createBarn() {
  const root = new THREE.Group();
  root.name = 'sompo-agri-barn';
  root.position.set(4, 0, 0);
  const steel = new THREE.MeshStandardMaterial({ color: 0x4d5556, metalness: 0.62, roughness: 0.52 });
  const siding = new THREE.MeshStandardMaterial({ color: 0x8c3d2d, metalness: 0.28, roughness: 0.72 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x8d9895, metalness: 0.72, roughness: 0.42 });
  for (const x of [-8, 8]) for (const z of [-6, 6]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.2, 0.3), steel);
    post.position.set(x, 2.6, z);
    post.castShadow = true;
    root.add(post);
  }
  for (const z of [-6.15, 6.15]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(16.5, 4.8, 0.18), siding);
    wall.position.set(0, 2.4, z);
    wall.castShadow = wall.receiveShadow = true;
    root.add(wall);
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.18, 4.8, 12.5), siding);
  back.position.set(8.15, 2.4, 0);
  root.add(back);
  const roofMesh = new THREE.Mesh(new THREE.BoxGeometry(17.4, 0.18, 13.4), roof);
  roofMesh.position.set(0, 5.45, 0);
  roofMesh.rotation.z = -0.06;
  roofMesh.castShadow = true;
  root.add(roofMesh);
  return root;
}

function dustMap() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const fade = ctx.createRadialGradient(32,32,0,32,32,32);
    fade.addColorStop(0,'rgba(255,255,255,.6)');fade.addColorStop(.45,'rgba(255,255,255,.24)');fade.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=fade;ctx.fillRect(0,0,64,64);
  }
  return new THREE.CanvasTexture(canvas);
}

function createDust() {
  const count = 160;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const alpha = new THREE.BufferAttribute(new Float32Array(count), 1);
  for (let index = 0; index < count; index += 1) {
    const angle = index * 2.399963;
    const radius = 0.35 + ((index % 23) / 23) * 4.6;
    positions[index * 3] = -1 - radius;
    positions[(index * 3) + 1] = 0.2 + ((index * 19) % 31) / 19;
    positions[(index * 3) + 2] = Math.sin(angle) * radius * 0.55;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('particleAlpha', alpha);
  const material = new THREE.PointsMaterial({ color: 0xc6ad80, size: 0.75, map: dustMap(), transparent: true, opacity: 0, depthWrite: false });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float particleAlpha; varying float dustAlpha;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ndustAlpha=particleAlpha;');
    shader.fragmentShader = 'varying float dustAlpha;\n' + shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= dustAlpha;');
  };
  const dust = new THREE.Points(geometry, material);
  dust.frustumCulled = false;
  dust.name = 'sompo-agri-dust';
  return dust;
}

export function createSompoAgriScene(parent: THREE.Group, environmentId: SompoAgriEnvironmentId, compact = false, equipmentId: 'tractor' | 'harvester' = 'harvester') {
  const definition = SOMPO_AGRI_ENVIRONMENTS[environmentId] || SOMPO_AGRI_ENVIRONMENTS['row-crop-field'];
  const root = new THREE.Group();
  root.name = `sompo-agri-environment-${environmentId}`;
  const terrain = createTerrain(definition);
  root.add(terrain);
  const crops = definition.barn ? null : createSompoCropRows((x,z)=>terrainHeight(x,z,definition.slope), compact, equipmentId === 'tractor' ? .32 : 1);
  if (crops) root.add(crops.root);
  if (definition.barn) root.add(createBarn());

  const mud = new THREE.Mesh(
    new THREE.CircleGeometry(8, 40),
    new THREE.MeshStandardMaterial({ color: 0x807363, roughness: 0.66, metalness: 0 }),
  );
  mud.name = 'sompo-agri-mud';
  mud.geometry.rotateX(-Math.PI / 2);
  const mudPositions = mud.geometry.attributes.position;
  for (let i=1;i<mudPositions.count;i++) { const f=1+Math.sin(i*2.3)*.09; mudPositions.setX(i,mudPositions.getX(i)*f);mudPositions.setZ(i,mudPositions.getZ(i)*f*.65); }
  function placeMud(x: number) {
    mud.position.x=x;
    for(let i=0;i<mudPositions.count;i++) mudPositions.setY(i,terrainHeight(x+mudPositions.getX(i),mudPositions.getZ(i),definition.slope)+.025);
    mudPositions.needsUpdate=true;mud.geometry.computeVertexNormals();
  }
  placeMud(2);
  mud.visible = definition.mud > 0;
  mud.receiveShadow = true;
  root.add(mud);

  const dust = createDust();
  root.add(dust);
  const ambient = new THREE.HemisphereLight(definition.sky, 0x30291d, definition.night ? 0.32 : 0.7);
  const sun = new THREE.DirectionalLight(definition.night ? 0x91b4dd : 0xfff1cf, definition.night ? 0.6 : 2.1);
  sun.position.set(-24, 34, 18);
  sun.castShadow = true;
  root.add(ambient, sun, sun.target);
  parent.add(root);

  return {
    root, terrain, mud, sun, placeMud,
    setHarvestPath(points: readonly { x: number; z: number }[]) { crops?.setHarvestPath(points); },
    groundHeight(x: number, z: number) {
      return terrainHeight(x, z, definition.slope);
    },
    update(frame: SompoAgriVisualFrame, machinePosition = new THREE.Vector3(), cameraPosition = new THREE.Vector3(), reducedMotion = false, wind = 0.65, elapsedMs = frame.atMs) {
      crops?.update(elapsedMs, cameraPosition, reducedMotion, wind, machinePosition, frame.equipmentId === 'harvester' ? frame.cropCut : 0);
      dust.position.copy(machinePosition);
      dust.rotation.y = THREE.MathUtils.degToRad(frame.yaw);
      const material = dust.material as THREE.PointsMaterial;
      material.opacity = Math.min(0.32, Math.max(0, frame.dust) * 0.28);
      dust.visible = material.opacity > 0.01;

      if (reducedMotion) dust.visible = false;
      if (dust.visible && !reducedMotion) {
        const p = dust.geometry.attributes.position, alpha = dust.geometry.attributes.particleAlpha;
        for (let i = 0; i < p.count; i++) {
          const life = 1.4 + (i % 7) * .18;
          const age = ((elapsedMs / 1000) + i * .137) % life;
          const progress = age / life;
          p.setXYZ(i, -frame.direction * (.8 + age * (.65 + frame.speedKph / 3.6)),
            .12 + age * (.18 + (i % 5) * .045),
            Math.sin(i * 2.399963) * (.5 + age * .5) + age * wind * .25);
          alpha.setX(i, Math.sin(Math.PI * progress) * (.3 + (i % 3) * .2));
        }
        p.needsUpdate = alpha.needsUpdate = true;
      }

    },
    dispose() {
      root.removeFromParent();
      crops?.dispose();
      disposeSompoObject(root);
    },
  };
}
