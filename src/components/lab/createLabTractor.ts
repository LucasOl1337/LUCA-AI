import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Generic agricultural tractor, in meters, facing +X. Geometry is illustrative. */
export function createLabTractor() {
  const root = new THREE.Group();
  root.name = 'lab-agricultural-tractor';
  const body = new THREE.MeshStandardMaterial({ color: 0x316a54, roughness: 0.42, metalness: 0.16 });
  const roof = new THREE.MeshStandardMaterial({ color: 0xf0eee1, roughness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x263732, roughness: 0.65, metalness: 0.15 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x252d2a, roughness: 0.94 });
  const tread = new THREE.MeshStandardMaterial({ color: 0x343e37, roughness: 0.92 });
  const hub = new THREE.MeshStandardMaterial({ color: 0xe4b36d, roughness: 0.45, metalness: 0.24 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x92b2b0, roughness: 0.12, metalness: 0.12, transparent: true, opacity: 0.72 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x6d7b73, roughness: 0.46, metalness: 0.65 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xfff4d2, emissive: 0xffe7b0, emissiveIntensity: 0.4 });

  const part = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], parent = root) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const box = (name: string, size: [number, number, number], position: [number, number, number], material: THREE.Material, radius = 0.035, parent = root) =>
    part(name, new RoundedBoxGeometry(...size, 2, radius), material, position, parent);

  box('chassis', [3.9, 0.36, 1.2], [0, 0.86, 0], dark);
  box('engine-hood', [2.15, 0.95, 1.25], [0.84, 1.47, 0], body, 0.15);
  box('bonnet-top', [1.86, 0.16, 1.1], [0.87, 1.99, 0], body, 0.07);
  box('front-grille', [0.06, 0.62, 0.99], [1.94, 1.49, 0], dark);
  for (let index = 0; index < 8; index += 1) {
    box(`grille-fin-${index}`, [0.07, 0.026, 0.91], [1.98, 1.23 + index * 0.072, 0], steel, 0.006);
  }
  box('front-weight', [0.4, 0.38, 1.28], [2.15, 0.83, 0], dark);
  for (const side of [-1, 1]) {
    box(`headlight-${side}`, [0.09, 0.19, 0.3], [1.99, 1.82, side * 0.39], lamp);
    box(`rear-fender-${side}`, [1.86, 0.13, 0.8], [-1.07, 2.03, side * 0.94], body, 0.06);
    box(`step-${side}`, [0.61, 0.12, 0.43], [-0.13, 0.55, side * 0.91], steel);
    box(`door-step-${side}`, [0.53, 0.11, 0.32], [-0.26, 0.84, side * 0.83], dark);
    box(`mirror-arm-${side}`, [0.1, 0.1, 0.42], [-0.04, 2.48, side * 0.83], dark, 0.02);
    box(`mirror-${side}`, [0.16, 0.3, 0.12], [-0.04, 2.46, side * 1.07], dark);
  }

  box('cab-base', [1.53, 0.2, 1.4], [-0.77, 1.51, 0], body);
  box('cab-glazing', [1.44, 1.17, 1.32], [-0.79, 2.17, 0], glass, 0.035);
  for (const x of [-1.48, -0.1]) {
    for (const z of [-0.67, 0.67]) box(`cab-pillar-${x}-${z}`, [0.075, 1.35, 0.075], [x, 2.18, z], dark, 0.01);
  }
  box('cab-roof', [1.73, 0.18, 1.69], [-0.78, 2.84, 0], roof, 0.08);
  box('seat', [0.53, 0.27, 0.6], [-0.95, 1.89, 0], dark);
  box('seat-back', [0.15, 0.62, 0.61], [-1.2, 2.09, 0], dark);
  const exhaust = part('exhaust', new THREE.CylinderGeometry(0.056, 0.067, 1.5, 10), dark, [0.12, 2.31, -0.51]);
  exhaust.rotation.z = 0.04;
  part('gnss-receiver', new THREE.CylinderGeometry(0.13, 0.15, 0.09, 16), roof, [-0.76, 2.98, 0]);
  part('beacon', new THREE.CylinderGeometry(0.085, 0.095, 0.15, 12), hub, [-1.28, 3.01, 0.55]);

  const wheels: THREE.Group[] = [];
  for (const axle of [{ x: -1.08, radius: 1, width: 0.55, z: 1.03 }, { x: 1.38, radius: 0.65, width: 0.39, z: 0.93 }]) {
    for (const side of [-1, 1]) {
      const wheel = new THREE.Group();
      wheel.name = `wheel-${axle.x}-${side}`;
      wheel.position.set(axle.x, axle.radius, side * axle.z);
      root.add(wheel);
      const rubber = part('tire', new THREE.CylinderGeometry(axle.radius, axle.radius, axle.width, 28), tire, [0, 0, 0], wheel);
      rubber.rotation.x = Math.PI / 2;
      const rim = part('wheel-hub', new THREE.CylinderGeometry(axle.radius * 0.5, axle.radius * 0.5, axle.width + 0.024, 24), hub, [0, 0, 0], wheel);
      rim.rotation.x = Math.PI / 2;
      const cap = part('hub-cap', new THREE.CylinderGeometry(axle.radius * 0.14, axle.radius * 0.14, axle.width + 0.08, 12), dark, [0, 0, 0], wheel);
      cap.rotation.x = Math.PI / 2;
      for (let index = 0; index < 18; index += 1) {
        const angle = index / 18 * Math.PI * 2;
        const lug = part('tire-tread', new THREE.BoxGeometry(axle.radius * 0.27, 0.07, axle.width * 0.99), tread,
          [Math.sin(angle) * axle.radius, Math.cos(angle) * axle.radius, 0], wheel);
        lug.rotation.z = -angle;
      }
      wheels.push(wheel);
    }
  }

  // This is a drawn implement, not a measurement of the implement's geometry or articulation.
  box('tow-bar', [1.42, 0.1, 0.14], [-2.32, 0.49, 0], steel);
  box('harrow-frame', [1.36, 0.12, 2.62], [-3.31, 0.54, 0], body);
  for (const x of [-2.82, -3.72]) {
    for (let index = -3; index <= 3; index += 1) {
      const disc = part('harrow-disc', new THREE.CylinderGeometry(0.26, 0.26, 0.038, 16), steel, [x, 0.27, index * 0.36]);
      disc.rotation.x = Math.PI / 2;
      disc.rotation.y = x > -3 ? 0.25 : -0.25;
    }
  }
  return { root, wheels };
}
