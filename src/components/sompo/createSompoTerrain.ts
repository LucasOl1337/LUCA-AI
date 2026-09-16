import * as THREE from 'three';

/**
 * Relevo rural determinístico e periódico em X (período SOMPO_TERRAIN_PERIOD_X).
 * O deslocamento é feito na CPU uma única vez; a malha "recicla" avançando em
 * saltos exatos de um período, então a paisagem é contínua para a câmera e a
 * mesma função `sompoTerrainHeight` posiciona árvores, pedras e lavoura.
 */
export const SOMPO_TERRAIN_PERIOD_X = 160;
export const SOMPO_TERRAIN_LENGTH_X = 440;
export const SOMPO_TERRAIN_WIDTH_Z = 240;

// Hash inteiro (sem seno): idêntico em qualquer precisão, sem drift CPU/GPU.
function latticeHash(ix: number, iz: number) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function periodicNoise(x: number, z: number, cell: number, periodColumns: number) {
  const px = x / cell;
  const pz = z / cell;
  const ix = Math.floor(px);
  const iz = Math.floor(pz);
  const fx = px - ix;
  const fz = pz - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const wrap = (value: number) => ((value % periodColumns) + periodColumns) % periodColumns;
  const corner = (dx: number, dz: number) => latticeHash(wrap(ix + dx), iz + dz);
  return (corner(0, 0) * (1 - ux) * (1 - uz))
    + (corner(1, 0) * ux * (1 - uz))
    + (corner(0, 1) * (1 - ux) * uz)
    + (corner(1, 1) * ux * uz);
}

/** Distância periódica em X. O relevo (e o lago) se repetem com o período do terreno. */
function periodicX(x: number) {
  return ((x % SOMPO_TERRAIN_PERIOD_X) + SOMPO_TERRAIN_PERIOD_X * 1.5) % SOMPO_TERRAIN_PERIOD_X - SOMPO_TERRAIN_PERIOD_X / 2;
}

/**
 * Onde o lago do vale mora: eixo periódico x ≡ −26, z ≈ −100 (lado da lavoura,
 * no azimute que a câmera padrão enxerga à direita do caminhão). A bacia afunda
 * abaixo do nível da pista e a lâmina d'água cobre o fundo.
 */
export const SOMPO_LAKE = { x: -26, z: -100, bedY: -1.4, waterY: 0.55, radius: 24 };

/** Distância horizontal ao centro do lago (já com o wrap periódico em X). */
export function sompoLakeDistance(x: number, z: number) {
  return Math.hypot(periodicX(x - SOMPO_LAKE.x), z - SOMPO_LAKE.z);
}

/** Faixa da rodovia (pista + acostamentos) permanece plana; o campo ondula suave. */
export function sompoTerrainHeight(x: number, z: number) {
  const corridor = Math.abs(z + 2.05);
  const mask = THREE.MathUtils.smoothstep(corridor, 9, 20);
  if (mask <= 0) return 0;
  const broad = (periodicNoise(x, z, 40, SOMPO_TERRAIN_PERIOD_X / 40) * 2) - 1;
  const middle = (periodicNoise(x + 137, z + 29, 16, SOMPO_TERRAIN_PERIOD_X / 16) * 2) - 1;
  const fine = (periodicNoise(x + 37, z + 91, 5, SOMPO_TERRAIN_PERIOD_X / 5) * 2) - 1;
  const amplitude = 1.4 + (THREE.MathUtils.smoothstep(corridor, 26, 100) * 3.4);
  let h = mask * ((broad * amplitude) + (middle * amplitude * 0.35) + (fine * 0.22));
  // Serra ao fundo: crista rolando dos dois lados, abrindo uma forquilha no lago.
  // MathUtils.smoothstep não inverte bordas como o GLSL: máscaras de raio usam 1-smoothstep.
  const lakeX = periodicX(x - SOMPO_LAKE.x);
  const lakeDist = sompoLakeDistance(x, z);
  const notch = 1 - THREE.MathUtils.smoothstep(lakeDist, 14, 36);
  const ridge = THREE.MathUtils.smoothstep(corridor, 45, 95)
    * (2.8 + periodicNoise(x + 501, z + 77, 80, SOMPO_TERRAIN_PERIOD_X / 80) * 6.2
      + periodicNoise(x + 97, z + 11, 32, SOMPO_TERRAIN_PERIOD_X / 32) * 2.4);
  h += ridge * (1 - notch * 0.55);
  // Vale que desce da rodovia até a bacia do lago: linha de visada aberta.
  const valleyWindow = THREE.MathUtils.smoothstep(corridor, 40, 54) * (1 - THREE.MathUtils.smoothstep(corridor, 82, 96));
  const valleyFloor = 0.55 + broad * 0.35;
  h = THREE.MathUtils.lerp(h, valleyFloor, valleyWindow * (1 - THREE.MathUtils.smoothstep(Math.abs(lakeX), 12, 40)) * 0.92);
  // Bacia do lago: o terreno mergulha abaixo do nível d'água no centro.
  h = THREE.MathUtils.lerp(h, SOMPO_LAKE.bedY, 1 - THREE.MathUtils.smoothstep(lakeDist, 11, 30));
  // Broad pasture hill behind the reefer; period matches the infinite road.
  const hillX = periodicX(x - 78);
  h += 6.5 * Math.exp(-(hillX * hillX / 1450 + (z + 65) ** 2 / 1000)) * mask;
  return h;
}

/** Mancha de vegetação (0..1) usada para tingir o solo e adensar tufos. */
export function sompoVegetationDensity(x: number, z: number) {
  return periodicNoise(x + 211, z + 53, 10, SOMPO_TERRAIN_PERIOD_X / 10);
}

export function createSompoTerrainMesh(material: THREE.MeshStandardMaterial) {
  const geometry = new THREE.PlaneGeometry(
    SOMPO_TERRAIN_LENGTH_X,
    SOMPO_TERRAIN_WIDTH_Z,
    Math.round(SOMPO_TERRAIN_LENGTH_X / 4),
    Math.round(SOMPO_TERRAIN_WIDTH_Z / 4),
  );
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(positions.count * 3);
  const dirt = new THREE.Color(1, 1, 1);
  const green = new THREE.Color(0.62, 0.78, 0.5);
  const blend = new THREE.Color();
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    positions.setY(index, sompoTerrainHeight(x, z));
    const grassiness = Math.abs(z + 2.05) < 9 ? 0
      : THREE.MathUtils.clamp((sompoVegetationDensity(x, z) - 0.28) * 2.2, 0, 1);
    blend.copy(dirt).lerp(green, grassiness * 0.85);
    blend.toArray(colors, index * 3);
  }
  positions.needsUpdate = true;
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  material.vertexColors = true;
  const terrain = new THREE.Mesh(geometry, material);
  terrain.name = 'rural-terrain-relief';
  terrain.receiveShadow = true;
  return terrain;
}
