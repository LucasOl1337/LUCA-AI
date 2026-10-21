import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { criarRecarregarAposDeploy, CHAVE_RECARGA, JANELA_RECARGA_MS } = await loadFrontendModule('../../src/lib/recarregarAposDeploy.ts');

function memoria() {
  const dados = new Map();
  return {
    dados,
    getItem: (k) => (dados.has(k) ? dados.get(k) : null),
    setItem: (k, v) => { dados.set(k, String(v)); },
    removeItem: (k) => { dados.delete(k); },
  };
}

function evento() {
  return { prevenido: false, preventDefault() { this.prevenido = true; } };
}

test('chunk sumido: recarrega na primeira vez, não na segunda (sem loop)', () => {
  const storage = memoria();
  let recargas = 0;
  let relogio = 1_000;
  const boot1 = criarRecarregarAposDeploy({ storage, recarregar: () => { recargas += 1; }, agora: () => relogio });
  const e1 = evento();
  assert.equal(boot1.aoFalharPreload(e1), true);
  assert.equal(e1.prevenido, true);
  assert.equal(recargas, 1);
  assert.ok(storage.dados.has(CHAVE_RECARGA));

  // A página recarregada (mesma aba, mesmo sessionStorage) falha de novo logo em seguida.
  relogio += 2_000;
  const boot2 = criarRecarregarAposDeploy({ storage, recarregar: () => { recargas += 1; }, agora: () => relogio });
  const e2 = evento();
  assert.equal(boot2.aoFalharPreload(e2), false);
  assert.equal(e2.prevenido, false, 'segunda falha segue como erro, sem engolir');
  assert.equal(recargas, 1);
});

test('boot bem-sucedido limpa a marca e o próximo deploy volta a recarregar', () => {
  const storage = memoria();
  let recargas = 0;
  const r = criarRecarregarAposDeploy({ storage, recarregar: () => { recargas += 1; }, agora: () => 5_000 });
  r.aoFalharPreload(evento());
  r.aoBootOk();
  assert.equal(storage.dados.has(CHAVE_RECARGA), false);
  assert.equal(r.aoFalharPreload(evento()), true);
  assert.equal(recargas, 2);
});

test('marca velha fora da janela não segura o reload; sem storage não recarrega', () => {
  const storage = memoria();
  storage.setItem(CHAVE_RECARGA, '0');
  let recargas = 0;
  const r = criarRecarregarAposDeploy({ storage, recarregar: () => { recargas += 1; }, agora: () => JANELA_RECARGA_MS + 1 });
  assert.equal(r.aoFalharPreload(evento()), true);
  assert.equal(recargas, 1);

  const semStorage = criarRecarregarAposDeploy({ storage: null, recarregar: () => { recargas += 1; } });
  assert.equal(semStorage.aoFalharPreload(evento()), false);
  const quebrado = criarRecarregarAposDeploy({
    storage: { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} },
    recarregar: () => { recargas += 1; },
  });
  assert.equal(quebrado.aoFalharPreload(evento()), false);
  assert.equal(recargas, 1);
});

test('fio: main.tsx ouve vite:preloadError e limpa a marca depois do boot', () => {
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
  assert.match(main, /addEventListener\('vite:preloadError', \(e\) => recargaAposDeploy\.aoFalharPreload\(e\)\)/);
  assert.match(main, /setTimeout\(\(\) => recargaAposDeploy\.aoBootOk\(\), BOOT_OK_MS\)/);
});
