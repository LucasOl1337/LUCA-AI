import * as THREE from 'three';
import { polygonContains, type LabPolygon } from '../../../shared/lab-telemetry.js';

/** Parallel rows along +X; spacing is in meters, shared across all allowed areas. */
export function createCropField(options: {
  polygons: LabPolygon[];
  groundHeight: (point: { x: number; z: number }) => number | null;
  rowSpacingM?: number;
  plantSpacingM?: number;
  maxInstances?: number;
  crop?: 'cana' | 'milho';
}): { mesh: THREE.InstancedMesh; count: number; dispose(): void } | null {
  const allowed = options.polygons.filter(polygon => polygon.role === 'allowed_area');
  if (!allowed.length) return null;
  let { rowSpacingM = 1.5, plantSpacingM = 0.5 } = options;
  const { maxInstances = 40_000, crop = 'milho' } = options;
  if (![rowSpacingM, plantSpacingM].every(value => Number.isFinite(value) && value > 0)
    || !Number.isSafeInteger(maxInstances) || maxInstances < 0) {
    throw new RangeError('Crop spacing must be positive and finite; maxInstances must be a nonnegative integer.');
  }
  if (!maxInstances) return null;
  const bounds = allowed.map(polygon => {
    const box = new THREE.Box2();
    for (const point of polygon.rings[0] ?? []) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) throw new RangeError('Invalid crop polygon coordinate.');
      box.expandByPoint(new THREE.Vector2(point.x, point.z));
    }
    return { polygon, box };
  }).filter(({ box }) => !box.isEmpty());
  if (!bounds.length) return null;
  const gridBounds = () => bounds.map(({ polygon, box }) => ({
    polygon,
    minCol: Math.ceil(box.min.x / plantSpacingM - 0.5),
    maxCol: Math.ceil(box.max.x / plantSpacingM - 0.5),
    minRow: Math.ceil(box.min.y / rowSpacingM - 0.5),
    maxRow: Math.ceil(box.max.y / rowSpacingM - 0.5),
  }));
  let grids = gridBounds();
  const candidates = () => grids.reduce((sum, grid) => sum
    + (grid.maxCol - grid.minCol) * (grid.maxRow - grid.minRow), 0);
  // ponytail: bounding rectangles conservatively cap work; use scanlines if sparse polygons need denser crops.
  while (candidates() > maxInstances) {
    const factor = Math.max(1.1, Math.sqrt(candidates() / maxInstances));
    rowSpacingM *= factor;
    plantSpacingM *= factor;
    grids = gridBounds();
  }
  const positions: THREE.Vector3[] = [];
  const visited = new Set<string>();
  for (const grid of grids) {
    for (let row = grid.minRow; row < grid.maxRow; row++) {
      for (let col = grid.minCol; col < grid.maxCol; col++) {
        const key = `${col},${row}`;
        if (visited.has(key)) continue;
        const point = { x: (col + 0.5) * plantSpacingM, z: (row + 0.5) * rowSpacingM };
        if (!polygonContains(point, grid.polygon)) continue;
        visited.add(key);
        const y = options.groundHeight(point);
        if (y !== null && Number.isFinite(y)) positions.push(new THREE.Vector3(point.x, y, point.z));
      }
    }
  }
  const height = crop === 'cana' ? 1.7 : 1.4;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.09, 0, 0, 0.09, 0, 0, -0.09, height, 0, 0.09, height, 0,
    0, 0, -0.09, 0, 0, 0.09, 0, height, -0.09, 0, height, 0.09,
  ], 3));
  geometry.setIndex([0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7]);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: 0x5e8f3c, roughness: 1, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geometry, material, positions.length);
  mesh.name = `lab-crop-${crop}`;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  Object.assign(mesh.userData, { rowSpacingM, plantSpacingM, crop });
  const dummy = new THREE.Object3D();
  positions.forEach((point, index) => {
    const seed = Math.sin(point.x * 12.9898 + point.z * 78.233) * 43758.5453;
    const hash = seed - Math.floor(seed);
    dummy.position.copy(point);
    dummy.rotation.y = (hash - 0.5) * 0.5;
    dummy.scale.set(1, 0.9 + hash * 0.2, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return {
    mesh, count: positions.length,
    dispose() { mesh.dispose(); geometry.dispose(); material.dispose(); },
  };
}
