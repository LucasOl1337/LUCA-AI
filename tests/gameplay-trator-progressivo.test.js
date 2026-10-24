import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';
const { bipeProximidade } = await loadFrontendModule('../../src/components/gameplay/alertaCabine.ts');
const { INICIO_CIRCUITO, ROTA_CIRCUITO, criarCircuito } = await loadFrontendModule('../../src/components/gameplay/circuito.ts');
const { criarMotorGameplay } = await loadFrontendModule('../../src/components/gameplay/motorGameplay.ts');
const { estacasCircuito } = await loadFrontendModule('../../src/components/gameplay/estacasCircuito.ts');

test('cadência aperta continuamente de 400 cm até a iminência, sem trocar timbre', () => {
  const sons = [400, 250, 150, 80, 30, 0].map(bipeProximidade);
  for (let i = 1; i < sons.length; i++) assert.ok(sons[i].intervaloMs < sons[i - 1].intervaloMs);
  assert.equal(sons.at(-1).intervaloMs, 0);
  assert.equal(new Set(sons.map((s) => s.som)).size, 1);
  assert.ok(Math.abs(bipeProximidade(151).intervaloMs - bipeProximidade(150).intervaloMs) < 2);
});

test('todas as placas verticais compartilham posição física e chegada não é obstáculo', () => {
  const placas = INICIO_CIRCUITO.obstaculos.filter((o) => o.tipo === 'estaca');
  assert.deepEqual(placas, estacasCircuito(ROTA_CIRCUITO));
  assert.equal(placas.length, 18);
  assert.ok(!placas.some((p) => p.x === 78 && p.z === 13));
});

test('linha ideal inteira tem largura do trator e margem livre das estacas', () => {
  // Distância exata ponto-segmento: não amostragem nem fuzz.
  const placas = estacasCircuito(ROTA_CIRCUITO);
  const larguraTrator = 2.087;
  for (let i = 1; i < ROTA_CIRCUITO.length; i++) {
    const a = ROTA_CIRCUITO[i - 1], b = ROTA_CIRCUITO[i];
    const dx = b.x - a.x, dz = b.z - a.z;
    for (const p of placas) {
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
      const folga = Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz) - p.raioM;
      assert.ok(folga >= larguraTrator / 2 + 0.5, `trecho ${i}, placa (${p.x},${p.z}), folga ${folga}`);
    }
  }
});

const ACELERA = { acelerador: 1, freio: 0, esterco: 0 };
function dirigir(z) {
  let agora = 0;
  const motor = criarMotorGameplay(() => agora);
  const placa = estacasCircuito(ROTA_CIRCUITO)[2];
  motor.reiniciar({ x: placa.x - 8, z, rumoGraus: 0, tetoKph: 6, obstaculos: [placa] });
  let viuSensor = false, contato = false;
  for (let i = 0; i < 600; i++) {
    agora += 1000 / 60;
    const e = motor.quadro(1 / 60, ACELERA);
    viuSensor ||= e.sensor.eco;
    if (e.contato) { contato = true; break; }
  }
  return { motor, viuSensor, contato };
}

test('dirigir contra placa registra sensor e colisão; passar ao lado não', () => {
  const placa = estacasCircuito(ROTA_CIRCUITO)[2];
  const direto = dirigir(placa.z);
  assert.ok(direto.viuSensor);
  assert.ok(direto.contato);
  const registro = criarCircuito('placa', '2026-10-23T15:00:00Z');
  registro.quadro(direto.motor.ler(), 16, '2026-10-23T15:00:01Z');
  assert.equal(registro.registro.resultado.motivo, 'colisao');
  const lado = dirigir(placa.z + 3);
  assert.equal(lado.viuSensor, false);
  assert.equal(lado.contato, false);
});
