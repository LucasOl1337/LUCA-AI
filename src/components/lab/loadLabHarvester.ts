import * as THREE from 'three';
import { loadSompoAgriAsset, disposeSompoAgriAsset } from '../sompo/loadSompoAgriAsset';

export async function loadLabHarvester(signal: AbortSignal): Promise<{
  root: THREE.Object3D;
  wheels: THREE.Object3D[];
  pivotY: number;
  dispose(): void;
} | null> {
  let model: THREE.Object3D | null = null;
  try {
    if (signal.aborted) return null;
    model = await loadSompoAgriAsset('harvester', signal);
    if (!model) return null;
    if (signal.aborted) { disposeSompoAgriAsset(model); return null; }
    // The loader already faces +X and grounds the model. Preserve its transform
    // when LabScene assigns root.position.y = -pivotY.
    const root = new THREE.Group();
    root.name = 'lab-harvester';
    root.add(model);
    const box = new THREE.Box3().setFromObject(root);
    const pivotY = -box.min.y; // Zero after the loader's ground normalization.
    const wheels: THREE.Object3D[] = [];
    model.traverse(object => { if (/wheel|roda/i.test(object.name)) wheels.push(object); });
    const asset = model;
    return { root, wheels, pivotY, dispose() { disposeSompoAgriAsset(asset); } };
  } catch {
    if (model) disposeSompoAgriAsset(model);
    return null;
  }
}
