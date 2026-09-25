import * as THREE from 'three';
import { boxAt, merge, roundedBoxAt } from './geometry';
import { beamTexture, farmlandTexture, floorTextures, plateTexture, rulerTexture, seeded, waferTexture, whiteboardTexture } from './textures';

/**
 * Sala do laboratório: piso polido, parede de ripas, janela grande para a
 * lavoura no fim de tarde, bancada com régua gravada, mesa XY de precisão
 * para o chip, luminária de anel e os objetos de cena (wafer, quadro, vasos).
 * O sol entra baixo pela janela: os caixilhos desenham listras na bancada.
 */

export const BENCH = Object.freeze({ y: 1.05, w: 15.4, d: 4.3, t: 0.14 });
export const ROOM = Object.freeze({ back: -9.5, left: -17, right: 17, front: 16, height: 9.4 });
const WINDOW = Object.freeze({ x0: -12.5, x1: 12.5, y0: 1.2, y1: 7.9 });
export const STAGE = Object.freeze({ x: 0.55, z: 0.05, top: BENCH.y + 0.47 });
export const SUN_DIRECTION = new THREE.Vector3(0.42, -0.2, 1).normalize();

export interface RoomMaterials {
  anodized: THREE.MeshStandardMaterial;
  brushed: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
}

export interface Room {
  group: THREE.Group;
  sky: THREE.Mesh;
  anchors: Record<string, THREE.Object3D>;
  update(elapsed: number): void;
  dispose(): void;
}

function pottedPlant(random: () => number, material: THREE.Material, trunk: THREE.Material, scale: number) {
  const tree = new THREE.Group();
  const height = (2.2 + random() * 1.6) * scale;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * scale, 0.18 * scale, height, 6), trunk);
  stem.position.y = height / 2;
  tree.add(stem);
  const blobs = 3 + Math.floor(random() * 3);
  for (let i = 0; i < blobs; i++) {
    const radius = (0.9 + random() * 0.8) * scale;
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 1), material);
    blob.position.set((random() - 0.5) * 1.4 * scale, height + (random() - 0.2) * 1.2 * scale, (random() - 0.5) * 1.2 * scale);
    blob.scale.y = 0.8;
    tree.add(blob);
  }
  return tree;
}

export function createRoom(materials: RoomMaterials): Room {
  const group = new THREE.Group();
  group.name = 'lab-room';
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(item: T) => { disposables.push(item); return item; };
  const anchors: Record<string, THREE.Object3D> = {};
  const anchor = (name: string, x: number, y: number, z: number) => {
    const object = new THREE.Object3D();
    object.position.set(x, y, z);
    group.add(object);
    anchors[name] = object;
  };
  const random = seeded(2026);

  // ------------------------------------------------------------------ piso
  const floor = floorTextures();
  track(floor.map); track(floor.roughness);
  const floorMaterial = track(new THREE.MeshPhysicalMaterial({
    map: floor.map, roughnessMap: floor.roughness, roughness: 0.62, metalness: 0, color: 0x6d6a66,
    clearcoat: 0.45, clearcoatRoughness: 0.16, envMapIntensity: 0.55,
  }));
  const floorMesh = new THREE.Mesh(track(new THREE.PlaneGeometry(ROOM.right - ROOM.left, ROOM.front - ROOM.back)), floorMaterial);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set(0, 0, (ROOM.front + ROOM.back) / 2);
  floorMesh.receiveShadow = true;
  group.add(floorMesh);

  // ---------------------------------------------------- paredes e janela
  const wallMaterial = track(new THREE.MeshStandardMaterial({ color: 0x1d2027, roughness: 0.82, metalness: 0.05 }));
  const slatMaterial = track(new THREE.MeshStandardMaterial({ color: 0x3a2e25, roughness: 0.62, metalness: 0.02 }));
  const frameMaterial = track(new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.45, metalness: 0.6 }));
  const wallParts: THREE.BufferGeometry[] = [
    // Parede do fundo, recortada ao redor da janela.
    boxAt(ROOM.right - ROOM.left, WINDOW.y0, 0.3, 0, 0, ROOM.back),
    boxAt(ROOM.right - ROOM.left, ROOM.height - WINDOW.y1, 0.3, 0, WINDOW.y1, ROOM.back),
    boxAt(WINDOW.x0 - ROOM.left, WINDOW.y1 - WINDOW.y0, 0.3, (ROOM.left + WINDOW.x0) / 2, WINDOW.y0, ROOM.back),
    boxAt(ROOM.right - WINDOW.x1, WINDOW.y1 - WINDOW.y0, 0.3, (ROOM.right + WINDOW.x1) / 2, WINDOW.y0, ROOM.back),
    // Laterais, frente e teto.
    boxAt(0.3, ROOM.height, ROOM.front - ROOM.back, ROOM.left, 0, (ROOM.front + ROOM.back) / 2),
    boxAt(0.3, ROOM.height, ROOM.front - ROOM.back, ROOM.right, 0, (ROOM.front + ROOM.back) / 2),
    boxAt(ROOM.right - ROOM.left, ROOM.height, 0.3, 0, 0, ROOM.front),
    boxAt(ROOM.right - ROOM.left, 0.3, ROOM.front - ROOM.back, 0, ROOM.height, (ROOM.front + ROOM.back) / 2),
  ];
  const walls = new THREE.Mesh(track(merge(wallParts)), wallMaterial);
  walls.castShadow = walls.receiveShadow = true;
  group.add(walls);

  // Ripas verticais de madeira escura nas laterais.
  const slatParts: THREE.BufferGeometry[] = [];
  for (let z = ROOM.back + 0.6; z < ROOM.front - 0.4; z += 0.34) {
    slatParts.push(boxAt(0.12, ROOM.height - 0.4, 0.2, ROOM.left + 0.2, 0.2, z));
    slatParts.push(boxAt(0.12, ROOM.height - 0.4, 0.2, ROOM.right - 0.2, 0.2, z));
  }
  const slats = new THREE.Mesh(track(merge(slatParts)), slatMaterial);
  slats.receiveShadow = true;
  group.add(slats);

  // Caixilhos: montantes e travessa. São eles que riscam a luz na bancada.
  const mullionParts: THREE.BufferGeometry[] = [
    boxAt(WINDOW.x1 - WINDOW.x0 + 0.3, 0.2, 0.4, 0, WINDOW.y0 - 0.1, ROOM.back),
    boxAt(WINDOW.x1 - WINDOW.x0 + 0.3, 0.2, 0.4, 0, WINDOW.y1 - 0.1, ROOM.back),
    boxAt(WINDOW.x1 - WINDOW.x0, 0.14, 0.3, 0, 6.1, ROOM.back),
  ];
  for (let i = 0; i <= 7; i++) {
    const x = WINDOW.x0 + ((WINDOW.x1 - WINDOW.x0) * i) / 7;
    mullionParts.push(boxAt(i === 0 || i === 7 ? 0.3 : 0.14, WINDOW.y1 - WINDOW.y0, 0.36, x, WINDOW.y0, ROOM.back));
  }
  const mullions = new THREE.Mesh(track(merge(mullionParts)), frameMaterial);
  mullions.castShadow = mullions.receiveShadow = true;
  group.add(mullions);

  // Teto: calhas de LED lineares.
  const ledMaterial = track(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdfe9ff).multiplyScalar(1.6) }));
  const ledParts: THREE.BufferGeometry[] = [];
  for (const z of [-4.5, 1.5, 7.5]) ledParts.push(boxAt(18, 0.05, 0.16, 0, ROOM.height - 0.28, z));
  const ceilingLeds = new THREE.Mesh(track(merge(ledParts)), ledMaterial);
  group.add(ceilingLeds);
  const housingParts: THREE.BufferGeometry[] = [];
  for (const z of [-4.5, 1.5, 7.5]) housingParts.push(boxAt(18.3, 0.12, 0.32, 0, ROOM.height - 0.25, z));
  const housings = new THREE.Mesh(track(merge(housingParts)), frameMaterial);
  group.add(housings);

  // ------------------------------------------------------ lá fora: a fazenda
  const skyUniforms = {
    uSun: { value: SUN_DIRECTION.clone().negate() },
    uTime: { value: 0 },
  };
  const skyMaterial = track(new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uSun; varying vec3 vDir;
      void main(){
        float h = clamp(vDir.y, -0.1, 1.0);
        vec3 horizon = vec3(1.0, 0.62, 0.34);
        vec3 mid = vec3(0.54, 0.6, 0.78);
        vec3 zenith = vec3(0.12, 0.2, 0.38);
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
        col = mix(col, zenith, smoothstep(0.2, 0.75, h));
        float sun = max(dot(normalize(vDir), normalize(uSun)), 0.0);
        col += vec3(1.0, 0.7, 0.4) * pow(sun, 8.0) * 0.8;
        col += vec3(1.0, 0.86, 0.62) * pow(sun, 380.0) * 22.0;
        col *= 0.95;
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  const sky = new THREE.Mesh(track(new THREE.SphereGeometry(260, 48, 24)), skyMaterial);
  sky.position.set(0, 0, -40);
  group.add(sky);

  const farmland = track(farmlandTexture());
  const fieldMaterial = track(new THREE.MeshStandardMaterial({ map: farmland, roughness: 0.95, color: 0xd8c9a6 }));
  const field = new THREE.Mesh(track(new THREE.PlaneGeometry(420, 240)), fieldMaterial);
  field.rotation.x = -Math.PI / 2;
  field.position.set(0, -0.4, -130);
  field.receiveShadow = true;
  group.add(field);

  // Serras em camadas, cada vez mais azuladas pela distância.
  const ridgeColors = [0x6d7a5c, 0x7d88a0, 0x9aa3bd];
  for (const [layer, color] of ridgeColors.entries()) {
    const distance = 70 + layer * 55;
    const points: THREE.Vector2[] = [];
    const width = 520;
    for (let i = 0; i <= 60; i++) {
      const x = -width / 2 + (width * i) / 60;
      const y = 4 + layer * 5 + Math.sin(i * 0.37 + layer) * (3 + layer * 2) + Math.sin(i * 1.13 + layer * 3) * 1.6 + random() * 1.2;
      points.push(new THREE.Vector2(x, y));
    }
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, -2);
    points.forEach((point) => shape.lineTo(point.x, point.y));
    shape.lineTo(width / 2, -2);
    const ridge = new THREE.Mesh(track(new THREE.ShapeGeometry(shape)), track(new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.05), fog: false })));
    ridge.position.set(0, -0.5, ROOM.back - distance);
    group.add(ridge);
  }

  // Silos, galpão, pivô de irrigação e eucaliptos.
  const siloMaterial = track(new THREE.MeshStandardMaterial({ color: 0xc9ccd0, metalness: 0.7, roughness: 0.38 }));
  const barnMaterial = track(new THREE.MeshStandardMaterial({ color: 0x8c3b2e, roughness: 0.8 }));
  const roofMaterial = track(new THREE.MeshStandardMaterial({ color: 0x5b5f66, metalness: 0.5, roughness: 0.5 }));
  const farm = new THREE.Group();
  farm.position.set(-24, -0.4, -44);
  for (const [i, x] of [0, 4.6, 9.2].entries()) {
    const silo = new THREE.Mesh(track(new THREE.CylinderGeometry(2, 2, 11 + i, 24)), siloMaterial);
    silo.position.set(x, (11 + i) / 2, 0);
    const top = new THREE.Mesh(track(new THREE.ConeGeometry(2.1, 1.8, 24)), siloMaterial);
    top.position.set(x, 11 + i + 0.9, 0);
    silo.castShadow = top.castShadow = true;
    farm.add(silo, top);
  }
  const barn = new THREE.Mesh(track(new THREE.BoxGeometry(12, 5, 8)), barnMaterial);
  barn.position.set(20, 2.5, 3);
  const roof = new THREE.Mesh(track(new THREE.CylinderGeometry(4.6, 4.6, 12.4, 3, 1, false, 0, Math.PI)), roofMaterial);
  roof.rotation.z = Math.PI / 2;
  roof.rotation.y = Math.PI / 2;
  roof.position.set(20, 5, 3);
  roof.scale.set(1, 1, 0.5);
  farm.add(barn, roof);
  group.add(farm);

  // Pivô central: treliça longa sobre torres com rodas.
  const pivot = new THREE.Group();
  pivot.position.set(34, -0.4, -70);
  pivot.rotation.y = -0.5;
  const trussMaterial = track(new THREE.MeshStandardMaterial({ color: 0xd9dde2, metalness: 0.8, roughness: 0.35 }));
  const trussParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const x = -i * 9;
    trussParts.push(boxAt(0.3, 4, 0.3, x, 0, 0));
    trussParts.push(boxAt(9, 0.2, 0.2, x - 4.5, 4, 0));
    for (let k = 0; k < 4; k++) trussParts.push(boxAt(0.12, 1.6, 0.12, x - 1 - k * 2.2, 2.6, 0));
  }
  const truss = new THREE.Mesh(track(merge(trussParts)), trussMaterial);
  truss.castShadow = true;
  pivot.add(truss);
  group.add(pivot);

  // Árvores da janela: os mesmos billboards botânicos do simulador SOMPO em
  // cards cruzados. Os icosaedros facetados de antes liam como jogo low-poly
  // contra a sala fotográfica. Um InstancedMesh por espécie, dois draw calls.
  const cardGeometry = track(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0));
  const crossGeometry = track(merge([cardGeometry.clone(), cardGeometry.clone().rotateY(Math.PI / 2)]));
  const treeRows: [string, [number, number, number][]][] = [
    ['eucalyptus', []],
    ['jacaranda', [[-9, -14, 1.3], [8.5, -15.5, 1.5], [15, -13, 1.1], [-15.5, -16, 1.4], [2.5, -19, 1.2]]],
  ];
  for (let i = 0; i < 26; i++) treeRows[0][1].push([-60 + i * 4.8 + random() * 2, -34 - random() * 6, 1.4 + random() * 0.8]);
  const trees = new THREE.Group();
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), tint = new THREE.Color();
  for (const [species, slots] of treeRows) {
    // Luz de céu na copa (emissivo baixo): contra o sol baixo a folhagem ficava
    // um recorte preto; de fora, o céu ainda ilumina as folhas por baixo.
    const material = track(new THREE.MeshStandardMaterial({ color: 0xa3ac7d, roughness: 0.95, alphaTest: 0.4, side: THREE.DoubleSide, emissive: 0x1f2718, emissiveIntensity: 1 }));
    if (typeof document !== 'undefined') {
      new THREE.TextureLoader().load(`/models/sompo/generated-${species}-billboard.webp`, (map) => {
        map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
        material.map = track(map); material.needsUpdate = true;
      });
    }
    const mesh = new THREE.InstancedMesh(crossGeometry, material, slots.length);
    mesh.name = `window-trees-${species}`;
    slots.forEach(([x, z, s], i) => {
      // Eucalipto é alto e esguio; jacarandá de sombra, mais largo.
      const h = (species === 'eucalyptus' ? 7.5 : 3.6) * s * (0.85 + random() * 0.3);
      const w = h * (species === 'eucalyptus' ? 0.42 : 0.9);
      quaternion.setFromAxisAngle(up, random() * Math.PI);
      matrix.compose(new THREE.Vector3(x, -0.5, z), quaternion, new THREE.Vector3(w, h, w));
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, tint.setHSL(0.24 + random() * 0.04, 0.3, 0.55 + random() * 0.12));
    });
    trees.add(mesh);
  }
  group.add(trees);

  // Feixes de luz com poeira: planos aditivos inclinados como o sol.
  const beam = track(beamTexture());
  const beamMaterial = track(new THREE.MeshBasicMaterial({
    map: beam, color: new THREE.Color(1, 0.78, 0.52).multiplyScalar(0.035), transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  const beams = new THREE.Group();
  // Cada feixe é uma lâmina que contém a direção do sol e o eixo x: vista de
  // frente, a pilha de lâminas em alturas diferentes lê como volume.
  const along = SUN_DIRECTION.clone();
  const across = new THREE.Vector3(1, 0, 0).addScaledVector(along, -along.x).normalize();
  const normal = new THREE.Vector3().crossVectors(across, along).normalize();
  const basis = new THREE.Matrix4().makeBasis(across, along, normal);
  const shaftGeometry = track(new THREE.PlaneGeometry(2.6, 15).translate(0, 7.5, 0));
  for (let i = 0; i < 7; i++) {
    for (const [k, y] of [3.1, 4.6, 6.2].entries()) {
      const shaft = new THREE.Mesh(shaftGeometry, beamMaterial);
      shaft.position.set(WINDOW.x0 + 1.78 + i * 3.57, y, ROOM.back + 0.2);
      shaft.quaternion.setFromRotationMatrix(basis);
      shaft.scale.set(1, 0.85 + k * 0.1, 1);
      beams.add(shaft);
    }
  }
  group.add(beams);

  // --------------------------------------------------------------- bancada
  const benchTopMaterial = track(new THREE.MeshPhysicalMaterial({ color: 0x1b1e24, roughness: 0.46, metalness: 0.15, clearcoat: 0.22, clearcoatRoughness: 0.35 }));
  const benchTop = new THREE.Mesh(track(roundedBoxAt(BENCH.w, BENCH.t, BENCH.d, 0, BENCH.y - BENCH.t / 2, 0, 0.03, 3)), benchTopMaterial);
  benchTop.castShadow = benchTop.receiveShadow = true;
  group.add(benchTop);
  const legParts: THREE.BufferGeometry[] = [];
  for (const x of [-BENCH.w / 2 + 0.5, -2.2, 2.4, BENCH.w / 2 - 0.5]) {
    for (const z of [-BENCH.d / 2 + 0.35, BENCH.d / 2 - 0.35]) legParts.push(boxAt(0.14, BENCH.y - BENCH.t, 0.14, x, 0, z));
  }
  legParts.push(boxAt(BENCH.w - 0.9, 0.1, 0.1, 0, 0.35, -BENCH.d / 2 + 0.35));
  legParts.push(boxAt(BENCH.w - 0.9, 0.1, 0.1, 0, 0.35, BENCH.d / 2 - 0.35));
  const benchLegs = new THREE.Mesh(track(merge(legParts)), materials.anodized);
  benchLegs.castShadow = true;
  group.add(benchLegs);
  // Painel frontal com a plaqueta, e o avental com a régua.
  const apron = new THREE.Mesh(track(boxAt(BENCH.w - 0.2, 0.32, 0.08, 0, BENCH.y - BENCH.t - 0.32, BENCH.d / 2 - 0.1)), materials.anodized);
  apron.castShadow = true;
  group.add(apron);
  const ruler = track(rulerTexture());
  const rulerMesh = new THREE.Mesh(track(new THREE.PlaneGeometry(BENCH.w - 0.4, 0.1)), track(new THREE.MeshStandardMaterial({ map: ruler, roughness: 0.4, metalness: 0.6 })));
  rulerMesh.position.set(0, BENCH.y - BENCH.t / 2, BENCH.d / 2 + 0.002);
  group.add(rulerMesh);
  const rail = new THREE.Mesh(track(boxAt(BENCH.w - 0.6, 0.03, 0.08, 0, BENCH.y, BENCH.d / 2 - 0.18)), materials.brushed);
  rail.receiveShadow = true;
  group.add(rail);
  const plate = track(plateTexture('LUCA-AI', 'LAB DE SENSORES · SOMPO'));
  const plateMesh = new THREE.Mesh(track(new THREE.PlaneGeometry(1.4, 0.35)), track(new THREE.MeshStandardMaterial({ map: plate, metalness: 0.7, roughness: 0.3 })));
  plateMesh.position.set(-5.6, BENCH.y - BENCH.t - 0.16, BENCH.d / 2 - 0.055);
  group.add(plateMesh);

  // ----------------------------------------------- mesa XY do chip e luminária
  const stage = new THREE.Group();
  stage.position.set(STAGE.x, BENCH.y, STAGE.z);
  group.add(stage);
  const stageBase = new THREE.Mesh(track(roundedBoxAt(4.3, 0.26, 4.3, 0, 0.13, 0, 0.05, 3)), materials.anodized);
  const stageMid = new THREE.Mesh(track(roundedBoxAt(4.0, 0.1, 4.0, 0, 0.31, 0, 0.03, 3)), materials.brushed);
  const stageTop = new THREE.Mesh(track(roundedBoxAt(3.9, 0.08, 3.9, 0, 0.43, 0, 0.02, 3)), materials.anodized);
  for (const mesh of [stageBase, stageMid, stageTop]) { mesh.castShadow = mesh.receiveShadow = true; stage.add(mesh); }
  // Micrômetros nos dois eixos, com anel serrilhado.
  const knurl = track(new THREE.CylinderGeometry(0.16, 0.16, 0.34, 40, 1));
  const barrel = track(new THREE.CylinderGeometry(0.09, 0.09, 0.6, 24));
  for (const [x, z, rot] of [[2.35, 0.9, 0], [-0.9, 2.35, Math.PI / 2]] as const) {
    const micrometer = new THREE.Group();
    const body = new THREE.Mesh(barrel, materials.chrome);
    body.rotation.z = Math.PI / 2;
    body.position.x = 0.3;
    const ring = new THREE.Mesh(knurl, materials.anodized);
    ring.rotation.z = Math.PI / 2;
    ring.position.x = 0.72;
    micrometer.add(body, ring);
    micrometer.position.set(x - 0.2, 0.31, z);
    micrometer.rotation.y = -rot;
    micrometer.traverse((node) => { const mesh = node as THREE.Mesh; if (mesh.isMesh) mesh.castShadow = true; });
    stage.add(micrometer);
  }
  anchor('stage', STAGE.x + 2.1, BENCH.y + 0.3, STAGE.z + 2.1);

  // Luminária de anel num braço vindo de trás.
  const lamp = new THREE.Group();
  lamp.position.set(STAGE.x, BENCH.y, STAGE.z - 2.6);
  const column = new THREE.Mesh(track(new THREE.CylinderGeometry(0.07, 0.09, 4.9, 20)), materials.anodized);
  column.position.y = 2.45;
  const armGeometry = track(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 16));
  armGeometry.rotateX(Math.PI / 2);
  const arm = new THREE.Mesh(armGeometry, materials.anodized);
  arm.position.set(0, 4.85, 1.25);
  const ringHousing = new THREE.Mesh(track(new THREE.TorusGeometry(0.95, 0.09, 16, 96)), materials.anodized);
  ringHousing.rotation.x = Math.PI / 2;
  ringHousing.position.set(0, 4.85, 2.6);
  const ringLight = new THREE.Mesh(track(new THREE.TorusGeometry(0.95, 0.045, 12, 96)), track(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff4e6).multiplyScalar(1.7) })));
  ringLight.rotation.x = Math.PI / 2;
  ringLight.position.set(0, 4.77, 2.6);
  const lampFoot = new THREE.Mesh(track(roundedBoxAt(0.7, 0.08, 0.7, 0, 0.04, 0, 0.02, 2)), materials.anodized);
  for (const mesh of [column, arm, ringHousing, lampFoot]) { mesh.castShadow = true; lamp.add(mesh); }
  lamp.add(ringLight);
  group.add(lamp);

  // ---------------------------------------------------------- objetos de cena
  // Wafer num suporte: o mesmo chip, antes de ser cortado.
  const wafer = track(waferTexture());
  const waferMaterial = track(new THREE.MeshPhysicalMaterial({
    map: wafer, emissiveMap: wafer, emissive: new THREE.Color(0.32, 0.32, 0.36), transparent: true,
    metalness: 0.35, roughness: 0.3, iridescence: 1, iridescenceIOR: 1.6,
    iridescenceThicknessRange: [250, 700], alphaTest: 0.5, side: THREE.DoubleSide,
  }));
  const waferMesh = new THREE.Mesh(track(new THREE.CircleGeometry(0.58, 96)), waferMaterial);
  waferMesh.position.set(-6.5, BENCH.y + 0.72, -1.55);
  waferMesh.rotation.set(-0.12, 0.22, 0);
  waferMesh.castShadow = true;
  group.add(waferMesh);
  const waferStand = new THREE.Mesh(track(merge([
    boxAt(0.9, 0.08, 0.5, 0, 0, 0),
    boxAt(0.08, 0.18, 0.08, 0, 0.08, 0),
  ])), materials.brushed);
  waferStand.position.set(-6.5, BENCH.y, -1.5);
  waferStand.rotation.y = 0.22;
  group.add(waferStand);
  anchor('wafer', -6.5, BENCH.y + 1.35, -1.55);

  // Quadro branco na parede da direita.
  const board = track(whiteboardTexture());
  const boardMesh = new THREE.Mesh(track(new THREE.PlaneGeometry(7.2, 3.6)), track(new THREE.MeshStandardMaterial({ map: board, roughness: 0.3, metalness: 0 })));
  boardMesh.position.set(ROOM.right - 0.36, 3.9, -2.2);
  boardMesh.rotation.y = -Math.PI / 2;
  group.add(boardMesh);
  const boardFrame = new THREE.Mesh(track(merge([
    boxAt(0.06, 0.08, 7.4, 0, -1.84, 0), boxAt(0.06, 0.08, 7.4, 0, 1.76, 0),
    boxAt(0.06, 3.7, 0.08, 0, -1.84, -3.7), boxAt(0.06, 3.7, 0.08, 0, -1.84, 3.7),
  ])), materials.brushed);
  boardFrame.position.set(ROOM.right - 0.33, 3.9, -2.2);
  group.add(boardFrame);

  // Vasos com plantas: copa subdividida e sombreada suave, sem faceta de jogo.
  const leafMaterial = track(new THREE.MeshStandardMaterial({ color: 0x4a7436, roughness: 0.85 }));
  const trunkMaterial = track(new THREE.MeshStandardMaterial({ color: 0x6b5140, roughness: 0.9 }));
  const potMaterial = track(new THREE.MeshStandardMaterial({ color: 0xd9d3c7, roughness: 0.7 }));
  for (const [x, z, s] of [[10.6, 3.2, 1], [-11.8, -4.8, 1.3], [12.8, -6.5, 1.1]] as const) {
    const pot = new THREE.Mesh(track(new THREE.CylinderGeometry(0.5 * s, 0.38 * s, 0.9 * s, 16)), potMaterial);
    pot.position.set(x, 0.45 * s, z);
    pot.castShadow = pot.receiveShadow = true;
    group.add(pot);
    const plant = pottedPlant(random, leafMaterial, trunkMaterial, 0.55 * s);
    plant.position.set(x, 0.85 * s, z);
    plant.traverse((node: THREE.Object3D) => { const mesh = node as THREE.Mesh; if (mesh.isMesh) { track(mesh.geometry); mesh.castShadow = true; } });
    group.add(plant);
  }

  // Poeira nos feixes.
  const dustCount = 700;
  const dustPositions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPositions[i * 3] = -10 + random() * 20;
    dustPositions[i * 3 + 1] = 0.4 + random() * 7;
    dustPositions[i * 3 + 2] = ROOM.back + 1 + random() * 12;
  }
  const dustGeometry = track(new THREE.BufferGeometry());
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMaterial = track(new THREE.PointsMaterial({ color: new THREE.Color(1, 0.86, 0.66).multiplyScalar(0.9), size: 0.026, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  group.add(dust);

  return {
    group,
    sky,
    anchors,
    update(elapsed: number) {
      dust.position.y = Math.sin(elapsed * 0.07) * 0.2;
      dust.position.x = Math.sin(elapsed * 0.05) * 0.35;
      dust.rotation.y = Math.sin(elapsed * 0.03) * 0.02;
    },
    dispose() {
      disposables.forEach((item) => item.dispose());
    },
  };
}
