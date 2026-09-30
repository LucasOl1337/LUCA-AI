import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export interface SentinelScene { turn: (angle: number) => void; reset: () => void; dispose: () => void }
const MODEL = '/models/luca/sentinel-63714d75.glb';

function disposeObject(root: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}

/** No animation loop: GPU work happens only on load, resize or an explicit turn. */
export function createSentinelScene(canvas: HTMLCanvasElement, onReady: () => void, onError: () => void): SentinelScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#050d18');
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
  const pivot = new THREE.Group();
  scene.add(pivot);
  scene.add(new THREE.HemisphereLight(0xd2ecff, 0x112240, 0.8));
  const key = new THREE.DirectionalLight(0xffffff, 2);
  key.position.set(3, 4, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x389bff, 1.5);
  rim.position.set(-3, 2, -2);
  scene.add(rim);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.4;
  disposeObject(room);
  pmrem.dispose();
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.12, 0.3, 1.8);
  composer.addPass(bloom);
  const output = new OutputPass();
  composer.addPass(output);
  const abort = new AbortController();
  let disposed = false;
  let loaded = false;
  let radius = 1;
  let visible = true;

  function render() {
    if (!disposed && loaded && visible && !document.hidden) {
      try { composer.render(); } catch { onError(); }
    }
  }
  function resize() {
    if (disposed) return;
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(Math.round(width), Math.round(height), false);
    composer.setSize(Math.round(width), Math.round(height));
    camera.aspect = width / height;
    const limitingFov = Math.min(THREE.MathUtils.degToRad(camera.fov), 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
    camera.position.set(0, 0.05, radius / Math.sin(limitingFov / 2) * 1.07);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    render();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  const intersectionObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; render(); });
  intersectionObserver.observe(canvas);
  const visibilityChanged = () => render();
  document.addEventListener('visibilitychange', visibilityChanged);
  const contextLost = (event: Event) => { event.preventDefault(); if (!disposed) onError(); };
  canvas.addEventListener('webglcontextlost', contextLost);

  const controls: SentinelScene = {
    turn(angle) { pivot.rotation.y += angle; render(); },
    reset() { pivot.rotation.y = 0; render(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      abort.abort();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', visibilityChanged);
      canvas.removeEventListener('webglcontextlost', contextLost);
      disposeObject(pivot);
      environment.dispose();
      bloom.dispose();
      output.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
  resize();
  void (async () => {
    try {
      const response = await fetch(MODEL, { signal: abort.signal });
      if (!response.ok) throw new Error('Model unavailable');
      const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '');
      if (disposed) { disposeObject(gltf.scene); return; }
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) throw new Error('Invalid model bounds');
      gltf.scene.position.sub(sphere.center);
      pivot.add(gltf.scene);
      radius = sphere.radius;
      camera.near = Math.max(radius / 100, 0.001);
      camera.far = radius * 30;
      loaded = true;
      resize();
      if (!disposed) onReady();
    } catch { if (!disposed) onError(); }
  })();
  return controls;
}
