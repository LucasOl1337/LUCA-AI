import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buscarNoRepo, carregarIndice, montarPromptBase, DOCUMENTOS_PERMITIDOS } from './conhecimento.js';

test('pergunta do aceite traz o fluxo de docs/sompo.md', () => {
  const resultados = buscarNoRepo('como funciona o fluxo do dado até a entrega para os agentes?');
  assert.ok(resultados.length > 0 && resultados.length <= 5);
  assert.ok(resultados.some((r) => r.caminho === 'docs/sompo.md'), JSON.stringify(resultados.map((r) => r.caminho)));
});

test('busca só enxerga a lista branca: código do servidor e deploy ficam fora', () => {
  assert.ok(!DOCUMENTOS_PERMITIDOS.some((doc) => doc.startsWith('server/') || doc.startsWith('deploy/') || doc === 'docs/operacao.md'));
  const indice = carregarIndice();
  const caminhos = new Set(indice.map((t) => t.caminho));
  for (const caminho of caminhos) assert.ok(DOCUMENTOS_PERMITIDOS.includes(caminho), caminho);
});

test('documento ausente é ignorado e consulta vazia não devolve nada', () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'stand-conhecimento-'));
  try {
    fs.writeFileSync(path.join(raiz, 'README.md'), '# LUCA\n\nO trator manda telemetria.\n');
    fs.mkdirSync(path.join(raiz, 'server'));
    fs.writeFileSync(path.join(raiz, 'server/segredo.js'), 'const telemetria = "token interno";\n');
    const indice = carregarIndice({ raiz });
    assert.equal(indice.length, 1);
    const [achado] = buscarNoRepo('telemetria do trator', { indice });
    assert.deepEqual(achado, { caminho: 'README.md', secao: 'LUCA', trecho: '# LUCA\nO trator manda telemetria.' });
    assert.deepEqual(buscarNoRepo('token interno', { indice }), []);
    assert.deepEqual(buscarNoRepo('o que é', { indice }), []);
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
});

test('prompt-base fala com investidor, marca simulação e traz as user stories', () => {
  const prompt = montarPromptBase();
  assert.match(prompt, /investidor/);
  assert.match(prompt, /simulado/);
  assert.match(prompt, /O segurado diz uma coisa\. A telemetria mostra outra\./);
  assert.match(prompt, /tocar_video/);
  assert.ok(prompt.length < 6000, `prompt longo demais: ${prompt.length}`);
});
