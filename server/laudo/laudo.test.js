import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { createAuthService } from '../auth.js';
import { registerLabCaseRoutes } from '../lab-cases.js';
import { veredictoExemplo } from './veredicto-exemplo.js';
import { dadosDoLaudo, nomeArquivoLaudo } from './dados-laudo.js';
import { desenharLaudo } from './desenhar-laudo.js';
import { parseLabCase } from '../../shared/lab-telemetry.js';

// JPEG real de 32x18 (gerado com ImageMagick); serve de print da corrida e de frame do episódio.
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAASACADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAZEAEAAgMAAAAAAAAAAAAAAAAAFGEBEVH/xAAYAQEAAwEAAAAAAAAAAAAAAAAAAgMEBf/EABYRAQEBAAAAAAAAAAAAAAAAAAATFP/aAAwDAQACEQMRAD8AgQ6IdL8OiHSGhfJAh0Q6X4dEOjQSVNY4axwHPajWOGscAH//2Q==', 'base64');
const fixtureDir = path.resolve('datasets/laboratorio-virtual-v1');
const json = (name) => JSON.parse(fs.readFileSync(path.join(fixtureDir, name), 'utf8'));
const source = (extra = {}) => ({
  name: 'Cerca e água', sourceName: '02-cerca-e-agua.csv', rawCsv: fs.readFileSync(path.join(fixtureDir, '02-cerca-e-agua.csv'), 'utf8'),
  metadata: json('manifest.json'), map: json('mapa.geojson'), ...extra,
});
const eixo = { summary: 'Revisão: saída da cerca no início e aproximação da água sem entrada.', limitations: [], additionalInformation: [], hypotheses: [] };
const paginas = (pdf) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length;
const textoPdf = (pdf) => pdf.toString('latin1').replace(/<([0-9a-f]+)> Tj/g, (_, hex) => Buffer.from(hex, 'hex').toString('latin1'));

async function servidor(t, chat) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-laudo-test-'));
  const app = express();
  app.use(express.json({ limit: '8mb' }));
  const auth = createAuthService({ dataPath: path.join(dir, 'auth.json') });
  auth.registerRoutes(app);
  app.use('/api', auth.requireUser);
  registerLabCaseRoutes(app, { dataDir: dir, chat });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.closeAllConnections(); await new Promise((r) => server.close(r));
    assert.ok(path.basename(dir).startsWith('luca-laudo-test-'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const pedir = (url, { cookie, body } = {}) => fetch(`${base}${url}`, { method: body ? 'POST' : 'GET', headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const cookie = (await pedir('/api/auth/register', { body: { name: 'laudo', email: 'laudo@lab.test', password: 'test-password-2026' } })).headers.get('set-cookie').split(';')[0];
  return { pedir, cookie, dir };
}

test('laudo.pdf: exige conta, sai com nome LUCA-laudo-<data>-<caso>, 1 página e ≤ 1,5 MB, com o veredicto do caso', async (t) => {
  const chat = async ({ agentId }) => ({ finishReason: 'stop', toolCalls: [], content: JSON.stringify(agentId === 'lab-verdict' ? veredictoExemplo({ elapsedMs: 60_000 }) : eixo) });
  const { pedir, cookie } = await servidor(t, chat);
  const caso = await (await pedir('/api/lab/cases', { cookie, body: source() })).json();
  const id = caso.case.id;
  assert.equal((await pedir(`/api/lab/cases/${id}/laudo.pdf`)).status, 401);
  // Caso sem investigação ainda: laudo honesto, sem veredicto e sem chamar modelo.
  const vazio = await pedir(`/api/lab/cases/${id}/laudo.pdf`, { cookie });
  assert.equal(vazio.status, 200);
  assert.equal(paginas(Buffer.from(await vazio.arrayBuffer())), 1);
  const analise = await (await pedir(`/api/lab/cases/${id}/analyses`, { cookie, body: { focus: 'Por que chegou perto da água?' } })).json();
  const resposta = await pedir(`/api/lab/cases/${id}/laudo.pdf?analise=${analise.analysis.id}`, { cookie });
  assert.equal(resposta.status, 200);
  assert.equal(resposta.headers.get('content-type'), 'application/pdf');
  assert.match(resposta.headers.get('content-disposition'), /^attachment; filename="LUCA-laudo-\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.pdf"$/);
  const pdf = Buffer.from(await resposta.arrayBuffer());
  assert.ok(pdf.length <= 1.5 * 1024 * 1024);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.equal(paginas(pdf), 1);
  assert.match(textoPdf(pdf), /ESTIMATIVA/);
  assert.equal((await pedir(`/api/lab/cases/${id}/laudo.pdf?analise=nao-existe`, { cookie })).status, 404);
});

test('print da corrida vira a imagem principal; print inválido é recusado e não muda o id do caso', async (t) => {
  const { pedir, cookie, dir } = await servidor(t, async () => ({ finishReason: 'stop', content: '{}' }));
  const dataUrl = `data:image/jpeg;base64,${JPEG.toString('base64')}`;
  const ruim = await pedir('/api/lab/cases', { cookie, body: source({ prints: [{ dataUrl: 'data:image/png;base64,AAAA', elapsedMs: 1 }] }) });
  assert.equal(ruim.status, 400);
  const semPrint = await (await pedir('/api/lab/cases', { cookie, body: source() })).json();
  const comPrint = await (await pedir('/api/lab/cases', { cookie, body: source({ prints: [{ dataUrl, elapsedMs: 61_000, rotulo: 'Colisão', momento: 'desfecho' }] }) })).json();
  assert.equal(comPrint.case.id, semPrint.case.id, 'prints ficam fora do hash');
  assert.equal(comPrint.case.prints[0].momento, 'desfecho');
  const pdf = Buffer.from(await (await pedir(`/api/lab/cases/${comPrint.case.id}/laudo.pdf`, { cookie })).arrayBuffer());
  assert.match(textoPdf(pdf), /\/Subtype \/Image/);
  assert.match(textoPdf(pdf), /Momento cr/);
  assert.equal(paginas(pdf), 1);
  assert.ok(fs.readdirSync(path.join(dir, 'workspaces')).length > 0);
});

test('casos antigos, veredicto indeterminado e texto longo: hipótese sem modelo e no máximo 2 páginas', () => {
  const s = source();
  const parsed = parseLabCase(s.rawCsv, { fileName: s.sourceName, manifest: s.metadata, map: s.map });
  const record = { ...s, id: 'lab_abc', name: 'Caso antigo / água', createdAt: '2026-10-24T11:00:00Z' };
  assert.equal(nomeArquivoLaudo(record, new Date('2026-10-24T12:00:00Z')), 'LUCA-laudo-2026-10-24-caso-antigo-agua.pdf');
  const antigo = { id: 'a', status: 'completed', axes: [{ id: 'review', status: 'completed', summary: 'Texto da revisão antiga.' }], hypotheses: [] };
  const d1 = dadosDoLaudo(record, parsed, antigo);
  assert.equal(d1.hipotese, 'Texto da revisão antiga.');
  assert.equal(paginas(desenharLaudo(d1)), 1);
  const indeterminado = { ...antigo, verdict: { ...veredictoExemplo({}), status: 'indeterminado_por_falha', culpado: 'indeterminado', culpadoRotulo: 'Indeterminado', confianca: 0, evidencias: [], impacto_financeiro: { faixa_min_brl: null, faixa_max_brl: null, componentes: [], premissas: [], rotulo: 'estimativa', tabela: 'premissas-v1' } } };
  assert.equal(paginas(desenharLaudo(dadosDoLaudo(record, parsed, indeterminado))), 1);
  const longo = veredictoExemplo({ elapsedMs: 30_000 });
  longo.hipotese = 'Hipótese longa com detalhe operacional. '.repeat(22).slice(0, 900);
  longo.evidencias = Array.from({ length: 5 }, (_, i) => ({ descricao: `Evidência ${i + 1}: ${'leitura do sensor e contexto do talhão '.repeat(6)}`, elapsedMs: 10_000 * (i + 1) }));
  const n = paginas(desenharLaudo({ ...dadosDoLaudo(record, parsed, { ...antigo, verdict: longo }), frame: { buffer: JPEG, rotulo: 'Print' } }));
  assert.ok(n >= 1 && n <= 2, `páginas: ${n}`);
});
