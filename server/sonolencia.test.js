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

test('alarme dispara aos 3000 ms contínuos, nunca antes, e para ao abrir', () => {
  const monitor = createEyeMonitor();
  assert.equal(feed(monitor, closed, 0, 2900).alarm, false);
  assert.deepEqual(monitor.update(closed, 3000), { status: 'alarm', closedMs: 3000, alarm: true });
  assert.equal(feed(monitor, closed, 3100, 4000).alarm, true);
  assert.deepEqual(monitor.update(open, 4100), { status: 'open', closedMs: 0, alarm: false });
  assert.equal(feed(monitor, closed, 4200, 7100).alarm, false);
  assert.equal(monitor.update(closed, 7200).alarm, true);
});

test('piscadas separadas e um olho fechado não se somam', () => {
  const monitor = createEyeMonitor();
  for (let at = 0; at < 10000; at += 500) {
    assert.equal(feed(monitor, closed, at, at + 300).alarm, false);
    assert.equal(monitor.update(open, at + 400).closedMs, 0);
  }
  assert.equal(feed(monitor, { left: 0.95, right: 0.1 }, 10000, 14000).status, 'open');
});

test('rosto perdido, dados inválidos e frames atrasados zeram a contagem', () => {
  for (const sample of [null, { left: NaN, right: 0.9 }, { left: 1.1, right: 0.9 }, { left: 0.9 }]) {
    const monitor = createEyeMonitor();
    feed(monitor, closed, 0, 2900);
    assert.equal(monitor.update(sample, 3000).status, 'unknown');
    assert.equal(feed(monitor, closed, 3100, 6000).alarm, false);
  }
  const monitor = createEyeMonitor();
  feed(monitor, closed, 0, 2900);
  assert.equal(monitor.update(closed, 10000).closedMs, 0);
  assert.equal(monitor.update(closed, 9900).closedMs, 0);
  assert.equal(monitor.update(closed, NaN).status, 'unknown');
});

test('reset limpa o alarme e histerese tolera pequenas oscilações', () => {
  const monitor = createEyeMonitor();
  feed(monitor, closed, 0, 3000);
  assert.equal(monitor.update({ left: 0.5, right: 0.5 }, 3100).alarm, true);
  assert.equal(monitor.update({ left: 0.3, right: 0.5 }, 3200).alarm, false);
  feed(monitor, closed, 3300, 6300);
  monitor.reset();
  assert.equal(monitor.update(closed, 6400).closedMs, 0);
});

test('sensibilidade ajusta o fechamento mantendo duração de 3 segundos', () => {
  const high = createEyeMonitor(0.45), low = createEyeMonitor(0.65);
  const sample = { left: 0.5, right: 0.5 };
  assert.equal(feed(high, sample, 0, 3000).alarm, true);
  assert.equal(feed(low, sample, 0, 5000).status, 'open');
});

test('endereço próprio de sonolência preserva as rotas existentes', () => {
  assert.equal(parseAppLocation('/sonolencia/').page, 'sonolencia');
  assert.equal(formatAppUrl({ page: 'sonolencia', caso: 'old' }), '/sonolencia');
  for (const page of ['sompo', 'laboratorio', 'luca-ai', 'admin']) {
    assert.equal(formatAppUrl(parseAppLocation(`/${page}`)), `/${page}`);
  }
});
