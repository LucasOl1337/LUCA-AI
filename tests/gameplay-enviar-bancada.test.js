import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { EnviarBancada, envioDoCircuito } = await loadFrontendModule('../../src/components/gameplay/EnviarBancada.tsx');
const { textoPosicao, diaBrasilia } = await loadFrontendModule('../../src/lib/bancada-fila.ts');

const relatorio = {
  registro: { versao: 1, runId: 'run-x', inicioIso: '2026-10-24T11:00:00Z', fimIso: '2026-10-24T11:00:30Z', elapsedMs: 30000, progresso: 1, proximoMarco: 9,
    resultado: { motivo: 'colisao', tempoMs: 30000 }, episodios: [{ sensor: 'feno', inicioMs: 1000, fimMs: 2000, gravidade: 'critico', velocidadeKph: 9, distanciaCm: 80, rolagemGraus: 0, resposta: null, evitado: false }],
    pausas: [], origem: 'SIMULAÇÃO', regras: '' },
  caso: { rawCsv: 'a,b\n1,2', sourceName: 'percurso-totem.csv', name: 'Circuito · run-x', metadata: {}, map: {} },
};

test('resultado da corrida tem "Enviar pra bancada" ao lado de analisar (Circuito e Percurso); voz não dispara', () => {
  const html = renderToStaticMarkup(createElement(EnviarBancada, { montar: () => null }));
  assert.match(html, /data-acao="enviar-bancada"/); assert.match(html, /Enviar pra bancada/);
  const hud = fs.readFileSync(new URL('../src/components/gameplay/CircuitoHud.tsx', import.meta.url), 'utf8');
  assert.match(hud, /<EnviarBancada montar=\{\(\) => envioDoCircuito\(sessao\.relatorio\(\)\)\} \/>/);
  const percurso = fs.readFileSync(new URL('../src/components/gameplay/PercursoCabine.tsx', import.meta.url), 'utf8');
  assert.match(percurso, /<EnviarBancada key=\{inicioIso\.current\}/);
  // Q8: a voz do totem não grava nem dispara a bancada; só o toque no resultado.
  for (const arquivo of ['shared/stand/comandos-voz.ts', 'server/stand/ferramentas.js']) {
    if (fs.existsSync(arquivo)) assert.doesNotMatch(fs.readFileSync(arquivo, 'utf8'), /bancada\/fila|enviarParaFila/, arquivo);
  }
});

test('envio do circuito leva o caso inteiro, rótulos da corrida e o foco do circuito', () => {
  const envio = envioDoCircuito(relatorio);
  assert.equal(envio.caso, relatorio.caso);
  assert.deepEqual({ ...envio.corrida }, { veiculo: 'trator', cenario: 'circuito', desfecho: 'colisao', desfechoTitulo: 'Colisão com obstáculo', tempoMs: 30000, avisos: 1, runId: 'run-x' });
  assert.match(envio.foco, /Circuito contínuo SIMULAÇÃO/);
  assert.equal(envioDoCircuito(relatorio, { veiculo: 'caminhao', cenario: 'serra-sem-freio' }).corrida.veiculo, 'caminhao');
});

test('posição e dia de Brasília no cliente', () => {
  assert.equal(textoPosicao({ estado: 'na_fila', posicao: 3 }), 'Na fila: 3º');
  assert.equal(textoPosicao({ estado: 'processando', posicao: 0 }), 'Processando agora');
  assert.equal(textoPosicao({ estado: 'pronto', posicao: 0 }), 'Pronto');
  assert.equal(diaBrasilia('2026-10-25T02:59:00Z'), '2026-10-24');
});
