import * as THREE from 'three';
import { createSompoAgriScene } from '../../src/components/sompo/createSompoAgriScene';
import { loadSompoAgriAsset } from '../../src/components/sompo/loadSompoAgriAsset';
import { getSompoAgriFrame } from '../../shared/sompo-agri-scenarios.js';

declare global {
  interface Window { __sompoAgriReady?: boolean; __sompoAgriError?: string }
}

const canvas = document.querySelector('canvas');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Preview canvas missing');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xacc9cf);
scene.fog = new THREE.FogExp2(0xacc9cf, 0.012);
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 320);
camera.position.set(22, 11.5, 27);
camera.lookAt(0, 2.4, 0);
const focus = new URLSearchParams(location.search).get('focus');

const world = new THREE.Group();
scene.add(world);
scene.add(new THREE.AmbientLight(0xffffff, 0.72));
const field = createSompoAgriScene(world, 'row-crop-field');
const abort = new AbortController();

function headlight(color: number, intensity: number) {
  const light = new THREE.SpotLight(color, intensity, 20, Math.PI / 7, 0.55, 1.4);
  light.position.set(2, 2.1, 0);
  light.target.position.set(10, 0.3, 0);
  light.add(light.target);
  return light;
}

Promise.all([
  loadSompoAgriAsset('tractor', abort.signal),
  loadSompoAgriAsset('harvester', abort.signal),
]).then(([tractor, harvester]) => {
  if (!tractor || !harvester) throw new Error('Agricultural asset load aborted');
  const tractorRig = new THREE.Group();
  tractorRig.name = 'preview-tractor';
  tractorRig.position.set(-7, field.groundHeight(-7, -4), -4);
  tractorRig.rotation.y = -0.12;
  tractorRig.add(tractor, headlight(0xffe8aa, 22));
  world.add(tractorRig);

  const harvesterRig = new THREE.Group();
  harvesterRig.name = 'preview-harvester';
  harvesterRig.position.set(7, field.groundHeight(7, 5.5), 5.5);
  harvesterRig.rotation.y = -0.28;
  harvesterRig.add(harvester, headlight(0xfff0bd, 32));
  world.add(harvesterRig);

  if (focus === 'tractor') {
    harvesterRig.visible = false;
    tractorRig.position.set(0, field.groundHeight(0, 0), 0);
    tractorRig.rotation.y = -0.34;
    camera.position.set(6.8, 3.8, 7.8);
    camera.lookAt(0, 1.55, 0);
  } else if (focus === 'harvester') {
    tractorRig.visible = false;
    harvesterRig.position.set(0, field.groundHeight(0, 0), 0);
    harvesterRig.rotation.y = -0.28;
    camera.position.set(9.8, 5.4, 11.2);
    camera.lookAt(0, 1.9, 0);
  }

  field.update(getSompoAgriFrame('agri-harvest-dust', 9_000, 'clean-pass'));
  window.__sompoAgriReady = true;
}).catch((error) => {
  window.__sompoAgriError = error instanceof Error ? error.message : String(error);
  document.body.dataset.error = window.__sompoAgriError;
});

function render(time: number) {
  const dust = scene.getObjectByName('sompo-agri-dust');
  if (dust) dust.rotation.y = time * 0.00008;
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
