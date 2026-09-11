import * as THREE from 'three';

/** Separate the reconstructed wheels without replacing their photographed tyre/rim UVs.
 * Coordinates are calibrated truck metres (+X nose, +Y up). The small circular cuts
 * stop inside the wheel arches; every triangle belongs to exactly one part.
 */
export function splitGeneratedTruckParts(body: THREE.Group) {
  const source: THREE.Mesh[] = [];
  body.traverse((node) => { if ((node as THREE.Mesh).isMesh) source.push(node as THREE.Mesh); });
  if (source.length !== 1) return { wheels: [] as THREE.Mesh[], cargo: null };
  const original = source[0];
  const geometry = original.geometry.clone().applyMatrix4(original.matrixWorld);
  const vertices = geometry.attributes.position;
  const index = geometry.index;
  const centers = [3.28, -1.20, -2.12].flatMap((x) => [-1, 1].map((side) => new THREE.Vector3(x, 0.46, side * 0.91)));
  const buckets: number[][] = Array.from({ length: 8 }, () => []);
  const centroid = new THREE.Vector3();
  const corner = new THREE.Vector3();
  for (let offset = 0; offset < (index?.count ?? vertices.count); offset += 3) {
    const triangle = [0, 1, 2].map((i) => index ? index.getX(offset + i) : offset + i);
    centroid.set(0, 0, 0);
    for (const vertex of triangle) centroid.add(corner.fromBufferAttribute(vertices, vertex));
    centroid.multiplyScalar(1 / 3);
    const wheelIndex = centers.findIndex((center) =>
      Math.sign(centroid.z) === Math.sign(center.z) && Math.abs(centroid.z) > 0.66
      && Math.hypot(centroid.x - center.x, centroid.y - center.y) < 0.489);
    const bucket = wheelIndex >= 0 ? wheelIndex + 1 : centroid.x < 2.74 && centroid.y > 1.0 ? 7 : 0;
    buckets[bucket].push(...triangle);
  }
  function extract(indices: number[]) {
    const remap = new Map<number, number>();
    const ordered: number[] = [];
    const compact = indices.map((id) => {
      if (!remap.has(id)) { remap.set(id, ordered.length); ordered.push(id); }
      return remap.get(id)!;
    });
    const part = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      const values = new Float32Array(ordered.length * attribute.itemSize);
      ordered.forEach((id, vertex) => {
        for (let component = 0; component < attribute.itemSize; component += 1) values[vertex * attribute.itemSize + component] = attribute.getComponent(id, component);
      });
      part.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize));
    }
    part.setIndex(compact); part.computeBoundingBox(); part.computeBoundingSphere();
    return part;
  }
  // Bake hierarchy transforms only after extracting the original support hull in the loader.
  body.clear(); body.position.set(0, 0, 0); body.rotation.set(0, 0, 0); body.scale.setScalar(1);
  const parts = buckets.map((indices, i) => {
    const part = new THREE.Mesh(extract(indices), original.material);
    part.name = i === 0 ? 'generated-chassis-cab' : i === 7 ? 'generated-cargo-body' : `generated-wheel-${i - 1}`;
    part.castShadow = part.receiveShadow = true;
    body.add(part);
    return part;
  });
  const wheels = parts.slice(1, 7);
  wheels.forEach((wheel, i) => {
    const center = centers[i];
    wheel.geometry.translate(-center.x, -center.y, -center.z);
    wheel.geometry.rotateX(-Math.PI / 2);
    wheel.position.copy(center); wheel.rotation.x = Math.PI / 2;
    wheel.geometry.computeBoundingBox(); wheel.geometry.computeBoundingSphere();
    wheel.userData.radius = 0.46;
    wheel.userData.blowoutTarget = i === 1;
  });
  geometry.dispose(); original.geometry.dispose();
  return { wheels, cargo: parts[7] };
}
