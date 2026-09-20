import assert from 'node:assert/strict';
import test from 'node:test';
import { createEyeMonitor } from '../src/sonolencia/eye-state.js';
import { parseAppLocation, formatAppUrl } from '../shared/app-location.js';

const closed = { left: 0.9, right: 0.9 };
const open = { left: 0.1, right: 0.1 };
function feed(monitor, sample, from, to) {
  let reading;
  for (let at = from; at <= to; at += 100) reading = monitor.update(sample, at);
  return reading;
}

test('alarme dispara aos 1000 ms contínuos, nunca antes, e para ao abrir', () => {
  const monitor = createEyeMonitor();
  assert.equal(feed(monitor, closed, 0, 900).alarm, false);
  assert.deepEqual(monitor.update(closed, 1000), { status: 'alarm', closedMs: 1000, alarm: true });
  assert.equal(feed(monitor, closed, 1100, 1500).alarm, true);
  assert.deepEqual(monitor.update(open, 1600), { status: 'open', closedMs: 0, alarm: false });
  assert.equal(feed(monitor, closed, 1700, 2600).alarm, false);
  assert.equal(monitor.update(closed, 2700).alarm, true);
});

test('piscadas separadas e um olho fechado não se somam', () => {
  const monitor = createEyeMonitor();
  for (let at = 0; at < 10000; at += 500) {
    assert.equal(feed(monitor, closed, at, at + 300).alarm, false);
    assert.equal(monitor.update(open, at + 400).closedMs, 0);
  }
  assert.equal(feed(monitor, { left: 0.95, right: 0.1 }, 10000, 14000).status, 'open');
});

test('diferença moderada entre os olhos ainda conta como fechamento bilateral', () => {
  const monitor = createEyeMonitor();
  const asymmetricClosed = { left: 0.72, right: 0.42 };
  assert.equal(feed(monitor, asymmetricClosed, 0, 900).alarm, false);
  assert.equal(monitor.update(asymmetricClosed, 1000).alarm, true);
  assert.equal(monitor.update({ left: 0.9, right: 0.1 }, 1100).alarm, false);
});

test('um único frame ruidoso não apaga um fechamento sustentado', () => {
  const monitor = createEyeMonitor();
  feed(monitor, closed, 0, 400);
  assert.equal(monitor.update({ left: 0.38, right: 0.39 }, 500).status, 'closed');
  assert.equal(feed(monitor, closed, 600, 900).alarm, false);
  assert.equal(monitor.update(closed, 1000).alarm, true);
});

test('leituras marginais sustentadas não viram alerta', () => {
  const monitor = createEyeMonitor();
  monitor.update(closed, 0);
  assert.equal(monitor.update({ left: 0.38, right: 0.39 }, 100).status, 'closed');
  assert.equal(monitor.update({ left: 0.38, right: 0.39 }, 200).status, 'closed');
  assert.deepEqual(monitor.update({ left: 0.38, right: 0.39 }, 400), { status: 'open', closedMs: 0, alarm: false });
});

test('rosto perdido, dados inválidos e frames atrasados zeram a contagem', () => {
  for (const sample of [null, { left: NaN, right: 0.9 }, { left: 1.1, right: 0.9 }, { left: 0.9 }]) {
    const monitor = createEyeMonitor();
    feed(monitor, closed, 0, 900);
    assert.equal(monitor.update(sample, 1000).status, 'unknown');
    assert.equal(feed(monitor, closed, 1100, 2000).alarm, false);
  }
  const monitor = createEyeMonitor();
  feed(monitor, closed, 0, 900);
  assert.equal(monitor.update(closed, 10000).closedMs, 0);
  assert.equal(monitor.update(closed, 9900).closedMs, 0);
  assert.equal(monitor.update(closed, NaN).status, 'unknown');
});

test('reset limpa o alarme e histerese tolera pequenas oscilações', () => {
  const monitor = createEyeMonitor();
  feed(monitor, closed, 0, 1000);
  assert.equal(monitor.update({ left: 0.5, right: 0.5 }, 1100).alarm, true);
  assert.equal(monitor.update({ left: 0.3, right: 0.5 }, 1200).alarm, false);
  feed(monitor, closed, 1300, 2300);
  monitor.reset();
  assert.equal(monitor.update(closed, 2400).closedMs, 0);
});

test('sensibilidade ajusta o fechamento mantendo duração de 1 segundo', () => {
  const high = createEyeMonitor(0.45), low = createEyeMonitor(0.65);
  const sample = { left: 0.5, right: 0.5 };
  assert.equal(feed(high, sample, 0, 1000).alarm, true);
  assert.equal(feed(low, sample, 0, 2000).status, 'open');
});

test('endereço próprio de sonolência preserva as rotas existentes', () => {
  assert.equal(parseAppLocation('/sonolencia/').page, 'sonolencia');
  assert.equal(formatAppUrl({ page: 'sonolencia', caso: 'old' }), '/sonolencia');
  for (const page of ['sompo', 'laboratorio', 'luca-ai', 'admin']) {
    assert.equal(formatAppUrl(parseAppLocation(`/${page}`)), `/${page}`);
  }
});
