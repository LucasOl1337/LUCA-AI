import * as THREE from 'three';

/** Dimensioned wheel surfaces around local Y, retaining the simulator's axle. */
export function sompoTireGeometry(width: number) {
  const profile = [
    [.345, -width / 2], [.39, -width / 2 - .009], [.47, -width / 2],
    [.54, -width / 2 + .025], [.575, -width / 2 + .060],
    [.58, -width / 2 + .085], [.58, width / 2 - .085],
    [.575, width / 2 - .06], [.54, width / 2 - .025],
    [.47, width / 2], [.39, width / 2 + .009], [.345, width / 2],
    [.345, -width / 2],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(profile, 64);
}

/** The vent holes are actual holes, not black circles painted on a solid disk. */
export function sompoRimGeometry() {
  const face = new THREE.Shape(); face.absarc(0, 0, .354, 0, Math.PI * 2, false);
  const hub = new THREE.Path(); hub.absarc(0, 0, .095, 0, Math.PI * 2, true); face.holes.push(hub);
  for (let index = 0; index < 10; index++) {
    const angle = index * Math.PI * .2;
    const hole = new THREE.Path();
    hole.absellipse(Math.sin(angle) * .274, Math.cos(angle) * .274, .042, .045, 0, Math.PI * 2, true, -angle);
    face.holes.push(hole);
  }
  const geometry = new THREE.ExtrudeGeometry(face, { depth: .019, bevelEnabled: true, bevelSegments: 2, bevelSize: .004, bevelThickness: .003, curveSegments: 8, steps: 1 });
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const radius = Math.hypot(positions.getX(i), positions.getZ(i));
    const t = THREE.MathUtils.clamp((radius - .095) / (.354 - .095), 0, 1);
    positions.setY(i, positions.getY(i) - Math.sin(t * Math.PI) * .045);
  }
  geometry.computeVertexNormals();
  return geometry;
}
