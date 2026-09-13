/**
 * Camada visual do geofencing na cena agrícola do /sompo (módulo src/geofencing). Pinta as faixas no chão pela
 * mesma grade do motor (bandGrid), tinge o plantio por faixa, apaga pés sobre a água e o galpão, e desenha os
 * contornos dos polígonos do talhão e a lâmina d'água. Devolve um grupo vazio quando o cenário não tem talhão,
 * então a cena dos demais cenários não muda. O palco (createSompoAgriStage) só faz worldRoot.add(...).
 */
import * as THREE from 'three';
import { getSompoAgriScenario } from '../../shared/sompo-agri-scenarios.js';
import { getSompoAgriGeofenceSite, getGeofenceMachine, bandGrid, resolveHazards, type LabGeofenceRules } from '../../shared/geofencing/index.js';
import { polygonContains, type LabPolygon } from '../../shared/lab-telemetry.js';

export interface SompoGeofenceLayerField {
  root: THREE.Object3D;
  groundHeight(x: number, z: number): number;
}

export function createSompoGeofenceLayer({ scenarioId, outcomeId, field, operation }: {
  scenarioId: string;
  outcomeId?: string;
  field: SompoGeofenceLayerField;
  /** Talhão 2 ("Operação real"): também some com o plantio dentro do galpão mapeado. */
  operation: boolean;
}): THREE.Group {
  const geofenceLayer = new THREE.Group();
  geofenceLayer.name = 'sompo-geofence-synthetic';
  const site = getSompoAgriGeofenceSite(scenarioId, outcomeId);
  if (!site) return geofenceLayer;
  const scenario = getSompoAgriScenario(scenarioId);
  const hazards = resolveHazards(site.manifestRules as unknown as LabGeofenceRules, site.polygons as LabPolygon[], getGeofenceMachine(scenario.equipmentId));
  const grid = bandGrid(site.polygons, hazards, 2);
  // Cor por faixa, da mais interna para a mais externa, igual para todo perigo: a faixa diz "quão perto", não "de quê".
  // O perigo em si já está desenhado (contorno, lâmina d'água). Regra 1 do SPEC: a grade que soma a área é a que pinta.
  const BAND_RAMP = [0xd63a2f, 0xe8902c, 0xe9c74a];
  const paint = grid ? new Int32Array(grid.cols * grid.rows).fill(-1) : null;
  // Faixa "dentro" (max_m 0) vira hachura em xadrez, não bloco sólido: dentro do declive o plantio inteiro ficava vermelho.
  const hatch = grid ? new Uint8Array(grid.cols * grid.rows) : null;
  const water = (site.polygons as LabPolygon[]).filter(polygon => polygon.role === 'water');
  if (grid && paint) {
    const center = { x: 0, z: 0 };
    for (let cell = 0; cell < paint.length; cell += 1) {
      if (!grid.inside[cell]) continue;
      center.x = grid.minX + (cell % grid.cols + 0.5) * grid.cellM; center.z = grid.minZ + (Math.floor(cell / grid.cols) + 0.5) * grid.cellM;
      if (water.some(polygon => polygonContains(center, polygon))) continue; // dentro da água é lâmina d'água, não faixa
      let bestMax = Infinity;
      for (let h = 0; h < hazards.length; h += 1) {
        const band = grid.bands[h][cell];
        if (band < 0 || hazards[h].bands[band].max_m >= bestMax) continue;
        bestMax = hazards[h].bands[band].max_m;
        // Perigo de contexto (declive, alertable false) pinta um degrau mais fraco: dentro laranja, borda amarela.
        paint[cell] = BAND_RAMP[Math.min(band + (hazards[h].alertable ? 0 : 1), BAND_RAMP.length - 1)];
        hatch![cell] = bestMax === 0 && ((cell % grid.cols + Math.floor(cell / grid.cols)) & 1) ? 1 : 0;
      }
    }
  }
  const cellAt = (x: number, z: number): number => {
    if (!grid) return -1;
    const col = Math.floor((x - grid.minX) / grid.cellM), row = Math.floor((z - grid.minZ) / grid.cellM);
    return col < 0 || row < 0 || col >= grid.cols || row >= grid.rows ? -1 : row * grid.cols + col;
  };
  if (grid && paint) {
    const { cols, rows, cellM, minX, minZ } = grid;
    const rgba = new Uint8Array(cols * rows * 4);
    for (let row = 0; row < rows; row += 1) for (let col = 0; col < cols; col += 1) {
      const color = paint[row * cols + col];
      if (color < 0) continue;
      // v=0 cai em +Z após a rotação do plano: inverte as linhas da grade.
      const at = ((rows - 1 - row) * cols + col) * 4;
      rgba[at] = color >> 16 & 255; rgba[at + 1] = color >> 8 & 255; rgba[at + 2] = color & 255; rgba[at + 3] = hatch![row * cols + col] ? 60 : 150;
    }
    // O map é liberado por disposeSompoObject(scene) junto com os materiais.
    const texture = new THREE.DataTexture(rgba, cols, rows, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    const width = cols * cellM, depth = rows * cellM;
    const centerX = minX + width / 2, centerZ = minZ + depth / 2;
    const geometry = new THREE.PlaneGeometry(width, depth, cols, rows);
    const vertices = geometry.attributes.position;
    for (let i = 0; i < vertices.count; i += 1) {
      vertices.setZ(i, field.groundHeight(centerX + vertices.getX(i), centerZ - vertices.getY(i)));
    }
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(centerX, 0.05, centerZ);
    mesh.renderOrder = 1;
    geofenceLayer.add(mesh);
  }
  // O plantio cobre o chão onde a máquina anda; cada pé dentro de uma faixa recebe a cor dela (mesma grade) e
  // pés em cima da água somem. Só pós-processa as instâncias: o módulo do plantio do Lucas fica intacto.
  const tint = new THREE.Color(), position = new THREE.Vector3(), matrix = new THREE.Matrix4();
  field.root.getObjectByName('sompo-agri-crop-rows')?.traverse((node) => {
    const strip = node as THREE.InstancedMesh;
    if (!strip.isInstancedMesh) return;
    for (let i = 0; i < strip.count; i += 1) {
      strip.getMatrixAt(i, matrix);
      position.setFromMatrixPosition(matrix);
      if (water.some(polygon => polygonContains(position, polygon)) || (operation && (site.polygons as LabPolygon[]).some(polygon => polygon.category === 'structure' && polygonContains(position, polygon)))) {
        strip.setMatrixAt(i, matrix.makeScale(0, 0, 0));
        continue;
      }
      const cell = cellAt(position.x, position.z);
      const color = cell < 0 ? -1 : paint![cell];
      // A faixa mais interna não tinge o plantio: o relevo (morro, degrau) e a textura do chão já a mostram, e o
      // xadrez vermelho sobre a cultura lia como incêndio. Borda/elevada/atenção continuam tingindo.
      strip.setColorAt(i, color < 0 || color === BAND_RAMP[0] ? tint.setScalar(1) : tint.setHex(color).lerp(tint.clone().setScalar(1), 0.15));
    }
    strip.instanceMatrix.needsUpdate = true;
    if (strip.instanceColor) strip.instanceColor.needsUpdate = true;
  });
  for (const polygon of site.polygons as LabPolygon[]) {
    const ring = polygon.rings[0];
    const color = polygon.role === 'water' ? 0x79b9c0 : polygon.role === 'hazard' ? 0xe6ad52 : 0x73c48c;
    const points: THREE.Vector3[] = [];
    for (let i = 1; i < ring.length; i += 1) {
      const a = ring[i - 1], b = ring[i];
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z)));
      for (let step = 0; step < steps; step += 1) {
        const x = THREE.MathUtils.lerp(a.x, b.x, step / steps);
        const z = THREE.MathUtils.lerp(a.z, b.z, step / steps);
        points.push(new THREE.Vector3(x, field.groundHeight(x, z) + 0.08, z));
      }
    }
    points.push(points[0].clone());
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), polygon.role === 'allowed_area'
      ? new THREE.LineDashedMaterial({ color, dashSize: 1.5, gapSize: 1 })
      : new THREE.LineBasicMaterial({ color }));
    line.computeLineDistances();
    geofenceLayer.add(line);
    if (polygon.role === 'water') {
      // Forma livre (o córrego é um L). Vértice y = -z vira z do mundo após rotateX(-90°).
      const geometry = new THREE.ShapeGeometry(new THREE.Shape(ring.map(point => new THREE.Vector2(point.x, -point.z))));
      geometry.rotateX(-Math.PI / 2);
      const positions = geometry.attributes.position;
      // ponytail: só os vértices do contorno seguem o relevo; +0.3 m cobre o ruído do terreno entre eles.
      for (let i = 0; i < positions.count; i += 1) {
        positions.setY(i, field.groundHeight(positions.getX(i), positions.getZ(i)) + 0.3);
      }
      geofenceLayer.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide,
      })));
    }
  }
  return geofenceLayer;
}
