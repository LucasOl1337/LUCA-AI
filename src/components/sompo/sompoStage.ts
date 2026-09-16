import * as THREE from 'three';
import type { SompoRenderStats } from './sompoStudioConfig';

export interface SompoStageApi {
  focus(target: 'truck' | 'sensor'): void;
  adjust(action: 'rotate-left' | 'rotate-right' | 'zoom-in' | 'zoom-out'): void;
  recenterHeading(): void;
  exportModel?(): Promise<ArrayBuffer>;
  dispose(): void;
}

/** A bounded rendering budget, shared by both stages; selected at mount. */
export function sompoRenderBudget() {
  const compact = window.matchMedia('(max-width: 700px), (pointer: coarse)').matches;
  return { compact, pixelRatio: Math.min(window.devicePixelRatio || 1, compact ? 1 : 2), shadowSize: compact ? 1024 : 2048, postEffects: !compact };
}

export function createSompoRenderer(mount: HTMLElement) {
  const budget = sompoRenderBudget();
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(budget.pixelRatio);
  renderer.setClearColor(0x07100c, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;
  renderer.info.autoReset = false;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  mount.appendChild(renderer.domElement);
  return { renderer, budget };
}

export function createSompoRenderMeter(renderer: THREE.WebGLRenderer, report?: (stats: SompoRenderStats) => void) {
  let started = 0, from = performance.now(), frames = 0;
  const times: number[] = [];
  return {
    begin() { renderer.info.reset(); started = performance.now(); },
    end() {
      const now = performance.now(); times.push(now - started); frames++;
      if (now - from < 1000) return;
      times.sort((a, b) => a - b);
      report?.({ fps: Math.round(frames * 1000 / (now - from)), cpuMs: times[Math.floor(times.length / 2)] || 0,
        calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures });
      from = now; frames = 0; times.length = 0;
    },
  };
}

/** Release shared resources once, including instance buffers and shadow targets. */
export function disposeSompoObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((node) => {
    if (node instanceof THREE.InstancedMesh) node.dispose();
    if (node instanceof THREE.Light && 'shadow' in node) (node as THREE.DirectionalLight).shadow.dispose();
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    for (const material of mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  geometries.forEach(value => value.dispose());
  textures.forEach(value => value.dispose());
  materials.forEach(value => value.dispose());
}
