import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { retanguloArredondado, manchasEncosta, inclinacaoTerrenoGraus, dentroDosLacos } = await loadFrontendModule('../../src/components/gameplay/formasMapa.ts');
const { ZONAS_TALHAO, geofenceTalhao } = await loadFrontendModule('../../src/components/gameplay/geofenceTalhao.ts');
const { RAMPA_LATERAL } = await loadFrontendModule('../../src/components/gameplay/rampaLateral.ts');

test('zona arredondada só muda o desenho: cobre o retângulo do geofence, que continua decidindo o alerta', () => {
  const anel = ZONAS_TALHAO[0].poligono.rings[0];
  const d = retanguloArredondado(anel, 2.5);
  assert.match(d, /A2\.5,2\.5 0 0 1/);
  const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
  // Pontos de passagem (sem os parâmetros do arco) em tela: z, -x.
  const xs = [], ys = [];
  for (const m of d.matchAll(/[MHVA][^MHVAZ]*/g)) {
    const v = m[0].slice(1).trim().split(/[ ,]+/).map(Number);
    if (m[0][0] === 'M') { xs.push(v[0]); ys.push(v[1]); }
    if (m[0][0] === 'H') xs.push(v[0]);
    if (m[0][0] === 'V') ys.push(v[0]);
    if (m[0][0] === 'A') { xs.push(v[5]); ys.push(v[6]); }
  }
  assert.ok(nums.length > 0);
  const [zMin, zMax, yMin, yMax] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  assert.ok(zMin <= 9 && zMax >= 24 && yMin <= -42 && yMax >= -12, `caixa ${zMin} ${zMax} ${yMin} ${yMax}`);
  // Folga máxima do desenho: r·(1 − 1/√2) ≈ 0,73 m para fora.
  assert.ok(9 - zMin < 0.75 && zMax - 24 < 0.75);
  // O geofence segue sendo o retângulo: canto de fora do arco ainda conta dentro.
  assert.equal(geofenceTalhao({ x: 41.9, z: 23.9, rumoGraus: 0, velocidadeKph: 0 }).nivel, 'dentro');
  assert.equal(geofenceTalhao({ x: 42.3, z: 24.3, rumoGraus: 0, velocidadeKph: 0 }).nivel, 'fora');
});

test('manchas de encosta seguem os limiares 12° e 20° do circuito, sem degraus de célula', () => {
  const { atencao, critica, lacosAtencao, lacosCritica } = manchasEncosta();
  assert.ok(lacosCritica.length >= 1 && lacosAtencao.length >= 1);
  assert.match(critica, /^M[^]*Q[^]*Z$/);
  assert.ok(atencao.length > critica.length);
  // Meio da face plena (22°): crítica. Platô: fora. Pé da rampa: fora.
  const meioX = (RAMPA_LATERAL.plenaX + RAMPA_LATERAL.fimPlenaX) / 2;
  const face = { x: meioX, z: RAMPA_LATERAL.peZ - RAMPA_LATERAL.larguraM / 2 };
  assert.ok(inclinacaoTerrenoGraus(face.x, face.z) >= 20);
  assert.equal(dentroDosLacos(face, lacosCritica), true);
  assert.equal(dentroDosLacos({ x: meioX, z: 0 }, lacosAtencao), false);
  // Amostra da grade: a mancha concorda com a inclinação longe da borda (meia casa da grade).
  let erros = 0, total = 0;
  for (let x = RAMPA_LATERAL.inicioX; x <= RAMPA_LATERAL.fimX; x += 2) {
    for (let z = RAMPA_LATERAL.sopeZ; z <= RAMPA_LATERAL.peZ; z += 0.7) {
      const g = inclinacaoTerrenoGraus(x, z);
      if (Math.abs(g - 20) < 1.5) continue;
      total++;
      if ((g >= 20) !== dentroDosLacos({ x, z }, lacosCritica)) erros++;
    }
  }
  assert.ok(total > 200);
  assert.equal(erros, 0, `${erros}/${total} pontos fora da faixa`);
});
