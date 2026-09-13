import * as THREE from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { SompoAgriEquipmentId, SompoAgriVisualFrame } from '../../../shared/sompo-agri-scenarios.js';
import { sompoSteeringAngle } from '../../../shared/sompo-motion.js';

/** Pivots measured on the two normalized source meshes, in metres (+X forward).
 * A rigid partition preserves the original atlas and every source triangle.
 * These are visual articulation zones, not a CAD or collision rig.
 */
export const SOMPO_AGRI_RIG_LAYOUT = {
  tractor: { axles: [{ x: 1.82, y: .57, z: .76, radius: .57, inner: .50, steer: true }, { x: -.16, y: .78, z: .84, radius: .77, inner: .59, steer: false }], hitch: [-.85, 1.15, 0] },
  harvester: { axles: [{ x: 1.30, y: .85, z: 1.20, radius: .85, inner: .84, steer: false }, { x: -1.48, y: .64, z: 1.09, radius: .64, inner: .85, steer: true }], hitch: [2.32, 1.1, 0] },
} as const;

export function rigSompoAgriAsset(source: THREE.Object3D, equipmentId: SompoAgriEquipmentId) {
  const layout = SOMPO_AGRI_RIG_LAYOUT[equipmentId];
  const root = new THREE.Group(); root.name = `sompo-agri-${equipmentId}-rig`;
  root.userData = { ...source.userData, rigVersion: 1 };
  const body = new THREE.Group(); body.name = 'agri-body'; root.add(body);
  const implement = new THREE.Group(); implement.name = equipmentId === 'tractor' ? 'agri-implement' : 'agri-header';
  implement.position.fromArray(layout.hitch); root.add(implement);
  const wheels = layout.axles.flatMap((axle, index) => [-1, 1].map(side => {
    const steering = new THREE.Group(); steering.name = `agri-steering-${index}-${side}`;
    steering.position.set(axle.x, axle.y, side * axle.z); root.add(steering);
    const spin = new THREE.Group(); spin.name = `agri-wheel-${index}-${side}`; steering.add(spin);
    spin.userData.radius = axle.radius;
    return { ...axle, side, steering, spin };
  }));
  const parts = [body, ...wheels.map(wheel => wheel.spin), implement];
  const pivots = [new THREE.Vector3(), ...wheels.map(wheel => wheel.steering.position), implement.position];
  const removed: THREE.Mesh[] = [];
  let triangles = 0;
  source.updateMatrixWorld(true);
  source.traverse(node => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    const p = geometry.attributes.position;
    const indices = geometry.index?.array ?? Uint32Array.from({ length: p.count }, (_, i) => i);
    const buckets: number[][] = parts.map(() => []);
    for (let i = 0; i < indices.length; i += 3) {
      const ids = [indices[i], indices[i + 1], indices[i + 2]];
      const x = ids.reduce((sum, id) => sum + p.getX(id), 0) / 3;
      const y = ids.reduce((sum, id) => sum + p.getY(id), 0) / 3;
      const z = ids.reduce((sum, id) => sum + p.getZ(id), 0) / 3;
      let part = 0;
      for (const [index, wheel] of wheels.entries()) {
        if (Math.sign(z) === wheel.side && Math.abs(z) > wheel.inner
          && Math.hypot(x - wheel.x, y - wheel.y) < wheel.radius * 1.025) { part = index + 1; break; }
      }
      if (!part && (equipmentId === 'tractor' ? x < -.98 && Math.abs(z) < .64 : x > 2.53 && y < 1.5)) part = parts.length - 1;
      buckets[part].push(...ids); triangles++;
    }
    buckets.forEach((ids, part) => {
      if (!ids.length) return;
      const remap = new Map<number, number>(), vertices: number[] = [], compact: number[] = [];
      for (const id of ids) { if (!remap.has(id)) { remap.set(id, vertices.length); vertices.push(id); } compact.push(remap.get(id)!); }
      const piece = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(geometry.attributes)) {
        const values = new Float32Array(vertices.length * attr.itemSize);
        vertices.forEach((id, i) => { for (let c = 0; c < attr.itemSize; c++) values[i * attr.itemSize + c] = attr.getComponent(id, c); });
        piece.setAttribute(name, new THREE.BufferAttribute(values, attr.itemSize));
      }
      piece.setIndex(compact); piece.translate(-pivots[part].x, -pivots[part].y, -pivots[part].z);
      piece.computeBoundingSphere();
      const surface = new THREE.Mesh(piece, mesh.material); surface.name = `${parts[part].name}-surface`;
      surface.castShadow = surface.receiveShadow = true; parts[part].add(surface);
    });
    geometry.dispose(); removed.push(mesh);
  });
  for (const mesh of removed) mesh.removeFromParent();
  new Set(removed.map(mesh => mesh.geometry)).forEach(geometry => geometry.dispose());
  root.userData.sourceTriangles = triangles;
  // Keep only convex support vertices: rolling contact without scanning 28k
  // triangles every frame. The articulated part matrices still move the support.
  const support = parts.map(part => {
    const points: THREE.Vector3[] = [];
    for (const child of part.children) {
      const position = (child as THREE.Mesh).geometry?.attributes.position;
      if (position) for (let i = 0; i < position.count; i++) points.push(new THREE.Vector3().fromBufferAttribute(position, i));
    }
    const vertices = new Set<THREE.Vector3>();
    if (points.length >= 4) for (const face of new ConvexHull().setFromPoints(points).faces) {
      let edge = face.edge;
      do { vertices.add(edge.head().point); edge = edge.next; } while (edge !== face.edge);
    }
    return { part, vertices: [...vertices] };
  });
  const rotor = new THREE.Group(); rotor.name = 'agri-header-reel';
  if (equipmentId === 'harvester') {
    // Open reel over the authored cutter bed; housing itself never spins.
    rotor.position.set(1.06, .16, 0); implement.add(rotor);
    const steel = new THREE.MeshStandardMaterial({ color: 0x26352c, roughness: .58, metalness: .48 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xb69a48, roughness: .6, metalness: .28 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, 5.15, 12), steel); shaft.rotation.x = Math.PI / 2; rotor.add(shaft);
    const bar = new THREE.BoxGeometry(.055, .06, 5.04);
    const arm = new THREE.BoxGeometry(.035, .68, .035);
    const tineGeometry = new THREE.BoxGeometry(.018, .16, .018);
    const tines = new THREE.InstancedMesh(tineGeometry, steel, 6 * 18); const matrix = new THREE.Matrix4();
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3, x = Math.cos(a) * .34, y = Math.sin(a) * .34;
      const bat = new THREE.Mesh(bar, yellow); bat.position.set(x, y, 0); rotor.add(bat);
      for (const z of [-2.45, 0, 2.45]) { const spoke = new THREE.Mesh(arm, steel); spoke.rotation.z = a - Math.PI / 2; spoke.position.z = z; rotor.add(spoke); }
      for (let k = 0; k < 18; k++) { matrix.makeTranslation(x, y - .08, -2.4 + k * 4.8 / 17); tines.setMatrixAt(i * 18 + k, matrix); }
    }
    rotor.add(tines);
    // One draw per material for the rigid reel; its whole group stays articulated.
    for (const material of [steel, yellow]) {
      const meshes = rotor.children.filter(node => (node as THREE.Mesh).isMesh && !(node as THREE.InstancedMesh).isInstancedMesh && (node as THREE.Mesh).material === material) as THREE.Mesh[];
      const geometries = meshes.map(mesh => { mesh.updateMatrix(); return mesh.geometry.clone().applyMatrix4(mesh.matrix); });
      const combined = new THREE.Mesh(mergeGeometries(geometries), material); rotor.add(combined);
      geometries.forEach(geometry => geometry.dispose()); meshes.forEach(mesh => mesh.removeFromParent());
      new Set(meshes.map(mesh => mesh.geometry)).forEach(geometry => geometry.dispose());
    }
  }
  // Máquina de verdade acumula poeira nas partes baixas e palhada no corpo.
  // Só material: o GLB fica intacto, sem re-gerar rig nem texturas.
  const patched = new Set<THREE.Material>();
  const wear = (material: THREE.Material) => {
    if (!(material instanceof THREE.MeshStandardMaterial) || patched.has(material)) return;
    if (material.emissive.getHex() === 0xff2714) return; // luz de freio fica limpa
    patched.add(material);
    material.roughness = Math.min(1, material.roughness * 1.25 + .08);
    material.metalness = Math.min(material.metalness, .45);
    const compile = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      compile?.call(material, shader, renderer);
      shader.vertexShader = 'varying vec3 agriW;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 agriP = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          agriP = instanceMatrix * agriP;
        #endif
        agriW = (modelMatrix * agriP).xyz;`);
      shader.fragmentShader = `varying vec3 agriW;
        float agriHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float agriNoise(vec2 p){vec2 i=floor(p),f=fract(p);f*=f*(3.-2.*f);
          return mix(mix(agriHash(i),agriHash(i+vec2(1,0)),f.x),mix(agriHash(i+vec2(0,1)),agriHash(i+vec2(1,1)),f.x),f.y);}\n` + shader.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
          float agriDust = smoothstep(2.4, .1, agriW.y) * (.35 + .65 * agriNoise(agriW.xz * 2.4));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.48, .4, .26), clamp(agriDust, 0., 1.) * .55);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, .95, clamp(agriDust, 0., 1.) * .55);`);
    };
    material.customProgramCacheKey = () => 'sompo-agri-wear-v1';
  };
  const lampMaterial = new THREE.MeshStandardMaterial({ color: 0x721710, emissive: 0xff2714, emissiveIntensity: 0, roughness: .4 });
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(.05, .09, .16), lampMaterial);
    lamp.position.set(equipmentId === 'tractor' ? -.86 : -2.7, 1.35, side * .73); body.add(lamp);
  }
  root.traverse(node => {
    const material = (node as THREE.Mesh).material as THREE.Material | undefined;
    if (material && !Array.isArray(material)) wear(material);
  });
  const initialHitch = implement.position.clone();
  const hydraulics = equipmentId === 'tractor' ? [-1, 1].map(side => {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.052, .052, 1, 12), new THREE.MeshStandardMaterial({ color: 0x26372b, roughness: .55, metalness: .4 }));
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 1, 10), new THREE.MeshStandardMaterial({ color: 0x899291, roughness: .26, metalness: .8 }));
    barrel.name = `agri-hydraulic-barrel-${side}`; rod.name = `agri-hydraulic-rod-${side}`; root.add(barrel, rod);
    return { barrel, rod, base: new THREE.Vector3(-.60, 1.56, side * .43), end: new THREE.Vector3(-.72, -.25, side * .43) };
  }) : [];
  const end = new THREE.Vector3(), direction = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const inverse = new THREE.Matrix4(), rotationMatrix = new THREE.Matrix4(), matrix = new THREE.Matrix4(), contact = new THREE.Vector3();
  return {
    root, wheels, implement, rotor,
    supportHeight(rotation: THREE.Euler, x: number, z: number, ground: (x: number, z: number) => number) {
      root.updateWorldMatrix(true, true); inverse.copy(root.matrixWorld).invert(); rotationMatrix.makeRotationFromEuler(rotation);
      const base = ground(x, z); let height = -Infinity;
      for (const { part, vertices } of support) {
        matrix.copy(rotationMatrix).multiply(inverse).multiply(part.matrixWorld);
        for (const point of vertices) {
          contact.copy(point).applyMatrix4(matrix);
          height = Math.max(height, ground(x + contact.x, z + contact.z) - base - contact.y);
        }
      }
      return Number.isFinite(height) ? height + .015 : 0;
    },
    update(frame: SompoAgriVisualFrame, wheelTravel: number, headerTurns: number, reduced: boolean) {
      for (const wheel of wheels) {
        wheel.steering.rotation.y = wheel.steer ? sompoSteeringAngle(frame.speedKph, frame.direction, frame.yawRate, equipmentId === 'tractor' ? 1.98 : 2.78, equipmentId === 'harvester') : 0;
        wheel.spin.rotation.z = reduced ? 0 : -wheelTravel / wheel.radius;
      }
      implement.position.copy(initialHitch);
      // Rattle mecânico: o envelope vem do roteiro e a fase do relógio do frame,
      // então o tranco é determinístico em qualquer amostragem.
      const tremor = reduced ? 0 : (frame.shudder ?? 0);
      if (equipmentId === 'tractor') {
        implement.position.y += -.22 + frame.implementLift * .58 + tremor * Math.sin(frame.atMs * .09) * .035;
        implement.rotation.set(
          frame.implementRoll * Math.PI / 180 + tremor * Math.sin(frame.atMs * .073 + 1.1) * .05,
          frame.implementYaw * Math.PI / 180 + tremor * Math.sin(frame.atMs * .061 + .7) * .045,
          -frame.implementLift * .24 + tremor * Math.sin(frame.atMs * .083 + 2.2) * .03,
          'YZX');
      } else {
        implement.rotation.z = frame.implementLift * .3 + (1 - frame.headerSpeed) * .065;
        rotor.rotation.z = reduced ? 0 : -headerTurns * Math.PI * 2;
      }
      implement.updateMatrix();
      for (const piston of hydraulics) {
        end.copy(piston.end).applyMatrix4(implement.matrix);
        direction.copy(end).sub(piston.base); const length = direction.length(); direction.normalize();
        piston.barrel.quaternion.setFromUnitVectors(up, direction); piston.rod.quaternion.copy(piston.barrel.quaternion);
        const barrelLength = Math.min(.52, length * .65);
        piston.barrel.scale.y = barrelLength; piston.rod.scale.y = Math.max(.02, length - barrelLength);
        piston.barrel.position.copy(piston.base).addScaledVector(direction, barrelLength / 2);
        piston.rod.position.copy(piston.base).addScaledVector(direction, (barrelLength + length) / 2);
      }
      lampMaterial.emissiveIntensity = frame.brakeLights * 3;
    },
  };
}
