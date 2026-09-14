import * as THREE from 'three';
import type { PhysicalInteractionState } from '../../../shared/sompo-physical-interactions.js';
import { SOMPO_TRUCK_FRONT_X } from './createSompoTruckModel';

/** Reuses the stage renderer; illustrative cargo stays separate from the asset. */
export function createPhysicalTwinEffects(scene: THREE.Scene, pose: THREE.Group) {
  const floor = new THREE.Group();
  floor.name = 'sompo-physical-proximity';
  scene.add(floor);
  const rings = [1.5, 2.6, 3.7].map(radius => {
    const material = new THREE.MeshBasicMaterial({ color: 0x5ae0ad, transparent: true, opacity: .45, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius - .075, radius, 48, 1, -Math.PI / 2, Math.PI), material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(SOMPO_TRUCK_FRONT_X, .07, 0);
    floor.add(ring);
    return ring;
  });
  const stability = new THREE.Mesh(new THREE.PlaneGeometry(7.5, .35), new THREE.MeshBasicMaterial({ color: 0xff514b, transparent: true, opacity: .75, depthWrite: false, side: THREE.DoubleSide }));
  stability.rotation.x = -Math.PI / 2;
  stability.position.y = .08;
  floor.add(stability);
  const cargo = new THREE.Group();
  cargo.name = 'sompo-physical-cargo';
  pose.add(cargo);
  const material = new THREE.MeshBasicMaterial({ color: 0x72d5ba, transparent: true, opacity: .88, depthTest: false, depthWrite: false });
  const geometry = new THREE.BoxGeometry(1.05, .8, .85);
  const edges = new THREE.EdgesGeometry(geometry);
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0xe9fffb, transparent: true, opacity: .9, depthTest: false });
  for (const x of [-3, -1.65, -.3]) for (const z of [-.55, .55]) {
    const box = new THREE.Mesh(geometry, material);
    box.position.set(x, .05, z);
    box.renderOrder = 30;
    const outline = new THREE.LineSegments(edges, lineMaterial);
    outline.renderOrder = 31;
    box.add(outline);
    cargo.add(box);
  }
  const shockRing = new THREE.Mesh(new THREE.RingGeometry(3.5, 3.57, 64), new THREE.MeshBasicMaterial({ color: 0xffc36a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  shockRing.rotation.x = -Math.PI / 2;
  shockRing.position.y = .09;
  floor.add(shockRing);
  let impulse = 0;
  return {
    update(e: PhysicalInteractionState, elapsed: number, delta: number, cargoView: boolean, reduced: boolean) {
      floor.position.set(pose.position.x, 0, pose.position.z);
      floor.rotation.y = pose.rotation.y;
      const color = e.collision ? 0xff514b : e.proximity > 0 ? 0xffbd59 : 0x5ae0ad;
      for (const [index, ring] of rings.entries()) {
        ring.visible = e.live && e.distance !== null;
        ring.material.color.set(color);
        ring.material.opacity = reduced ? .55 : .25 + .35 * (.5 + .5 * Math.sin(elapsed * .004 - index * .9));
      }
      stability.visible = e.live && e.inclination;
      stability.position.z = Math.sign(pose.rotation.x || 1) * 1.65;
      impulse = e.live ? THREE.MathUtils.lerp(impulse, e.shock, 1 - Math.exp(-delta * 10)) : 0;
      cargo.visible = cargoView || e.inclination || impulse > .1 || e.cargo;
      material.color.set(!e.live ? 0x95a6b2 : e.cargo ? 0xff9959 : e.inclination ? 0xff6860 : 0x72d5ba);
      const movement = reduced || !e.live ? 0 : 1;
      cargo.position.z = movement * THREE.MathUtils.clamp(-Math.sin(pose.rotation.x) * .9, -.35, .35);
      cargo.position.x = movement * THREE.MathUtils.clamp(Math.sin(pose.rotation.z) * .6, -.25, .25);
      cargo.position.y = movement * Math.abs(Math.sin(elapsed * .023)) * impulse * .13;
      cargo.rotation.x = movement * Math.sin(elapsed * .019) * impulse * .055;
      shockRing.visible = !reduced && e.live && impulse > .08;
      shockRing.material.opacity = impulse * .65;
      shockRing.scale.setScalar(1 + impulse * .7);
      return movement * impulse * .055 * Math.sin(elapsed * .041);
    },
  };
}
