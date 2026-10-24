import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadFrontendModule } from './support/load-frontend-module.js';
// Um bundle só (entrada de teste), para a vista e o fim de visita dividirem o mesmo módulo como no app.
const { encerrarVisita, aoFimDeVisita, CHAVE_CHAT_CIRCUITO, lerVistaTrator, alternarVistaTrator } = await loadFrontendModule('../fixtures/fim-de-visita-entrada.ts');

test('fim de visita apaga o chat da corrida do visitante anterior e só ele', () => {
  const guardado = new Map([[CHAVE_CHAT_CIRCUITO, '{"relatorio":{}}'], ['luca:voz:diagnostico', '1']]);
  encerrarVisita({ removeItem: (k) => guardado.delete(k) });
  assert.equal(guardado.has(CHAVE_CHAT_CIRCUITO), false);
  assert.equal(guardado.get('luca:voz:diagnostico'), '1');
  assert.equal(CHAVE_CHAT_CIRCUITO, 'luca.circuito.chat.v1', 'mesma chave que o ChatCircuito grava');
});

test('próximo visitante começa na vista da cabine, mesmo que o anterior tenha trocado', () => {
  if (lerVistaTrator() === 'cabine') alternarVistaTrator();
  assert.equal(lerVistaTrator(), 'externa');
  encerrarVisita({ removeItem() {} });
  assert.equal(lerVistaTrator(), 'cabine');
});

test('tarefa inscrita roda uma vez por fim de visita e sai ao soltar', () => {
  let n = 0; const soltar = aoFimDeVisita(() => { n++; });
  encerrarVisita(null); encerrarVisita(null); soltar(); encerrarVisita(null);
  assert.equal(n, 2);
});

test('StandPage encerra a visita no mesmo ponto em que encerra a conversa (ida para a Vitrine)', () => {
  const fonte = fs.readFileSync(new URL('../src/pages/StandPage.tsx', import.meta.url), 'utf8');
  const bloco = fonte.slice(fonte.indexOf("Vitrine encerra a conversa anterior"), fonte.indexOf('const agirNoPad'));
  assert.match(bloco, /experienciasAbertas\.current\.clear\(\)/);
  assert.match(bloco, /encerrarVisita\(\)/);
  assert.match(bloco, /modo\.modo === 'simulacao'\) return/, 'Simulação e Site seguem preservando a visita');
});

