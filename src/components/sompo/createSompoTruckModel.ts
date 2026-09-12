import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Physical envelope stays compatible with ground clearance and the distance beam.
// Labels/rays are annotations; the sensor apertures sit exactly at FRONT_X.
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
  // A CPU-backed canvas also uploads text/strokes reliably with Chromium's Vulkan backend.
  const context = canvas.getContext('2d', { willReadFrequently: true });
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
  profile.moveTo(1.55, 1.04);
  profile.lineTo(2.41, 1.04);
  // Open wheel arch: the tire is not buried in a solid cab block.
  profile.bezierCurveTo(2.44, 1.63, 3.84, 1.63, 3.87, 1.04);
  profile.lineTo(4.24, 1.04);
  profile.quadraticCurveTo(4.35, 1.12, 4.32, 1.48);
  profile.lineTo(4.20, 2.46);
  profile.lineTo(3.72, 3.38);
  profile.quadraticCurveTo(3.55, 3.64, 3.20, 3.65);
  profile.lineTo(1.84, 3.65);
  profile.quadraticCurveTo(1.55, 3.57, 1.55, 3.30);
  profile.closePath();
  const geometry = new THREE.ExtrudeGeometry(profile, {
    depth: 2.10, bevelEnabled: true, bevelSegments: 3,
    bevelSize: 0.045, bevelThickness: 0.045, curveSegments: 12,
  });
  geometry.translate(0, 0, -1.05);
  return geometry;
}

function makeSideWindowGeometry() {
  const window = new THREE.Shape();
  window.moveTo(2.05, 2.35);
  window.lineTo(3.98, 2.35);
  window.lineTo(3.52, 3.29);
  window.quadraticCurveTo(3.44, 3.39, 3.25, 3.39);
  window.lineTo(2.05, 3.39);
  window.closePath();
  return new THREE.ShapeGeometry(window, 12);
}

function createSurfaceTexture(kind: 'rubber' | 'metal' | 'branding') {
  const canvas = document.createElement('canvas');
  canvas.width = kind === 'branding' ? 1024 : 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (context) {
    if (kind === 'branding') {
      context.fillStyle = '#e9f6fb';
      context.fillRect(0, 0, 1024, 256);
      context.fillStyle = '#067eb3';
      context.fillRect(0, 0, 22, 256);
      context.fillStyle = '#123d59';
      context.font = '800 104px system-ui, sans-serif';
      context.fillText('SOMPO', 64, 126);
      context.font = '600 30px system-ui, sans-serif';
      context.fillText('TELEMETRIA RURAL  /  SIM-001', 68, 190);
      context.fillStyle = '#40b5d6';
      for (let i = 0; i < 4; i += 1) context.fillRect(800 + i * 42, 54, 20, 148 - i * 28);
    } else {
      context.fillStyle = kind === 'rubber' ? '#777777' : '#b9b9b9';
      context.fillRect(0, 0, 256, 256);
      // Deterministic grain; no random texture changes on remount.
      for (let y = 0; y < 256; y += 2) {
        for (let x = 0; x < 256; x += 2) {
          const grain = (x * 17 + y * 31 + x * y) % 29;
          context.fillStyle = `rgba(255,255,255,${grain / 180})`;
          context.fillRect(x, y, kind === 'metal' ? 8 : 2, 1);
        }
      }
      if (kind === 'rubber') {
        context.strokeStyle = '#353535';
        context.lineWidth = 5;
        for (let x = 0; x <= 256; x += 32) {
          context.beginPath();
          context.moveTo(x, 0);
          context.lineTo(x + 16, 128);
          context.lineTo(x, 256);
          context.stroke();
        }
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  if (kind === 'branding') texture.colorSpace = THREE.SRGBColorSpace;
  else {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(kind === 'rubber' ? 4 : 3, 1);
  }
  texture.anisotropy = 4;
  return texture;
}

function addRod(
  parent: THREE.Object3D, name: string,
  start: [number, number, number], end: [number, number, number],
  radius: number, material: THREE.Material,
) {
  const from = new THREE.Vector3(...start);
  const to = new THREE.Vector3(...end);
  const direction = to.clone().sub(from);
  const rod = addPart(parent, name, new THREE.CylinderGeometry(radius, radius, direction.length(), 12), material,
    from.add(to).multiplyScalar(0.5).toArray() as [number, number, number]);
  rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return rod;
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
    metalness: 0.42,
    clearcoat: 0.88,
    clearcoatRoughness: 0.18,
    envMapIntensity: 1.4,
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
    bumpMap: createSurfaceTexture('metal'),
    bumpScale: 0.012,
  });
  const corrugationHighlight = new THREE.MeshStandardMaterial({
    color: 0x9bc8d7,
    roughness: 0.3,
    metalness: 0.72,
  });
  const chassisMaterial = new THREE.MeshStandardMaterial({ color: 0x0a1115, roughness: 0.72, metalness: 0.35 });
  const blackPlastic = new THREE.MeshPhysicalMaterial({ color: 0x070b10, roughness: 0.27, clearcoat: 0.35 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x20465b,
    roughness: 0.08,
    metalness: 0.08,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    side: THREE.DoubleSide,
    envMapIntensity: 1.5,
  });
  const tireMaterial = new THREE.MeshStandardMaterial({
    color: 0x171c20, roughness: 0.94, bumpMap: createSurfaceTexture('rubber'), bumpScale: 0.028,
  });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd4e1e5, roughness: 0.18, metalness: 0.94 });
  const lamp = new THREE.MeshPhysicalMaterial({ color: 0xe9f5ff, emissive: 0xb5dcff, emissiveIntensity: 0.7, roughness: 0.12, clearcoat: 0.9 });
  const amber = new THREE.MeshStandardMaterial({ color: 0xffa52b, emissive: 0xff8008, emissiveIntensity: 0.6, roughness: 0.28 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc82730, emissive: 0xff182a, emissiveIntensity: 0.4, roughness: 0.3 });
  const decal = new THREE.MeshStandardMaterial({ map: createSurfaceTexture('branding'), roughness: 0.5 });
  const boardMaterial = new THREE.MeshStandardMaterial({ color: 0x146cb7, roughness: 0.5, metalness: 0.18 });
  const refrigHousing = new THREE.MeshStandardMaterial({ color: 0xe4e7e4, roughness: 0.42, metalness: 0.14 });
  const refrigVent = new THREE.MeshStandardMaterial({ color: 0x22282a, roughness: 0.7, metalness: 0.3 });

  const chassis = new THREE.Group();
  registerPart(nodes, chassis, 'chassis-assembly');
  root.add(chassis);
  for (const z of [-0.72, 0.72]) {
    addBox(chassis, `chassis-rail-${z}`, [8.30, 0.26, 0.18], [-0.07, 0.98, z], chassisMaterial, 0.025);
  }
  for (const x of [-3.7, -2.6, -1.4, 0, 1.4, 2.7, 3.8]) {
    addBox(chassis, `crossmember-${x}`, [0.14, 0.18, 1.48], [x, 0.98, 0], chassisMaterial);
  }
  addRod(chassis, 'driveshaft', [2.1, 0.72, 0], [-3.53, 0.72, 0], 0.07, chassisMaterial);
  for (const z of [-1.16, 1.16]) {
    const side = Math.sign(z);
    addBox(chassis, `fuel-tank-${z}`, [1.38, 0.57, 0.38], [0.56, 0.73, z * 0.78], chrome, 0.12);
    for (const x of [0.12, 1]) {
      addBox(chassis, `tank-strap-${z}-${x}`, [0.065, 0.59, 0.40], [x, 0.73, z * 0.78], chassisMaterial, 0.03);
    }
    for (const y of [0.53, 0.79]) {
      addBox(chassis, `side-guard-${z}-${y}`, [2.72, 0.09, 0.09], [-0.24, y, z], chrome, 0.025);
    }
    for (const x of [-1.4, 1]) {
      addBox(chassis, `guard-bracket-${z}-${x}`, [0.09, 0.56, 0.09], [x, 0.81, z], chassisMaterial);
    }
    for (const [i, y] of [0.51, 0.77, 1.03].entries()) {
      addBox(chassis, `cab-step-${z}-${i}`, [0.65, 0.08, 0.25], [1.94, y, side * (1.18 - i * 0.045)], chrome, 0.02);
      for (let groove = 0; groove < 5; groove += 1) {
        addBox(chassis, `step-grip-${z}-${i}-${groove}`, [0.025, 0.012, 0.20], [1.70 + groove * 0.12, y + 0.045, side * (1.18 - i * 0.045)], blackPlastic);
      }
    }
    addBox(chassis, `rear-mudflap-${z}`, [0.055, 0.49, 0.53], [-4.17, 0.45, side * 1.05], tireMaterial);
  }
  addBox(chassis, 'rear-underrun-bumper', [0.16, 0.20, 2.40], [-4.35, 0.58, 0], chrome, 0.035);
  for (const z of [-0.87, 0.87]) {
    addBox(chassis, `rear-light-housing-${z}`, [0.14, 0.23, 0.52], [-4.35, 1.08, z], blackPlastic, 0.025);
    addBox(chassis, `rear-brake-light-${z}`, [0.02, 0.15, 0.28], [-4.43, 1.08, z], red, 0.015);
    addBox(chassis, `rear-indicator-${z}`, [0.02, 0.15, 0.13], [-4.43, 1.08, z + Math.sign(z) * 0.2], amber, 0.015);
  }
  addRod(chassis, 'exhaust-riser', [1.55, 0.62, -0.83], [1.55, 2.97, -0.83], 0.075, chrome);
  addRod(chassis, 'exhaust-outlet', [1.55, 2.97, -0.83], [1.33, 3.12, -0.83], 0.075, chassisMaterial);
  addRod(chassis, 'exhaust-heat-shield', [1.55, 1.22, -0.83], [1.55, 2.47, -0.83], 0.12, chrome);

  const cargo = new THREE.Group();
  registerPart(nodes, cargo, 'cargo-assembly');
  root.add(cargo);
  addBox(cargo, 'cargo-body', [5.78, 2.48, 2.32], [-1.42, 2.52, 0], corrugatedBlue, 0.07);
  addBox(cargo, 'cargo-roof', [5.94, 0.12, 2.44], [-1.42, 3.78, 0], paintedBlue, 0.04);
  addBox(cargo, 'cargo-front-cap', [0.12, 2.46, 2.38], [1.48, 2.52, 0], paintedBlueDark, 0.03);
  addBox(cargo, 'cargo-rear-cap', [0.12, 2.46, 2.38], [-4.34, 2.52, 0], paintedBlueDark, 0.03);

  const horizontalRibGeometry = new THREE.BoxGeometry(5.64, 0.025, 0.045);
  const horizontalRibs = new THREE.InstancedMesh(horizontalRibGeometry, corrugationHighlight, 40);
  registerPart(nodes, horizontalRibs, 'cargo-horizontal-corrugation');
  horizontalRibs.userData.explodeWithParent = true;
  const ribMatrix = new THREE.Matrix4();
  let ribIndex = 0;
  for (const z of [-1.175, 1.175]) {
    for (let row = 0; row < 20; row += 1) {
      ribMatrix.makeTranslation(-1.42, 1.38 + (row * 0.12), z);
      horizontalRibs.setMatrixAt(ribIndex, ribMatrix);
      ribIndex += 1;
    }
  }
  horizontalRibs.castShadow = true;
  cargo.add(horizontalRibs);

  const seamGeometry = new THREE.BoxGeometry(0.035, 2.36, 0.05);
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

  for (const side of [-1, 1]) {
    for (const y of [1.28, 3.71]) {
      addBox(cargo, `cargo-edge-${side}-${y}`, [5.86, 0.075, 0.07], [-1.42, y, side * 1.19], chrome, 0.012);
    }
    const branding = addPart(cargo, `cargo-decal-${side}`, new THREE.PlaneGeometry(3.0, 0.75), decal, [-1.24, 2.56, side * 1.221]);
    if (side < 0) branding.rotation.y = Math.PI;
    // Faixa refletiva contínua na base do baú — alternância vermelho/branco.
    for (let i = 0; i < 10; i += 1) {
      addBox(cargo, `reflector-${side}-${i}`, [0.56, 0.055, 0.014], [-3.95 + i * 0.55, 1.43, side * 1.22], i % 2 ? red : lamp);
    }
    // Porta lateral do baú: painel levemente ressaltado + ombreiras, fecho
    // vertical e trinco — o vinco que a referência mostra na lateral.
    addBox(cargo, `side-door-panel-${side}`, [1.12, 2.18, 0.035], [-0.42, 2.5, side * 1.195], corrugatedBlue, 0.012);
    for (const y of [1.72, 2.5, 3.28]) {
      addBox(cargo, `side-door-hinge-${side}-${y}`, [0.05, 0.16, 0.045], [-1.0, y, side * 1.215], chrome, 0.008);
    }
    addRod(cargo, `side-door-lock-${side}`, [0.16, 1.55, side * 1.215], [0.16, 3.52, side * 1.215], 0.016, chrome);
    addBox(cargo, `side-door-latch-${side}`, [0.26, 0.09, 0.05], [0.02, 2.32, side * 1.215], chrome, 0.01);
    addBox(cargo, `side-door-seal-${side}`, [1.18, 0.045, 0.02], [-0.42, 3.62, side * 1.2], blackPlastic, 0.008);
    for (const x of [-4.1, -1.4, 1.27]) {
      addBox(cargo, `marker-lamp-${side}-${x}`, [0.14, 0.07, 0.035], [x, 1.60, side * 1.21], amber, 0.015);
    }
    addBox(cargo, `rear-door-${side}`, [0.035, 2.23, 1.08], [-4.415, 2.53, side * 0.565], corrugatedBlue, 0.015);
    addRod(cargo, `door-lock-${side}`, [-4.46, 1.51, side * 0.43], [-4.46, 3.53, side * 0.43], 0.018, chrome);
    for (const y of [1.65, 2.48, 3.35]) {
      addBox(cargo, `door-hinge-${side}-${y}`, [0.03, 0.10, 0.20], [-4.455, y, side * 1.03], chrome, 0.01);
    }
    addBox(cargo, `door-latch-${side}`, [0.03, 0.04, 0.29], [-4.475, 2.25, side * 0.53], chrome);
  }

  const cab = new THREE.Group();
  registerPart(nodes, cab, 'cab-assembly');
  root.add(cab);
  addPart(cab, 'cab-shell', makeCabGeometry(), paintedBlue, [0, 0, 0]);
  addBox(cab, 'front-bumper', [0.26, 0.28, 2.34], [4.34, 0.98, 0], paintedBlueDark, 0.055);
  addBox(cab, 'bumper-trim', [0.03, 0.045, 2.18], [4.48, 0.89, 0], chrome, 0.01);
  addBox(cab, 'front-grille', [0.08, 0.61, 1.48], [4.35, 1.79, 0], blackPlastic, 0.04);
  for (let row = 0; row < 6; row += 1) {
    addBox(cab, `grille-slat-${row}`, [0.022, 0.025, 1.36], [4.399, 1.56 + row * 0.09, 0], chrome, 0.006);
  }
  const windshieldTrim = addBox(cab, 'windshield-seal', [0.055, 1.12, 1.98], [3.998, 2.92, 0], blackPlastic, 0.04);
  windshieldTrim.rotation.z = 0.48;
  const windshield = addBox(cab, 'front-windshield', [0.035, 1.02, 1.85], [4.032, 2.94, 0], glass, 0.025);
  windshield.rotation.z = 0.48;
  for (const side of [-1, 1]) {
    const z = side * 1.10;
    // Double-sided plane stays at the same X on both sides of the truck.
    addPart(cab, `side-window-${side}`, makeSideWindowGeometry(), glass, [0, 0, z]);
    addBox(cab, `window-pillar-${side}`, [0.065, 1.09, 0.025], [2.58, 2.88, z * 1.008], blackPlastic);
    addBox(cab, `window-sill-${side}`, [1.96, 0.055, 0.035], [3, 2.32, z], paintedBlueDark, 0.012);
    addBox(cab, `door-seam-${side}`, [0.025, 2.15, 0.018], [1.98, 2.26, z], paintedBlueDark);
    addBox(cab, `door-handle-${side}`, [0.31, 0.075, 0.055], [2.19, 2.12, z], blackPlastic, 0.025);
    addRod(cab, `entry-handrail-${side}`, [1.72, 1.24, z], [1.72, 2.32, z], 0.023, chrome);
    addRod(cab, `mirror-arm-${side}`, [3.78, 2.61, side * 1.06], [3.87, 2.75, side * 1.28], 0.035, chassisMaterial);
    addBox(cab, `mirror-housing-${side}`, [0.19, 0.43, 0.15], [3.87, 2.78, side * 1.29], blackPlastic, 0.05);
    addBox(cab, `mirror-glass-${side}`, [0.018, 0.34, 0.11], [3.767, 2.78, side * 1.29], chrome, 0.012);
    addBox(cab, `headlight-housing-${side}`, [0.10, 0.30, 0.56], [4.35, 1.29, side * 0.83], blackPlastic, 0.035);
    for (const lampZ of [0.70, 0.91]) {
      const light = addPart(cab, `headlight-projector-${side}-${lampZ}`, new THREE.CylinderGeometry(0.08, 0.08, 0.025, 16), lamp, [4.408, 1.30, side * lampZ]);
      light.rotation.z = Math.PI / 2;
    }
    addBox(cab, `daytime-led-${side}`, [0.02, 0.035, 0.43], [4.412, 1.19, side * 0.83], lamp, 0.009);
    addBox(cab, `front-indicator-${side}`, [0.06, 0.10, 0.15], [4.33, 1.49, side * 1.01], amber, 0.02);
    addRod(cab, `wiper-${side}`, [4.28, 2.46, side * 0.43], [4.12, 2.76, side * 0.71], 0.016, chassisMaterial);
    addBox(cab, `roof-marker-${side}`, [0.18, 0.06, 0.11], [3.42, 3.66, side * 0.77], amber, 0.015);
  }
  addBox(cab, 'cab-roof-hatch', [0.72, 0.05, 0.88], [2.65, 3.68, 0], paintedBlueDark, 0.035);
  addBox(cab, 'lower-air-intake', [0.035, 0.17, 0.92], [4.483, 0.99, 0], blackPlastic, 0.025);

  // Unidade de refrigeração no topo da face dianteira do baú — silhueta
  // assinatura do caminhão frigorífico da referência.
  const refrig = new THREE.Group();
  registerPart(nodes, refrig, 'refrigeration-unit');
  refrig.position.set(1.62, 3.45, 0);
  cargo.add(refrig);
  addBox(refrig, 'refrig-housing', [0.5, 0.72, 1.9], [0, 0, 0], refrigHousing, 0.05);
  addBox(refrig, 'refrig-vent', [0.03, 0.62, 1.5], [0.26, -0.02, 0], refrigVent, 0.015);
  for (let row = 0; row < 7; row += 1) {
    addBox(refrig, `refrig-slat-${row}`, [0.025, 0.035, 1.44], [0.285, -0.28 + row * 0.09, 0], chrome, 0.004);
  }
  const fan = addPart(refrig, 'refrig-fan', new THREE.CylinderGeometry(0.16, 0.16, 0.03, 20), refrigVent, [0.285, 0.18, 0.62]);
  fan.rotation.z = Math.PI / 2;
  addPart(refrig, 'refrig-fan-hub', new THREE.CylinderGeometry(0.05, 0.05, 0.045, 12), chrome, [0.3, 0.18, 0.62]).rotation.z = Math.PI / 2;

  const wheelsGroup = new THREE.Group();
  registerPart(nodes, wheelsGroup, 'wheel-system');
  root.add(wheelsGroup);
  const wheels: THREE.Mesh[] = [];
  const axlePositions = [3.14, -2.27, -3.53];
  const treadGeometry = new THREE.BoxGeometry(0.078, 0.12, 0.035);
  const lugGeometry = new THREE.CylinderGeometry(0.026, 0.026, 0.035, 6);
  for (const [axleIndex, x] of axlePositions.entries()) {
    addRod(chassis, `axle-${axleIndex}`, [x, 0.6, -1.22], [x, 0.6, 1.22], 0.10, chassisMaterial);
    addPart(chassis, `differential-${axleIndex}`, new THREE.SphereGeometry(0.22, 16, 12), chassisMaterial, [x, 0.60, 0]);
    for (const side of [-1, 1]) {
      addBox(chassis, `leaf-spring-${axleIndex}-${side}`, [0.85, 0.07, 0.13], [x, 0.78, side * 0.70], chassisMaterial, 0.025);
      addRod(chassis, `shock-${axleIndex}-${side}`, [x - 0.17, 0.64, side * 0.75], [x + 0.17, 1.1, side * 0.75], 0.043, chrome);
      const width = axleIndex === 0 ? 0.40 : 0.31;
      const positions = axleIndex === 0 ? [1.10] : [0.80, 1.145];
      for (const [tireIndex, lateral] of positions.entries()) {
        const name = `${axleIndex}-${side}-${tireIndex}`;
        const tire = addPart(wheelsGroup, `tire-${name}`, new THREE.CylinderGeometry(0.58, 0.58, width, 40), tireMaterial, [x, 0.60, side * lateral]);
        tire.rotation.x = Math.PI / 2;
        wheels.push(tire);
        // Every rim, lug and tread is a child: wheels[] still exposes spinning Meshes.
        const tread = new THREE.InstancedMesh(treadGeometry, tireMaterial, 96);
        tread.name = `tread-${name}`;
        const transform = new THREE.Object3D();
        for (let index = 0; index < 96; index += 1) {
          const row = index % 3;
          const angle = (Math.floor(index / 3) + (row % 2) * 0.5) * Math.PI * 2 / 32;
          transform.position.set(Math.sin(angle) * 0.588, (row - 1) * width * 0.29, Math.cos(angle) * 0.588);
          transform.rotation.set(0, angle, row === 1 ? 0.18 : -0.18);
          transform.updateMatrix();
          tread.setMatrixAt(index, transform.matrix);
        }
        tread.castShadow = true;
        tire.add(tread);
        for (const face of [-1, 1]) {
          const ring = addPart(tire, `sidewall-${name}-${face}`, new THREE.TorusGeometry(0.455, 0.035, 8, 40), tireMaterial, [0, face * width / 2, 0]);
          ring.rotation.x = Math.PI / 2;
          addPart(tire, `rim-${name}-${face}`, new THREE.CylinderGeometry(0.33, 0.33, 0.025, 32), chrome, [0, face * (width / 2 + 0.008), 0]);
          addPart(tire, `rim-recess-${name}-${face}`, new THREE.CylinderGeometry(0.26, 0.26, 0.028, 32), chassisMaterial, [0, face * (width / 2 + 0.025), 0]);
          addPart(tire, `hub-${name}-${face}`, new THREE.CylinderGeometry(0.15, 0.18, 0.07, 24), chrome, [0, face * (width / 2 + 0.04), 0]);
          const lugs = new THREE.InstancedMesh(lugGeometry, chrome, 8);
          lugs.name = `wheel-lugs-${name}-${face}`;
          for (let lug = 0; lug < 8; lug += 1) {
            const angle = lug * Math.PI / 4;
            transform.position.set(Math.sin(angle) * 0.213, face * (width / 2 + 0.049), Math.cos(angle) * 0.213);
            transform.rotation.set(0, 0, 0);
            transform.updateMatrix();
            lugs.setMatrixAt(lug, transform.matrix);
          }
          tire.add(lugs);
        }
      }
      const fender = addPart(wheelsGroup, `fender-${axleIndex}-${side}`, new THREE.TorusGeometry(0.69, 0.045, 8, 32, Math.PI), blackPlastic, [x, 0.6, side * 1.105]);
      fender.scale.z = 4.5;
    }
  }

  const sensorGroup = new THREE.Group();
  registerPart(nodes, sensorGroup, 'ultrasonic-sensor-assembly');
  sensorGroup.position.set(4.40, 1.68, 0);
  root.add(sensorGroup);
  addBox(sensorGroup, 'sensor-board', [0.12, 0.55, 1.08], [0, 0, 0], boardMaterial, 0.035);
  for (const z of [-0.30, 0.30]) {
    const transducer = addPart(
      sensorGroup,
      `ultrasonic-transducer-${z > 0 ? 'left' : 'right'}`,
      new THREE.CylinderGeometry(0.19, 0.19, 0.18, 32),
      chrome,
      [0.12, 0, z],
    );
    transducer.rotation.z = -Math.PI / 2;
    const aperture = addPart(
      sensorGroup,
      `ultrasonic-aperture-${z > 0 ? 'left' : 'right'}`,
      new THREE.CircleGeometry(0.135, 24),
      blackPlastic,
      [SOMPO_TRUCK_FRONT_X - sensorGroup.position.x, 0, z],
    );
    aperture.rotation.y = Math.PI / 2;
  }
  for (const z of [-0.45, 0.45]) {
    for (const y of [-0.20, 0.20]) {
      const screw = addPart(sensorGroup, `board-screw-${z}-${y}`, new THREE.CylinderGeometry(0.025, 0.025, 0.022, 6), chrome, [0.068, y, z]);
      screw.rotation.z = Math.PI / 2;
    }
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
  labelSprite.scale.set(1.78, 0.45, 1);
  labelSprite.position.set(-0.95, 2.45, 0);
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
      { id: 'cargo', type: 'box', center: [-1.42, 2.52, 0], size: [5.78, 2.48, 2.32] },
    ],
    destructionGroups: {
      body: ['cab-assembly', 'cargo-assembly'],
      runningGear: ['chassis-assembly', 'wheel-system'],
      telemetry: ['ultrasonic-sensor-assembly'],
    },
  };

  return { root, wheels, sensorGroup, ledMaterial, rayGroup, rayMaterial };
}
