import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Viga no plano XZ entre dois pontos, com largura e altura dadas (y de baixo). */
export function beamBetween(a: THREE.Vector2, b: THREE.Vector2, width: number, height: number, bottom: number) {
  const length = a.distanceTo(b);
  const geometry = new THREE.BoxGeometry(length + width, height, width);
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  geometry.rotateY(-angle);
  geometry.translate((a.x + b.x) / 2, bottom + height / 2, (a.y + b.y) / 2);
  return geometry;
}

/** Caixa já posicionada (centro em x/z, base em y). */
export function boxAt(sx: number, sy: number, sz: number, x: number, bottom: number, z: number) {
  const geometry = new THREE.BoxGeometry(sx, sy, sz);
  geometry.translate(x, bottom + sy / 2, z);
  return geometry;
}

export function roundedBoxAt(sx: number, sy: number, sz: number, x: number, y: number, z: number, radius: number, segments = 3) {
  const geometry = new RoundedBoxGeometry(sx, sy, sz, segments, radius);
  geometry.translate(x, y, z);
  return geometry;
}

/**
 * Placa retangular vazada (furos quadrados em grade), deitada no plano XZ,
 * com base em y = 0. É a massa de prova: os furos deixam o ácido passar por
 * baixo e soltar a estrutura do substrato.
 */
export function holedPlate(width: number, depth: number, thickness: number, holes: { nx: number; nz: number; size: number; margin: number }) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -depth / 2);
  shape.lineTo(width / 2, -depth / 2);
  shape.lineTo(width / 2, depth / 2);
  shape.lineTo(-width / 2, depth / 2);
  shape.closePath();
  const { nx, nz, size, margin } = holes;
  const spanX = width - margin * 2, spanZ = depth - margin * 2;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const cx = -spanX / 2 + (spanX * (i + 0.5)) / nx;
      const cz = -spanZ / 2 + (spanZ * (j + 0.5)) / nz;
      const hole = new THREE.Path();
      hole.moveTo(cx - size / 2, cz - size / 2);
      hole.lineTo(cx - size / 2, cz + size / 2);
      hole.lineTo(cx + size / 2, cz + size / 2);
      hole.lineTo(cx + size / 2, cz - size / 2);
      hole.closePath();
      shape.holes.push(hole);
    }
  }
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 1 });
  // Shape em XY extrudada em +Z → deita no plano XZ com a face de cima em +Y.
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, thickness, 0);
  geometry.computeVertexNormals();
  return geometry;
}

/** Placa com recortes retangulares (campo do die ao redor das cavidades). */
export function plateWithCutouts(width: number, depth: number, thickness: number, cutouts: { x: number; z: number; w: number; d: number }[]) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -depth / 2);
  shape.lineTo(width / 2, -depth / 2);
  shape.lineTo(width / 2, depth / 2);
  shape.lineTo(-width / 2, depth / 2);
  shape.closePath();
  for (const cut of cutouts) {
    const hole = new THREE.Path();
    // O rotateX(+π/2) abaixo leva y do shape para z do mundo.
    hole.moveTo(cut.x - cut.w / 2, cut.z - cut.d / 2);
    hole.lineTo(cut.x - cut.w / 2, cut.z + cut.d / 2);
    hole.lineTo(cut.x + cut.w / 2, cut.z + cut.d / 2);
    hole.lineTo(cut.x + cut.w / 2, cut.z - cut.d / 2);
    hole.closePath();
    shape.holes.push(hole);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 1 });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, thickness, 0);
  // UV do topo em [0,1] no retângulo do die.
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    uv.setXY(i, position.getX(i) / width + 0.5, 0.5 - position.getZ(i) / depth);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Mola dobrada (serpentina) de A (âncora) até B (massa). O atributo
 * `aFollow` vai de 0 na âncora a 1 na massa: o shader desloca cada vértice
 * por uDisp·aFollow e a mola estica sem recriar geometria.
 */
export function serpentineSpring(anchor: THREE.Vector2, mass: THREE.Vector2, folds: number, amplitude: number, width: number, height: number, bottom: number) {
  const axis = mass.clone().sub(anchor);
  const length = axis.length();
  const dir = axis.clone().normalize();
  const normal = new THREE.Vector2(-dir.y, dir.x);
  const points: THREE.Vector2[] = [anchor.clone()];
  const lead = length * 0.12;
  points.push(anchor.clone().addScaledVector(dir, lead));
  const span = length - lead * 2;
  for (let i = 0; i <= folds; i++) {
    const along = lead + (span * i) / folds;
    const side = i % 2 === 0 ? 1 : -1;
    const base = anchor.clone().addScaledVector(dir, along);
    points.push(base.clone().addScaledVector(normal, amplitude * side));
    if (i < folds) points.push(base.clone().addScaledVector(dir, span / folds / 2).addScaledVector(normal, amplitude * side));
  }
  points.push(mass.clone().addScaledVector(dir, -lead));
  points.push(mass.clone());
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < points.length - 1; i++) parts.push(beamBetween(points[i], points[i + 1], width, height, bottom));
  const geometry = mergeGeometries(parts.map((part) => part.toNonIndexed()));
  parts.forEach((part) => part.dispose());
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const follow = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) {
    const p = new THREE.Vector2(position.getX(i), position.getZ(i)).sub(anchor);
    follow[i] = THREE.MathUtils.clamp(p.dot(dir) / length, 0, 1);
  }
  geometry.setAttribute('aFollow', new THREE.BufferAttribute(follow, 1));
  return geometry;
}

/** Material que desloca vértices por uDisp·aFollow (molas que esticam). */
export function followMaterial(base: THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial, uniforms: { uDisp: { value: THREE.Vector3 } }, key: string) {
  const material = base.clone();
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDisp = uniforms.uDisp;
    shader.vertexShader = 'attribute float aFollow;\nuniform vec3 uDisp;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\ntransformed += uDisp * aFollow;',
    );
  };
  material.customProgramCacheKey = () => `sensor-follow-${key}`;
  return material;
}

/** Merge com fallback para listas vazias. */
export function merge(parts: THREE.BufferGeometry[]) {
  const flat = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  const merged = mergeGeometries(flat);
  parts.forEach((part) => part.dispose());
  return merged;
}

/** Tubo de ouro de um fio de solda, da bola até o ponto de costura. */
export function bondWireCurve(start: THREE.Vector3, end: THREE.Vector3, loop: number) {
  const mid = start.clone().lerp(end, 0.35);
  mid.y = Math.max(start.y, end.y) + loop;
  const rise = start.clone();
  rise.y += loop * 0.72;
  const settle = end.clone().lerp(start, 0.12);
  settle.y = end.y + loop * 0.18;
  return new THREE.CatmullRomCurve3([start, rise, mid, settle, end], false, 'centripetal', 0.5);
}
