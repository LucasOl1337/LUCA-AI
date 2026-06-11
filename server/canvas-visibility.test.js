import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadCanvasModule() {
  const source = await readFile(new URL('../src/lib/canvas.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
  });

  return import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);
}

test('isOperationalCanvas permite relatório executivo que menciona agentes como fonte', async () => {
  const { isOperationalCanvas } = await loadCanvasModule();

  const dashboard = {
    title: 'Relatorio final Sompo',
    subtitle: 'Supervisor consolidou evidencias para decisao executiva.',
    blocks: [
      {
        type: 'note',
        title: 'Evidencia priorizada',
        body: 'Pesquisador validou CSV de sinistros e telemetria rural; Planejador converteu em ranking de risco.',
      },
    ],
  };

  assert.equal(isOperationalCanvas(dashboard), false);
});

test('isOperationalCanvas permite relatório final com trilha de agentes no corpo executivo', async () => {
  const { isOperationalCanvas } = await loadCanvasModule();

  const dashboard = {
    title: 'Relatorio final de risco',
    subtitle: 'Sintese pronta para decisao executiva.',
    blocks: [
      {
        type: 'note',
        title: 'Sintese executiva',
        body: 'Supervisor concluido na consolidacao das evidencias; Pesquisador trouxe premissas e Designer priorizou o mapa de risco.',
      },
      {
        type: 'note',
        title: 'Proxima acao',
        body: 'Validar carteira critica com area de seguros antes do acionamento.',
      },
    ],
  };

  assert.equal(isOperationalCanvas(dashboard), false);
});

test('isOperationalCanvas bloqueia painel de status interno de agentes', async () => {
  const { isOperationalCanvas } = await loadCanvasModule();

  const dashboard = {
    title: 'Status dos agentes',
    blocks: [
      { type: 'status', title: 'Supervisor', body: 'ready' },
      { type: 'status', title: 'Designer', body: 'executando tarefa' },
    ],
  };

  assert.equal(isOperationalCanvas(dashboard), true);
});

test('isOperationalCanvas bloqueia runtime e erros tecnicos', async () => {
  const { isOperationalCanvas } = await loadCanvasModule();

  assert.equal(isOperationalCanvas({ title: 'Dashboard temporario', subtitle: 'fetch failed no heartbeat' }), true);
});
