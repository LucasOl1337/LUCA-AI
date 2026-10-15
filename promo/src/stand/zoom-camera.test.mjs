import assert from 'node:assert/strict';
import test from 'node:test';
import { cameraEm, cursorEm, pulsoEm } from './zoom-camera.ts';
import { paraSrt, trechoEm } from './legendas.ts';

const viewport = { largura: 1920, altura: 1080 };
const rastro = (cliques, cursor = cliques) => ({ viewport, cliques, cursor, marcas: {} });

test('sem clique a câmera fica parada em escala 1', () => {
  assert.deepEqual(cameraEm(3, rastro([], [{ t: 0, x: 100, y: 100 }])), { escala: 1, tx: 0, ty: 0 });
});

test('clique em 2 s aproxima até 2,5 s e volta a 1 depois do ócio', () => {
  const r = rastro([{ t: 2, x: 960, y: 540 }]);
  assert.equal(cameraEm(1.2, r).escala, 1);
  assert.ok(cameraEm(2.5, r).escala > 1.4);
  assert.equal(cameraEm(5, r).escala, 1);
});

test('clique no canto não deixa a borda da captura vazar', () => {
  for (const p of [{ x: 0, y: 0 }, { x: 1920, y: 1080 }]) {
    const { escala, tx, ty } = cameraEm(2.5, rastro([{ t: 2, ...p }]));
    assert.ok(tx <= 0 && ty <= 0);
    assert.ok(tx + 1920 * escala >= 1920 - 1e-6);
    assert.ok(ty + 1080 * escala >= 1080 - 1e-6);
  }
});

test('cursor interpola entre amostras', () => {
  assert.deepEqual(cursorEm(1.5, [{ t: 1, x: 0, y: 0 }, { t: 2, x: 100, y: 50 }]), { x: 50, y: 25 });
});

test('pulso só logo depois do clique', () => {
  assert.equal(pulsoEm(1.9, [{ t: 2, x: 0, y: 0 }]), 0);
  assert.equal(pulsoEm(2, [{ t: 2, x: 0, y: 0 }]), 1);
  assert.equal(pulsoEm(2.5, [{ t: 2, x: 0, y: 0 }]), 0);
});

test('legenda e srt saem da mesma lista', () => {
  const trechos = [{ inicio: 0, fim: 2.5, texto: 'Olá.' }, { inicio: 2.5, fim: 65.25, texto: 'Fim.' }];
  assert.equal(trechoEm(3, trechos).texto, 'Fim.');
  assert.equal(trechoEm(70, trechos), null);
  assert.equal(paraSrt(trechos), '1\n00:00:00,000 --> 00:00:02,500\nOlá.\n\n2\n00:00:02,500 --> 00:01:05,250\nFim.\n');
});
