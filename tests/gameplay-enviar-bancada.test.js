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

test('tabela /bancada/fila: rota, ordenação e CSV com fórmula neutralizada', async () => {
  const { parseAppLocation, formatAppUrl } = await import('../shared/app-location.js');
  assert.equal(parseAppLocation('/bancada/fila').page, 'fila');
  assert.equal(formatAppUrl({ page: 'fila' }), '/bancada/fila');
  const { ordenarFila, csvDaFila, textoDesfecho, textoNota } = await loadFrontendModule('../../src/lib/bancada-fila.ts');
  const corrida = (o) => ({ veiculo: 'trator', cenario: 'circuito', desfecho: null, desfechoTitulo: null, tempoMs: 12345, nota: null, avisos: 2, semResposta: 1, sinistrosEvitados: 1, reacaoMediaMs: 700, runId: 'r', ...o });
  const itens = [
    { id: 'a', caseId: 'lab_a', estado: 'pronto', posicao: 0, criadoEm: '2026-10-24T11:00:00Z', tentativas: 1, erro: null, corrida: corrida({ desfecho: 'colisao', nota: 40 }), parecer: { status: 'completo', eixos: '4/4', resumo: '=HYPERLINK("x")', hipoteses: 1, principal: 'Velocidade; alta' } },
    { id: 'b', caseId: 'lab_b', estado: 'na_fila', posicao: 1, criadoEm: '2026-10-24T11:05:00Z', tentativas: 0, erro: null, corrida: corrida({ desfecho: 'chegada', nota: 90 }), parecer: null },
    { id: 'c', caseId: 'lab_c', estado: 'processando', posicao: 0, criadoEm: '2026-10-24T10:00:00Z', tentativas: 1, erro: null, corrida: corrida({ desfechoTitulo: 'Atolou na área alagada' }), parecer: null },
  ];
  assert.deepEqual(ordenarFila(itens, 'quando', false).map((i) => i.id), ['b', 'a', 'c']);
  assert.deepEqual(ordenarFila(itens, 'nota', false).map((i) => i.id), ['b', 'a', 'c']);
  assert.deepEqual(ordenarFila(itens, 'estado', true).map((i) => i.id), ['c', 'b', 'a']);
  assert.equal(textoDesfecho(itens[0].corrida), 'Colisão'); assert.equal(textoDesfecho(itens[2].corrida), 'Atolou na área alagada');
  assert.equal(textoNota(itens[0].corrida), 'Nota 40 · 2 avisos, 1 sem resposta');
  const csv = csvDaFila(itens);
  assert.ok(csv.startsWith('\uFEFFenviado_em;estado;veiculo'));
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/); assert.match(csv, /"Velocidade; alta"/);
  assert.equal(csv.trim().split('\r\n').length, 4);
  const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /case 'fila':.*<FilaBancadaPage \/>/);
});
