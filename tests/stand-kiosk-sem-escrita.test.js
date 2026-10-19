import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

// ADR 0001: no kiosk do /stand o simulador não escreve nada no servidor; no /sompo grava como antes.
const { sompoTelemetryWriter } = await loadFrontendModule('../../src/components/sompo/sompoTelemetryWriter.ts');
const fonte = await readFile(new URL('../src/components/SompoTruckSimulator.tsx', import.meta.url), 'utf8');
const kiosk = await readFile(new URL('../src/components/stand/SimuladorKiosk.tsx', import.meta.url), 'utf8');

test('kiosk não recebe porta de escrita; /sompo recebe as quatro escritas', () => {
  assert.equal(sompoTelemetryWriter({ kiosk: true }), null);
  // Modo Site: /sompo dentro do iframe do /stand também é o totem.
  assert.equal(sompoTelemetryWriter({ kiosk: false, embutido: true }), null);
  assert.equal(sompoTelemetryWriter({ kiosk: true, embutido: false }), null);
  const writer = sompoTelemetryWriter({ kiosk: false, embutido: false });
  for (const metodo of ['postSompoTelemetrySimulation', 'postSompoTelemetryEpisodeStart', 'postSompoTelemetryEpisodeFinish', 'postSompoTelemetryEpisodeFrames']) {
    assert.equal(typeof writer[metodo], 'function', metodo);
  }
});

test('o simulador só escreve pela porta: sem lucaApi direto', () => {
  assert.equal(/\blucaApi\b/.test(fonte), false);
  assert.equal(/\bapiPost\b|method:\s*'POST'|sendBeacon/.test(fonte), false);
  const escritas = fonte.match(/\b(?:writer|porta)\.postSompo\w+/g) ?? [];
  assert.equal((fonte.match(/const porta = writer;/g) ?? []).length, 2, 'porta só existe depois dos guardas !writer');
  assert.ok(escritas.length >= 8, `esperava as 8 escritas pela porta, achei ${escritas.length}`);
});

test('sem porta, nada abre episódio nem envia histórico', () => {
  assert.match(fonte, /async function startEpisodeRun\(\) \{\s*const plan = episodePlan;\s*if \(!writer \|\|/);
  assert.match(fonte, /if \(isFirebase \|\| !writer\) \{\s*pendingSamplesRef\.current = \[\];/);
  assert.match(fonte, /if \(episodeRun\.status !== 'recording' \|\| !writer\) return undefined;/);
  assert.match(fonte, /standStartPendingRef\.current = writer !== null;/);
});

test('o /stand monta o simulador em kiosk', () => {
  assert.match(kiosk, /<SompoTruckSimulator[^>]*\bkiosk\b/);
});
