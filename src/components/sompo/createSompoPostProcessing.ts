import * as THREE from 'three';

/** PBR, tone mapping and moving shadows render in one color pass.
 * Removing the separate AO/bloom chain avoids duplicate geometry passes and
 * keeps the truck legible without bright halos or dark foliage rectangles.
 */
export function createSompoPostProcessing(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  return {
    resize(_width: number, _height: number) {},
    render(_delta: number) { renderer.render(scene, camera); },
    dispose() {},
  };
}
