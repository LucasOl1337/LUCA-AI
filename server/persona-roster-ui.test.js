import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const personasPage = readFileSync(new URL('../src/pages/PersonasPage.tsx', import.meta.url), 'utf8');
const lucaAiPage = readFileSync(new URL('../src/pages/LucaAiPage.tsx', import.meta.url), 'utf8');

test('tela de personas separa roster principal do catálogo secundário recolhível', () => {
  assert.match(personasPage, /Roster principal/);
  assert.match(personasPage, /Disponíveis no Yume/);
  assert.match(personasPage, /aria-expanded=\{secondaryExpanded\}/);
  assert.match(personasPage, /Adicionar ao LUCA/);
  assert.match(personasPage, /bloqueadas para execução até serem adicionadas ao LUCA/);
});

test('picker mostra roster antes das secundárias e só preserva importadas em atribuições', () => {
  assert.match(lucaAiPage, /luca-picker-roster-title/);
  assert.match(lucaAiPage, /luca-picker-secondary-panel/);
  assert.match(lucaAiPage, /personas\.filter\(\(persona\) => persona\.imported\)\.map/);
  assert.match(lucaAiPage, /await ensurePersonaImported\(slug\)/);
});
