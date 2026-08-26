import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const SOMPO_TRUCK_FRONT_X = 4.62;
export const SOMPO_TRUCK_PIVOT_Y = 1.92;
export const SOMPO_TRUCK_HALF_SIZE = new THREE.Vector3(4.48, 1.92, 1.38);

interface SompoTruckModelOptions {
  sensorLabel: string;
}

export interface SompoTruckModel {
  root: THREE.Group;
  wheels: THREE.Mesh[];
  sensorGroup: THREE.Group;
  ledMaterial: THREE.MeshStandardMaterial;
  rayGroup: THREE.Group;
  rayMaterial: THREE.LineBasicMaterial;
}

function addPart(
  parent: THREE.Object3D,
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: [number, number, number],
) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.userData.partId = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addBox(
  parent: THREE.Object3D,
  name: string,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
  radius = 0,
) {
  const geometry = radius > 0
    ? new RoundedBoxGeometry(size[0], size[1], size[2], 3, radius)
    : new THREE.BoxGeometry(...size);
  return addPart(parent, name, geometry, material, position);
}

function createLabelTexture(label: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = 'rgba(4, 12, 16, 0.92)';
    context.fillRect(8, 8, 496, 112);
    context.strokeStyle = '#5fd0ff';
    context.lineWidth = 5;
    context.strokeRect(8, 8, 496, 112);
    context.fillStyle = '#dff7ff';
    context.font = '700 42px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, 256, 65);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeCabGeometry() {
  const profile = new THREE.Shape();
  profile.moveTo(1.38, 0.82);
  profile.lineTo(4.16, 0.82);
  profile.quadraticCurveTo(4.38, 1.04, 4.32, 1.48);
  profile.lineTo(4.20, 2.52);
  profile.quadraticCurveTo(4.03, 3.05, 3.68, 3.48);
  profile.quadraticCurveTo(3.42, 3.74, 2.98, 3.76);
  profile.lineTo(2.20, 3.76);
  profile.quadraticCurveTo(1.74, 3.62, 1.45, 3.28);
  profile.closePath();
  const geometry = new THREE.ExtrudeGeometry(profile, {
    depth: 2.16,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.06,
    bevelThickness: 0.06,
    curveSegments: 8,
  });
  geometry.translate(0, 0, -1.08);
  geometry.computeVertexNormals();
  return geometry;
}

function makeSideWindowGeometry() {
  const window = new THREE.Shape();
  window.moveTo(2.22, 2.22);
  window.lineTo(3.42, 2.22);
  window.lineTo(3.82, 3.02);
  window.quadraticCurveTo(3.68, 3.30, 3.38, 3.36);
  window.lineTo(2.52, 3.34);
  window.lineTo(2.18, 3.05);
  window.closePath();
  return new THREE.ShapeGeometry(window, 8);
}

function registerPart(nodes: Record<string, THREE.Object3D>, object: THREE.Object3D, name: string) {
  object.name = name;
  object.userData.partId = name;
  nodes[name] = object;
}

/**
 * Procedural digital twin of the physical SOMPO truck.
 * Coordinates follow the telemetry scene: the truck faces +X and rests on Y=0.
 */
export function createSompoTruckModel({ sensorLabel }: SompoTruckModelOptions): SompoTruckModel {
  const root = new THREE.Group();
  const nodes: Record<string, THREE.Object3D> = {};
  registerPart(nodes, root, 'sompo-truck');

  const paintedBlue = new THREE.MeshPhysicalMaterial({
    color: 0x087fc2,
    roughness: 0.26,
    metalness: 0.08,
    clearcoat: 0.78,
    clearcoatRoughness: 0.18,
  });
  const paintedBlueDark = new THREE.MeshPhysicalMaterial({
    color: 0x075a91,
    roughness: 0.34,
    metalness: 0.12,
    clearcoat: 0.48,
  });
  const corrugatedBlue = new THREE.MeshStandardMaterial({
    color: 0x3b9bc5,
    roughness: 0.36,
    metalness: 0.56,
  });
  const corrugationHighlight = new THREE.MeshStandardMaterial({
    color: 0x9bc8d7,
    roughness: 0.3,
    metalness: 0.72,
  });
  const chassisMaterial = new THREE.MeshStandardMaterial({ color: 0x0a1115, roughness: 0.72, metalness: 0.35 });
  const blackPlastic = new THREE.MeshPhysicalMaterial({ color: 0x070b10, roughness: 0.27, clearcoat: 0.35 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x07151f,
    roughness: 0.08,
    metalness: 0.08,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
  });
  const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x050707, roughness: 0.92 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd4e1e5, roughness: 0.18, metalness: 0.94 });
  const lamp = new THREE.MeshPhysicalMaterial({ color: 0xe9f5ff, roughness: 0.12, metalness: 0.22, clearcoat: 0.9 });
  const boardMaterial = new THREE.MeshStandardMaterial({ color: 0x146cb7, roughness: 0.5, metalness: 0.18 });

  const chassis = new THREE.Group();
  registerPart(nodes, chassis, 'chassis-assembly');
  root.add(chassis);
  addBox(chassis, 'chassis-frame', [8.25, 0.34, 2.18], [-0.05, 0.91, 0], chassisMaterial, 0.08);
  addBox(chassis, 'left-side-rail', [4.7, 0.25, 0.16], [-0.65, 0.72, 1.26], chrome, 0.05);
  addBox(chassis, 'right-side-rail', [4.7, 0.25, 0.16], [-0.65, 0.72, -1.26], chrome, 0.05);
  for (const z of [-1.27, 1.27]) {
    for (const x of [-1.65, -0.6, 0.45]) {
      addBox(chassis, `side-step-${z}-${x}`, [0.72, 0.08, 0.12], [x, 0.52, z], chrome, 0.025);
    }
  }

  const cargo = new THREE.Group();
  registerPart(nodes, cargo, 'cargo-assembly');
  root.add(cargo);
  addBox(cargo, 'cargo-body', [5.78, 2.7, 2.32], [-1.42, 2.45, 0], corrugatedBlue, 0.07);
  addBox(cargo, 'cargo-roof', [5.94, 0.12, 2.44], [-1.42, 3.84, 0], paintedBlue, 0.04);
  addBox(cargo, 'cargo-front-cap', [0.14, 2.62, 2.38], [1.48, 2.43, 0], paintedBlueDark, 0.03);
  addBox(cargo, 'cargo-rear-cap', [0.14, 2.62, 2.38], [-4.34, 2.43, 0], paintedBlueDark, 0.03);

  const horizontalRibGeometry = new THREE.BoxGeometry(5.64, 0.025, 0.045);
  const horizontalRibs = new THREE.InstancedMesh(horizontalRibGeometry, corrugationHighlight, 40);
  registerPart(nodes, horizontalRibs, 'cargo-horizontal-corrugation');
  horizontalRibs.userData.explodeWithParent = true;
  const ribMatrix = new THREE.Matrix4();
  let ribIndex = 0;
  for (const z of [-1.175, 1.175]) {
    for (let row = 0; row < 20; row += 1) {
      ribMatrix.makeTranslation(-1.42, 1.22 + (row * 0.126), z);
      horizontalRibs.setMatrixAt(ribIndex, ribMatrix);
      ribIndex += 1;
    }
  }
  horizontalRibs.castShadow = true;
  cargo.add(horizontalRibs);

  const seamGeometry = new THREE.BoxGeometry(0.035, 2.5, 0.05);
  const seams = new THREE.InstancedMesh(seamGeometry, paintedBlueDark, 12);
  registerPart(nodes, seams, 'cargo-vertical-seams');
  seams.userData.explodeWithParent = true;
  let seamIndex = 0;
  for (const z of [-1.19, 1.19]) {
    for (let column = 0; column < 6; column += 1) {
      ribMatrix.makeTranslation(-3.78 + (column * 0.94), 2.45, z);
      seams.setMatrixAt(seamIndex, ribMatrix);
      seamIndex += 1;
    }
  }
  cargo.add(seams);

  const cab = new THREE.Group();
  registerPart(nodes, cab, 'cab-assembly');
  root.add(cab);
  addPart(cab, 'cab-shell', makeCabGeometry(), paintedBlue, [0, 0, 0]);
  addBox(cab, 'front-bumper', [0.25, 0.28, 2.34], [4.30, 0.96, 0], blackPlastic, 0.08);
  addBox(cab, 'front-grille', [0.09, 0.76, 1.66], [4.34, 1.42, 0], blackPlastic, 0.05);
  const windshield = addBox(cab, 'front-windshield', [0.07, 1.03, 1.79], [4.11, 2.75, 0], glass, 0.03);
  windshield.rotation.z = -0.31;
  for (const z of [-1.091, 1.091]) {
    const sideWindow = addPart(cab, `side-window-${z}`, makeSideWindowGeometry(), glass, [0, 0, z]);
    if (z < 0) sideWindow.rotation.y = Math.PI;
    addBox(cab, `mirror-arm-${z}`, [0.11, 0.11, 0.34], [3.77, 2.65, z * 1.08], blackPlastic, 0.035);
    addBox(cab, `mirror-${z}`, [0.22, 0.46, 0.16], [3.77, 2.64, z * 1.18], blackPlastic, 0.06);
    addBox(cab, `headlight-${z}`, [0.10, 0.23, 0.52], [4.37, 1.22, z * 0.66], lamp, 0.04);
  }
  addBox(cab, 'cab-roof-window', [0.78, 0.035, 0.94], [3.12, 3.79, 0], glass, 0.07);
  addBox(cab, 'lower-air-intake', [0.10, 0.24, 1.08], [4.39, 0.99, 0], blackPlastic, 0.05);

  const wheelsGroup = new THREE.Group();
  registerPart(nodes, wheelsGroup, 'wheel-system');
  root.add(wheelsGroup);
  const wheels: THREE.Mesh[] = [];
  const axlePositions = [3.17, 0.38, -2.64, -3.48];
  for (const [axleIndex, x] of axlePositions.entries()) {
    for (const z of [-1.21, 1.21]) {
      const tire = addPart(
        wheelsGroup,
        `tire-${axleIndex}-${z > 0 ? 'left' : 'right'}`,
        new THREE.CylinderGeometry(0.52, 0.52, 0.38, 28),
        tireMaterial,
        [x, 0.61, z],
      );
      tire.rotation.x = Math.PI / 2;
      wheels.push(tire);
      const wheelHub = addPart(
        wheelsGroup,
        `hub-${axleIndex}-${z > 0 ? 'left' : 'right'}`,
        new THREE.CylinderGeometry(0.25, 0.25, 0.405, 24),
        chrome,
        [x, 0.61, z],
      );
      wheelHub.rotation.x = Math.PI / 2;
    }
  }

  const sensorGroup = new THREE.Group();
  registerPart(nodes, sensorGroup, 'ultrasonic-sensor-assembly');
  sensorGroup.position.set(4.48, 1.68, 0);
  root.add(sensorGroup);
  addBox(sensorGroup, 'sensor-board', [0.12, 0.55, 1.08], [0, 0, 0], boardMaterial, 0.035);
  for (const z of [-0.30, 0.30]) {
    const transducer = addPart(
      sensorGroup,
      `ultrasonic-transducer-${z > 0 ? 'left' : 'right'}`,
      new THREE.CylinderGeometry(0.19, 0.19, 0.22, 28),
      chrome,
      [0.14, 0, z],
    );
    transducer.rotation.z = -Math.PI / 2;
    const aperture = addPart(
      sensorGroup,
      `ultrasonic-aperture-${z > 0 ? 'left' : 'right'}`,
      new THREE.CircleGeometry(0.135, 24),
      blackPlastic,
      [0.265, 0, z],
    );
    aperture.rotation.y = Math.PI / 2;
  }
  const ledMaterial = new THREE.MeshStandardMaterial({
    color: 0x7dff9a,
    emissive: 0x2dff6b,
    emissiveIntensity: 3,
    roughness: 0.2,
  });
  addPart(sensorGroup, 'sensor-led', new THREE.SphereGeometry(0.055, 14, 10), ledMaterial, [0.10, 0.17, 0]);
  const labelTexture = createLabelTexture(sensorLabel);
  const labelSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture, transparent: true }));
  labelSprite.name = 'sensor-label';
  labelSprite.scale.set(2.25, 0.56, 1);
  labelSprite.position.set(-0.4, 1.05, 0);
  sensorGroup.add(labelSprite);

  const rayMaterial = new THREE.LineBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: 0.78 });
  const rayGroup = new THREE.Group();
  registerPart(nodes, rayGroup, 'ultrasonic-range');
  rayGroup.position.set(SOMPO_TRUCK_FRONT_X, 1.68, 0);
  root.add(rayGroup);
  for (const z of [-0.30, 0.30]) {
    const ray = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, z),
        new THREE.Vector3(1, 0, z * 1.5),
      ]),
      rayMaterial,
    );
    ray.name = `ultrasonic-ray-${z > 0 ? 'left' : 'right'}`;
    rayGroup.add(ray);
  }

  root.userData.sculptRuntime = {
    nodes,
    sockets: {
      sensorOrigin: rayGroup,
      cargoMount: cargo,
    },
    colliders: [
      { id: 'cab', type: 'box', center: [2.9, 2.25, 0], size: [2.9, 3.0, 2.25] },
      { id: 'cargo', type: 'box', center: [-1.42, 2.45, 0], size: [5.78, 2.7, 2.32] },
    ],
    destructionGroups: {
      body: ['cab-assembly', 'cargo-assembly'],
      runningGear: ['chassis-assembly', 'wheel-system'],
      telemetry: ['ultrasonic-sensor-assembly'],
    },
  };

  return { root, wheels, sensorGroup, ledMaterial, rayGroup, rayMaterial };
}
