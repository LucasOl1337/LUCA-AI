import * as THREE from 'three';
import './styles.css';

const canvas = document.querySelector('#hero-canvas');

if (canvas) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 2.3, 7.5);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));

  const group = new THREE.Group();
  scene.add(group);

  const brass = new THREE.MeshStandardMaterial({
    color: 0xc9a227,
    metalness: 0.55,
    roughness: 0.32,
    emissive: 0x241904,
    emissiveIntensity: 0.08,
  });
  const sky = new THREE.MeshStandardMaterial({
    color: 0x7fb3d5,
    metalness: 0.18,
    roughness: 0.45,
    emissive: 0x153447,
    emissiveIntensity: 0.22,
  });
  const cream = new THREE.MeshStandardMaterial({
    color: 0xede7d9,
    metalness: 0.08,
    roughness: 0.5,
  });
  const pink = new THREE.MeshStandardMaterial({
    color: 0xe8b7c8,
    metalness: 0.12,
    roughness: 0.48,
    emissive: 0x32101a,
    emissiveIntensity: 0.18,
  });

  const agentPositions = [
    [-2.8, -0.15, -0.2],
    [-1.4, 0.65, 0.25],
    [0, 0.1, 0.05],
    [1.4, 0.65, 0.25],
    [2.8, -0.15, -0.2],
  ];

  const nodeGeometry = new THREE.CapsuleGeometry(0.12, 0.22, 6, 16);
  agentPositions.forEach((position, index) => {
    const node = new THREE.Mesh(nodeGeometry, [brass, sky, cream, pink, sky][index]);
    node.position.set(...position);
    node.rotation.z = index % 2 ? 0.28 : -0.28;
    group.add(node);
  });

  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0xf8fafc,
    transparent: true,
    opacity: 0.3,
  });
  const brassLine = new THREE.LineBasicMaterial({
    color: 0xc9a227,
    transparent: true,
    opacity: 0.6,
  });

  const connections = [
    [0, 2],
    [1, 2],
    [2, 3],
    [2, 4],
    [0, 1],
    [3, 4],
  ];

  connections.forEach(([from, to], index) => {
    const points = [
      new THREE.Vector3(...agentPositions[from]),
      new THREE.Vector3(...agentPositions[to]),
    ];
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), index < 4 ? lineMaterial : brassLine);
    group.add(line);
  });

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.25, 0.006, 8, 160),
    new THREE.MeshBasicMaterial({ color: 0x7fb3d5, transparent: true, opacity: 0.28 })
  );
  ring.rotation.x = Math.PI * 0.5;
  ring.position.y = 0.15;
  group.add(ring);

  const tickGeometry = new THREE.BoxGeometry(0.018, 0.12, 0.018);
  for (let i = 0; i < 48; i += 1) {
    const tick = new THREE.Mesh(tickGeometry, i % 6 === 0 ? brass : cream);
    const angle = (i / 48) * Math.PI * 2;
    tick.position.set(Math.cos(angle) * 2.25, 0.15, Math.sin(angle) * 2.25);
    tick.rotation.y = -angle;
    tick.scale.y = i % 6 === 0 ? 1.5 : 0.75;
    group.add(tick);
  }

  const light = new THREE.DirectionalLight(0xf8fafc, 2.8);
  light.position.set(0, 4, 5);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x7fb3d5, 1.2));

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  let frame = 0;
  function animate() {
    frame += 0.01;
    group.rotation.y = Math.sin(frame * 0.55) * 0.16;
    group.rotation.x = -0.22 + Math.sin(frame * 0.4) * 0.03;
    ring.rotation.z = frame * 0.2;
    group.children.forEach((child, index) => {
      if (child.isMesh && child.geometry.type === 'CapsuleGeometry') {
        child.position.y += Math.sin(frame * 2 + index) * 0.0009;
      }
    });
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  resize();
  animate();
  window.addEventListener('resize', resize);
}

const topbar = document.querySelector('.topbar');
window.addEventListener('scroll', () => {
  topbar?.classList.toggle('is-scrolled', window.scrollY > 16);
});
