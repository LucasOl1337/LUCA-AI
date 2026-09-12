import * as THREE from 'three';
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
  return (z * slope) + (Math.sin(x * 0.075) * 0.18) + (Math.cos(z * 0.11) * 0.1);
}

function createTerrain(environment: (typeof SOMPO_AGRI_ENVIRONMENTS)[SompoAgriEnvironmentId]) {
  const geometry = new THREE.PlaneGeometry(180, 120, 90, 60);
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
  const terrain = new THREE.Mesh(geometry, material);
  terrain.name = 'sompo-agri-terrain';
  terrain.receiveShadow = true;
  return terrain;
}

/** 480 deterministic crop clumps in rows, rendered in two draw calls. */
function createCropRows(environment: (typeof SOMPO_AGRI_ENVIRONMENTS)[SompoAgriEnvironmentId]) {
  const root = new THREE.Group();
  root.name = 'sompo-agri-crop-rows';
  const stemGeometry = new THREE.CylinderGeometry(0.018, 0.025, 1.15, 4);
  const crownGeometry = new THREE.ConeGeometry(0.09, 0.38, 5);
  const stemMaterial = new THREE.MeshStandardMaterial({ color: environment.crop, roughness: 0.95 });
  const crownMaterial = new THREE.MeshStandardMaterial({ color: environment.night ? 0x65522a : 0xb89437, roughness: 0.93 });
  const count = 480;
  const stems = new THREE.InstancedMesh(stemGeometry, stemMaterial, count);
  const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, count);
  const matrix = new THREE.Matrix4();
  let cursor = 0;
  for (let row = -6; row <= 5; row += 1) {
    const z = row * 3.1;
    for (let column = 0; column < 40; column += 1) {
      const x = -58 + (column * 3);
      const jitter = (((column * 17) + (row * 31)) % 11) * 0.025;
      const y = terrainHeight(x, z, environment.slope);
      matrix.makeTranslation(x + jitter, y + 0.575, z);
      stems.setMatrixAt(cursor, matrix);
      matrix.makeTranslation(x + jitter, y + 1.18, z);
      crowns.setMatrixAt(cursor, matrix);
      cursor += 1;
    }
  }
  stems.castShadow = stems.receiveShadow = true;
  crowns.castShadow = crowns.receiveShadow = true;
  root.add(stems, crowns);
  return root;
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

function createDust() {
  const count = 160;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const angle = index * 2.399963;
    const radius = 0.35 + ((index % 23) / 23) * 4.6;
    positions[index * 3] = -1 - radius;
    positions[(index * 3) + 1] = 0.2 + ((index * 19) % 31) / 19;
    positions[(index * 3) + 2] = Math.sin(angle) * radius * 0.55;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0xc6a369, size: 0.18, transparent: true, opacity: 0, depthWrite: false });
  const dust = new THREE.Points(geometry, material);
  dust.name = 'sompo-agri-dust';
  return dust;
}

export function createSompoAgriScene(parent: THREE.Group, environmentId: SompoAgriEnvironmentId) {
  const definition = SOMPO_AGRI_ENVIRONMENTS[environmentId] || SOMPO_AGRI_ENVIRONMENTS['row-crop-field'];
  const root = new THREE.Group();
  root.name = `sompo-agri-environment-${environmentId}`;
  const terrain = createTerrain(definition);
  root.add(terrain);
  if (!definition.barn) root.add(createCropRows(definition));
  if (definition.barn) root.add(createBarn());

  const mud = new THREE.Mesh(
    new THREE.CircleGeometry(8, 40),
    new THREE.MeshStandardMaterial({ color: 0x30251d, roughness: 0.58, metalness: 0.04 }),
  );
  mud.rotation.x = -Math.PI / 2;
  mud.position.set(2, 0.04, 0);
  mud.visible = definition.mud > 0;
  mud.receiveShadow = true;
  root.add(mud);

  const dust = createDust();
  root.add(dust);
  const ambient = new THREE.HemisphereLight(definition.sky, 0x30291d, definition.night ? 0.2 : 1.35);
  const sun = new THREE.DirectionalLight(definition.night ? 0x91b4dd : 0xfff1cf, definition.night ? 0.35 : 2.8);
  sun.position.set(-24, 34, 18);
  sun.castShadow = true;
  root.add(ambient, sun);
  parent.add(root);

  return {
    root,
    groundHeight(x: number, z: number) {
      return terrainHeight(x, z, definition.slope);
    },
    update(frame: SompoAgriVisualFrame) {
      const material = dust.material as THREE.PointsMaterial;
      material.opacity = Math.min(0.72, Math.max(0, frame.dust) * 0.64);
      dust.visible = material.opacity > 0.01;
      dust.rotation.y = frame.atMs * 0.00008;
      dust.scale.setScalar(0.8 + (frame.dust * 0.65));
      mud.scale.setScalar(0.85 + (frame.sink * 0.6));
    },
    dispose() {
      root.removeFromParent();
      root.traverse((node) => {
        const mesh = node as THREE.Mesh;
        mesh.geometry?.dispose();
        if (mesh.material) {
          for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
        }
      });
    },
  };
}

