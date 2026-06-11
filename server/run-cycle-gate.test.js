import test from 'node:test';
import assert from 'node:assert/strict';

import { createSingleFlightLoop } from './run-cycle-gate.js';

test('single-flight gate coalesces concurrent triggers into one run', async () => {
  let calls = 0;
  let release;
  const started = new Promise((resolve) => {
    release = resolve;
  });

  const gate = createSingleFlightLoop(async () => {
    calls += 1;
    await started;
  });

  const first = gate.trigger();
  const second = gate.trigger();
  const third = gate.trigger();

  assert.equal(gate.isRunning(), true);
  assert.equal(calls, 1);
  assert.equal(first, second);
  assert.equal(second, third);

  release();
  await first;
  assert.equal(calls, 2);
  assert.equal(gate.isRunning(), false);
});

test('single-flight gate reruns once after in-flight task settles', async () => {
  const order = [];
  let releaseFirst;
  let firstRun = true;

  const gate = createSingleFlightLoop(async () => {
    order.push(firstRun ? 'first:start' : 'second:start');
    if (firstRun) {
      firstRun = false;
      await new Promise((resolve) => {
        releaseFirst = () => {
          order.push('first:end');
          resolve();
        };
      });
      return;
    }
    order.push('second:end');
  });

  const pending = gate.trigger();
  gate.trigger();
  releaseFirst();
  await pending;

  assert.deepEqual(order, ['first:start', 'first:end', 'second:start', 'second:end']);
  assert.equal(gate.isRunning(), false);
});
