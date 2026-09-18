import * as THREE from 'three';

// Includes mirrors and the sensor sign, with room around the working vehicle.
export const SOMPO_OVERVIEW_BOUNDS = new THREE.Box3(
  new THREE.Vector3(-4.5, 0, -1.4), new THREE.Vector3(4.62, 3.85, 1.4),
);
export const SOMPO_OVERVIEW_TARGET = new THREE.Vector3(0.05, 1.7, 0);

/** Fit every vehicle corner to the current viewport, rather than guessing distance. */
export function sompoOverviewOffset(aspect: number, verticalFov: number) {
  const backward = new THREE.Vector3(0.58, 0.18, 1).normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), backward).normalize();
  const up = new THREE.Vector3().crossVectors(backward, right);
  const tanV = Math.tan(THREE.MathUtils.degToRad(verticalFov / 2));
  const tanH = tanV * Math.max(0.2, aspect);
  let distance = 0;
  for (const x of [SOMPO_OVERVIEW_BOUNDS.min.x, SOMPO_OVERVIEW_BOUNDS.max.x]) {
    for (const y of [SOMPO_OVERVIEW_BOUNDS.min.y, SOMPO_OVERVIEW_BOUNDS.max.y]) {
      for (const z of [SOMPO_OVERVIEW_BOUNDS.min.z, SOMPO_OVERVIEW_BOUNDS.max.z]) {
        const corner = new THREE.Vector3(x, y, z).sub(SOMPO_OVERVIEW_TARGET);
        const depth = corner.dot(backward);
        distance = Math.max(distance, depth + Math.abs(corner.dot(right)) / (tanH * 0.74),
          depth + Math.abs(corner.dot(up)) / (tanV * 0.69));
      }
    }
  }
  return backward.multiplyScalar(distance);
}
