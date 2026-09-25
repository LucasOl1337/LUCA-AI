import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

interface CropSlot { x: number; z: number }

interface CropTile {
  centerX: number;
  slots: CropSlot[];
  nearLeaves: THREE.InstancedMesh;
  nearStructure: THREE.InstancedMesh;
  farLeaves: THREE.InstancedMesh;
  harvestAttributes: THREE.InstancedBufferAttribute[];
}

const seeded = (seed: number) => {
  const value = Math.sin(seed * 127.1 + 21.7) * 43758.5453;
  return value - Math.floor(value);
};

/**
 * Folhas de milho em malha curva. Cada folha tem dobra central, torção,
 * curvatura longitudinal e ponta caída. A versão distante preserva a mesma
 * silhueta com menos folhas e segmentos, em vez de voltar ao quad vertical.
 */
function maizeLeafGeometry(mature: boolean, detailed: boolean) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const flex: number[] = [];
  const indices: number[] = [];
  const leafCount = detailed ? (mature ? 7 : 6) : 3;
  const segments = detailed ? 6 : 2;

  for (let leaf = 0; leaf < leafCount; leaf += 1) {
    const base = mature ? .19 + leaf * .082 : .12 + leaf * .105;
    const reach = (mature ? .31 : .36) + seeded(leaf * 13 + (mature ? 4 : 9)) * .13;
    const lift = (mature ? .42 : .58) + seeded(leaf * 17 + 3) * .12;
    const azimuth = leaf * 2.399963 + seeded(leaf * 29 + 8) * .32;
    const baseWidth = (mature ? .072 : .082) + seeded(leaf * 31 + 11) * .024;
    const vertexBase = positions.length / 3;

    for (let segment = 0; segment <= segments; segment += 1) {
      const t = segment / segments;
      const twist = Math.sin(t * Math.PI) * (.12 + seeded(leaf * 43 + 5) * .12) * (leaf % 2 ? -1 : 1);
      const angle = azimuth + twist;
      const radius = reach * (t + Math.sin(t * Math.PI) * .11);
      const droop = mature ? 1.08 : .72;
      const centerY = base + lift * (t - droop * t * t * .63);
      const taper = Math.max(.025, Math.sin(Math.PI * Math.pow(t, .82)));
      const width = baseWidth * taper;
      for (let column = 0; column < 3; column += 1) {
        const across = column - 1;
        const ridge = column === 1 ? .012 * Math.sin(t * Math.PI) : 0;
        positions.push(
          Math.cos(angle) * radius - Math.sin(angle) * across * width,
          centerY + ridge,
          Math.sin(angle) * radius + Math.cos(angle) * across * width,
        );
        // O recorte ocupa o terço central do atlas-fonte; amostrar só essa
        // faixa evita transformar a folha modelada numa lâmina de 2 cm.
        uvs.push(.35 + column * .16, t);
        flex.push(t);
      }
    }

    for (let segment = 0; segment < segments; segment += 1) {
      for (let column = 0; column < 2; column += 1) {
        const a = vertexBase + segment * 3 + column;
        indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('cropFlex', new THREE.Float32BufferAttribute(flex, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function rodBetween(a: THREE.Vector3, b: THREE.Vector3, radius: number) {
  const direction = b.clone().sub(a);
  const geometry = new THREE.CylinderGeometry(radius * .65, radius, direction.length(), 5, 1, false);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()));
  geometry.translate((a.x + b.x) * .5, (a.y + b.y) * .5, (a.z + b.z) * .5);
  return geometry;
}

/** Colmo e pendão separados permitem material opaco e sombra de contato. */
function maizeStructureGeometry(mature: boolean) {
  const parts: THREE.BufferGeometry[] = [];
  const stemHeight = mature ? .91 : .84;
  const stem = new THREE.CylinderGeometry(mature ? .016 : .021, mature ? .025 : .032, stemHeight, 6, 3, false);
  stem.translate(0, stemHeight / 2, 0);
  parts.push(stem);
  if (mature) {
    const core = rodBetween(new THREE.Vector3(0, .84, 0), new THREE.Vector3(0, 1, 0), .006);
    parts.push(core);
    for (let index = 0; index < 7; index += 1) {
      const angle = index * 2.399963;
      const y = .87 + index * .011;
      parts.push(rodBetween(
        new THREE.Vector3(0, y, 0),
        new THREE.Vector3(Math.cos(angle) * .075, y + .055, Math.sin(angle) * .075),
        .0022,
      ));
    }
  }
  const geometry = mergeGeometries(parts)!;
  parts.forEach(part => part.dispose());
  geometry.computeBoundingSphere();
  return geometry;
}

function configureCropShader(
  material: THREE.MeshStandardMaterial,
  options: {
    leaves: boolean;
    mature: boolean;
    operation: boolean;
    time: { value: number };
    wind: { value: number };
    cut: { value: THREE.Vector3 };
    path: { value: THREE.Vector2[] };
    harvestTime: { value: number };
    cacheKey: string;
  },
) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, {
      cropTime: options.time,
      cropWind: options.wind,
      cropCut: options.cut,
      cropPath: options.path,
      harvestTime: options.harvestTime,
    });
    shader.vertexShader = `${options.operation ? 'attribute float harvestAt; uniform float harvestTime;' : ''}
      ${options.leaves ? 'attribute float cropFlex;' : ''}
      uniform float cropTime,cropWind; uniform vec3 cropCut; uniform vec2 cropPath[8];
      varying float cropHeight; varying float cropTint; varying float cropStubble; varying float cropFacing;
    ` + shader.vertexShader
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        vec3 field=instanceMatrix[3].xyz; float phase=field.x*1.73+field.z*2.41;
        float angle=phase*2.4,ca=cos(angle),sa=sin(angle);
        float normalX=objectNormal.x*ca-objectNormal.z*sa;
        objectNormal.z=objectNormal.x*sa+objectNormal.z*ca; objectNormal.x=normalX;`)
      .replace('#include <begin_vertex>', `
        float h=position.y;
        float plantFlex=${options.leaves ? 'cropFlex' : 'clamp(h,0.,1.)'};
        float w1=sin(cropTime*1.7+phase+field.x*.14+field.z*.11);
        float w2=sin(cropTime*.4+field.x*.02+field.z*.017);
        float bend=cropWind*(.025+.055*(.55+.45*w2)*(.55+.45*w1))*plantFlex*plantFlex;
        float centerZ=cropPath[0].y;
        for(int i=1;i<8;i++) {
          if(field.x>=cropPath[i-1].x) centerZ=mix(cropPath[i-1].y,cropPath[i].y,clamp((field.x-cropPath[i-1].x)/max(.001,cropPath[i].x-cropPath[i-1].x),0.,1.));
        }
        float harvested=(1.-smoothstep(cropCut.x-.18,cropCut.x+.18,field.x))*step(abs(field.z-centerZ),2.72)*step(.001,cropCut.z);
        ${options.operation ? 'harvested=step(harvestAt,harvestTime);' : ''}
        cropHeight=h; cropTint=fract(sin(phase)*43758.5453); cropStubble=harvested;
        vec3 shaped=position;
        float spunX=shaped.x*ca-shaped.z*sa;
        shaped.z=shaped.x*sa+shaped.z*ca; shaped.x=spunX;
        shaped.x+=bend; shaped.z+=bend*.38;
        shaped.y*=1.-harvested*.78; shaped.xz*=1.-harvested*.36;
        vec3 transformed=shaped;`)
      .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
        cropFacing=clamp(-transformedNormal.z*.5+.5,0.,1.);`);
    shader.fragmentShader = 'varying float cropHeight; varying float cropTint; varying float cropStubble; varying float cropFacing;\n' + shader.fragmentShader
      .replace('#include <alphatest_fragment>', `${options.leaves ? 'diffuseColor.rgb/=max(.34,sqrt(max(diffuseColor.a,.001)));' : ''}
        #include <alphatest_fragment>`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        ${options.mature ? `
          float leafLum=dot(diffuseColor.rgb,vec3(.3,.59,.11));
          vec3 straw=mix(vec3(.20,.115,.045),vec3(.86,.57,.22),pow(max(cropHeight,.001),.72));
          straw=mix(straw,vec3(.32,.27,.075),step(.88,cropTint)*.66);
          diffuseColor.rgb=${options.leaves ? 'straw*(.62+leafLum*1.32)' : 'mix(vec3(.28,.19,.07),vec3(.58,.39,.12),cropHeight)'};` : `
          diffuseColor.rgb*=${options.leaves ? 'mix(vec3(.30,.48,.095),vec3(.78,.90,.31),pow(max(cropHeight,.001),.82))' : 'mix(vec3(.20,.31,.065),vec3(.48,.58,.12),cropHeight)'};`}
        diffuseColor.rgb*=.76+cropTint*.38;
        ${options.leaves ? 'diffuseColor.rgb+=mix(vec3(.012,.028,.002),vec3(.075,.125,.018),cropFacing)*pow(1.-cropFacing,1.4);' : ''}
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.46,.30,.105)*(.72+cropTint*.45),cropStubble*.9);`);
  };
  material.customProgramCacheKey = () => options.cacheKey;
}

/**
 * Lavoura instanciada em faixas. Perto da câmera: folhas curvas, colmo e
 * pendão. Longe: impostor geométrico segmentado. O LOD por faixa evita pagar
 * a malha completa nos 50 mil pés da operação de colheita.
 */
export function createSompoCropRows(groundHeight: (x: number, z: number) => number, compact: boolean, height = 1, operation = false, mature = false) {
  const root = new THREE.Group(); root.name = 'sompo-agri-crop-rows';
  const time = { value: 0 }, wind = { value: .65 }, cut = { value: new THREE.Vector3(-1000, 0, 0) };
  const harvestTime = { value: 0 };
  const path = { value: Array.from({ length: 8 }, (_, index) => new THREE.Vector2(-100 + index * 200 / 7, 0)) };
  const leafTextures: THREE.Texture[] = [];

  const nearLeafGeometry = maizeLeafGeometry(mature, true);
  const farLeafGeometry = maizeLeafGeometry(mature, false);
  const structureGeometry = maizeStructureGeometry(mature);
  const leafMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: mature ? .92 : .78, metalness: 0,
    side: THREE.DoubleSide, alphaTest: .38, alphaToCoverage: true,
  });
  const farLeafMaterial = leafMaterial.clone();
  const structureMaterial = new THREE.MeshStandardMaterial({
    color: mature ? 0x9b6b24 : 0x54771d, roughness: .9, metalness: 0,
  });
  configureCropShader(leafMaterial, { leaves: true, mature, operation, time, wind, cut, path, harvestTime, cacheKey: `sompo-maize-leaf-r2-${mature}-${operation}` });
  configureCropShader(farLeafMaterial, { leaves: true, mature, operation, time, wind, cut, path, harvestTime, cacheKey: `sompo-maize-far-r2-${mature}-${operation}` });
  configureCropShader(structureMaterial, { leaves: false, mature, operation, time, wind, cut, path, harvestTime, cacheKey: `sompo-maize-stem-r2-${mature}-${operation}` });

  if (typeof document !== 'undefined' && typeof document.createElementNS === 'function') {
    const loader = new THREE.TextureLoader();
    loader.load('/sompo/gen/maize-leaf-albedo.png', map => {
      map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 16;
      leafTextures.push(map);
      leafMaterial.map = farLeafMaterial.map = map;
      leafMaterial.needsUpdate = farLeafMaterial.needsUpdate = true;
    });
    loader.load('/sompo/gen/maize-leaf-normal.webp', normal => {
      normal.colorSpace = THREE.NoColorSpace; normal.anisotropy = 16;
      leafTextures.push(normal);
      leafMaterial.normalMap = farLeafMaterial.normalMap = normal;
      leafMaterial.normalScale.set(.42, .78); farLeafMaterial.normalScale.set(.28, .54);
      leafMaterial.needsUpdate = farLeafMaterial.needsUpdate = true;
    });
  }

  const tiles: CropTile[] = [];
  const geometries = new Set<THREE.BufferGeometry>([nearLeafGeometry, farLeafGeometry, structureGeometry]);
  const dummy = new THREE.Object3D();
  const columns = compact ? 34 : (operation ? 62 : 58);
  const rows = compact ? (operation ? 58 : 30) : (operation ? 108 : 44);
  for (let tileIndex = 0; tileIndex < 8; tileIndex += 1) {
    const count = columns * rows;
    const detailGeometry = operation ? nearLeafGeometry.clone() : nearLeafGeometry;
    const tileStructureGeometry = operation ? structureGeometry.clone() : structureGeometry;
    const tileFarGeometry = operation ? farLeafGeometry.clone() : farLeafGeometry;
    const harvestAttributes: THREE.InstancedBufferAttribute[] = [];
    if (operation) {
      for (const geometry of [detailGeometry, tileStructureGeometry, tileFarGeometry]) {
        const attribute = new THREE.InstancedBufferAttribute(new Float32Array(count).fill(1e9), 1);
        geometry.setAttribute('harvestAt', attribute); harvestAttributes.push(attribute); geometries.add(geometry);
      }
    }
    const nearLeaves = new THREE.InstancedMesh(detailGeometry, leafMaterial, count);
    const nearStructure = new THREE.InstancedMesh(tileStructureGeometry, structureMaterial, count);
    const farLeaves = new THREE.InstancedMesh(tileFarGeometry, farLeafMaterial, count);
    nearLeaves.name = `crop-detail-leaves-${tileIndex}`;
    nearStructure.name = `crop-detail-stems-${tileIndex}`;
    farLeaves.name = `crop-impostors-${tileIndex}`;
    nearLeaves.castShadow = nearLeaves.receiveShadow = true;
    nearStructure.castShadow = nearStructure.receiveShadow = true;
    farLeaves.receiveShadow = true;
    const slots: CropSlot[] = [];
    const tileSpan = operation ? 20 : 16;
    const startX = operation ? -80 : -64;
    const startZ = operation ? -50 : -12;
    const zSpan = operation ? 96 : 24;
    const centerX = startX + tileIndex * tileSpan + tileSpan * .5;

    for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
      const seed = tileIndex * 719 + row * 31 + column * 17;
      const x = startX + tileIndex * tileSpan + (column + .5) * tileSpan / columns + (seeded(seed + 7) - .5) * .11;
      const z = startZ + (row + .5) * zSpan / rows + (seeded(seed + 13) - .5) * .12;
      const plantHeight = mature
        ? (1.78 + seeded(seed + 19) * .38) * height
        : (2.12 + seeded(seed + 19) * .72) * height;
      const girth = mature
        ? .86 + seeded(seed + 23) * .28
        : .57 + seeded(seed + 23) * .19;
      slots.push({ x, z });
      dummy.position.set(x, groundHeight(x, z), z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(girth, plantHeight, girth);
      dummy.updateMatrix();
      const instance = row * columns + column;
      nearLeaves.setMatrixAt(instance, dummy.matrix);
      nearStructure.setMatrixAt(instance, dummy.matrix);
      farLeaves.setMatrixAt(instance, dummy.matrix);
    }
    for (const mesh of [nearLeaves, nearStructure, farLeaves]) {
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      mesh.computeBoundingSphere();
      if (mesh.boundingSphere) mesh.boundingSphere.radius += 2;
      root.add(mesh);
    }
    tiles.push({ centerX, slots, nearLeaves, nearStructure, farLeaves, harvestAttributes });
  }

  return {
    root,
    setHarvestPath(points: readonly { x: number; z: number; atMs?: number; yaw?: number; harvesting?: boolean }[]) {
      points.slice(0, 8).forEach((point, index) => path.value[index].set(point.x + 4.28, point.z));
      if (!operation) return;
      const cuts = points.filter(point => point.harvesting).map(point => ({
        x: point.x + 4.28 * Math.cos((point.yaw ?? 0) * Math.PI / 180),
        z: point.z - 4.28 * Math.sin((point.yaw ?? 0) * Math.PI / 180),
        at: (point.atMs ?? 0) / 1000,
      }));
      for (const tile of tiles) {
        tile.slots.forEach((slot, index) => {
          const hit = cuts.find(point => (point.x - slot.x) ** 2 + (point.z - slot.z) ** 2 <= 3.8 ** 2);
          for (const attribute of tile.harvestAttributes) attribute.setX(index, hit?.at ?? 1e9);
        });
        tile.harvestAttributes.forEach(attribute => { attribute.needsUpdate = true; });
      }
    },
    update(elapsedMs: number, camera: THREE.Vector3, reducedMotion: boolean, strength = .65, machine?: THREE.Vector3, cropCut = 0) {
      time.value = reducedMotion ? 0 : elapsedMs / 1000;
      wind.value = strength;
      harvestTime.value = elapsedMs / 1000;
      cut.value.set(machine ? machine.x + 4.28 : -1000, machine?.z ?? 0, cropCut);
      for (const tile of tiles) {
        const visible = operation || Math.abs(tile.centerX - camera.x) < 88;
        const detailed = !compact && Math.abs(tile.centerX - camera.x) < 27;
        tile.nearLeaves.visible = visible && detailed;
        tile.nearStructure.visible = visible && detailed;
        tile.farLeaves.visible = visible && !detailed;
      }
    },
    dispose() {
      leafTextures.forEach(texture => texture.dispose());
      geometries.forEach(geometry => geometry.dispose());
      leafMaterial.dispose(); farLeafMaterial.dispose(); structureMaterial.dispose();
    },
  };
}
