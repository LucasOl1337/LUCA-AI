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
  assert.ok(!DOCUMENTOS_PERMITIDOS.some((doc) => doc.startsWith('server/') || doc.startsWith('deploy/') || doc === 'docs/operacao.md' || doc === 'README.md'));
  const indice = carregarIndice();
  const caminhos = new Set(indice.map((t) => t.caminho));
  for (const caminho of caminhos) assert.ok(DOCUMENTOS_PERMITIDOS.includes(caminho), caminho);
});

test('documento ausente é ignorado e consulta vazia não devolve nada', () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'stand-conhecimento-'));
  try {
    fs.writeFileSync(path.join(raiz, 'GLOSSARY.md'), '# LUCA\n\nO trator manda telemetria.\n');
    fs.writeFileSync(path.join(raiz, 'README.md'), '# LUCA\n\nDeploy na VM de produção com telemetria.\n');
    fs.mkdirSync(path.join(raiz, 'server'));
    fs.writeFileSync(path.join(raiz, 'server/segredo.js'), 'const telemetria = "token interno";\n');
    const indice = carregarIndice({ raiz });
    assert.equal(indice.length, 1);
    const [achado] = buscarNoRepo('telemetria do trator', { indice });
    assert.deepEqual(achado, { caminho: 'GLOSSARY.md', secao: 'LUCA', trecho: '# LUCA\nO trator manda telemetria.' });
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
  // 7000 desde 21/10: o painel de comandos ao lado da coruja entrou no prompt (~650 caracteres).
  assert.ok(prompt.length < 7000, `prompt longo demais: ${prompt.length}`);
});

test('prompt-base só anuncia vídeos com mp4 publicado', () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'stand-prompt-'));
  try {
    fs.mkdirSync(path.join(raiz, 'public/stand/videos'), { recursive: true });
    fs.writeFileSync(path.join(raiz, 'public/stand/videos/pronto.mp4'), 'mp4');
    const lerManifesto = () => [
      { id: 'pronto', titulo: 'Vídeo pronto', arquivo: '/stand/videos/pronto.mp4', resumo_falado: 'a' },
      { id: 'faltando', titulo: 'Vídeo sem arquivo', arquivo: '/stand/videos/faltando.mp4', resumo_falado: 'b' },
    ];
    const prompt = montarPromptBase({ raiz, lerManifesto });
    assert.match(prompt, /`pronto`/);
    assert.doesNotMatch(prompt, /`faltando`/);
    assert.doesNotMatch(montarPromptBase({ raiz, lerManifesto: () => lerManifesto().slice(1) }), /Vídeos pré-gravados/);
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
});

test('perguntas comuns do público caem primeiro no documento do stand', () => {
  for (const pergunta of ['o que é o LUCA-AI?', 'como o sensor do trator funciona?', 'o que a Sompo ganha com isso?', 'o que é a bancada de agentes?', 'quanto custa?']) {
    const [primeiro] = buscarNoRepo(pergunta);
    assert.equal(primeiro?.caminho, 'docs/stand-publico.md', pergunta);
  }
  assert.match(buscarNoRepo('como o sensor do trator funciona?').map((r) => r.trecho).join(' '), /ESP32/);
});
