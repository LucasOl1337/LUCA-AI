// Captura da mini-vitrine: instância isolada do LUCA-AI (data dir temporário,
// Kamui/Yume e 9Router mockados em 127.0.0.1, fetch externo bloqueado por
// --import ../scripts/offline-network.mjs) + gravação headless via Playwright.
//
// Uso: node promo/scripts/mini-vitrine-capture.mjs <outputDir>
// Produz <outputDir>/captures/cena.mp4 (1600x1000) e captures/timings.json.

import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp, mkdir, readFile, writeFile} from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(scriptDir, '..', '..');
const outDir = path.resolve(process.argv[2] || path.join(repoDir, 'delivery', 'mini-vitrine'));
const captureDir = path.join(outDir, 'captures');
const videoTmpDir = path.join(outDir, 'captures', 'raw-video');

const account = {name: 'Demo Mini Vitrine', email: 'mini-vitrine@luca.test', password: 'luca-mini-vitrine-2026'};
const MISSION = 'Decida o foco do próximo ciclo do LUCA-AI: replay de incidentes do Laboratório ou novas integrações de agentes. Entregue prioridade, risco principal e próxima ação.';
const STAGE_DELAY_MS = 2400;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Personas fixture: slugs do preset "Conselho de Estratégia" (shared/luca-preset-seed.js).
// A etapa visual (especialista-visual) é builtin do server, não precisa do Kamui.
const PERSONAS = [
  {slug: 'supervisor-agentes-ia', name: 'Supervisor de Agentes', model: 'cc/claude-opus-5(max)', purpose: 'Enquadrar missões e cobrar critério de sucesso'},
  {slug: 'lucas', name: 'Lucas', model: 'gcli/grok-4.6(high)', purpose: 'Decisão pragmática de produto'},
  {slug: 'elon-musk', name: 'Elon Musk', model: 'cx/gpt-5.6-luna(xhigh)', purpose: 'Primeiros princípios e execução agressiva'},
  {slug: 'aurora', name: 'Aurora', model: 'cc/claude-fable-5(medium)', purpose: 'Síntese analítica e métricas'},
  {slug: 'tars', name: 'TARS', model: 'cx/gpt-5.6-sol(medium)', purpose: 'Análise de risco com humor seco'},
  {slug: 'curador-personas', name: 'Curador de Personas', model: 'gcli/grok-4.5(high)', purpose: 'Auditar qualidade e cobertura das respostas'},
  {slug: 'relator-executivo-risco', name: 'Relator Executivo', model: 'cc/claude-fable-5(max)', purpose: 'Veredito executivo final'},
].map((p, i) => ({
  ...p,
  is_official: true,
  version: 1,
  updated_at: '2026-09-13T00:00:00.000Z',
  description: `Persona de demonstração da mini-vitrine: ${p.purpose}.`,
  system_prompt: `Você é ${p.name}, persona de demonstração do LUCA-AI. ${p.purpose}. Responda em pt-BR, curto e direto.`,
  avatar_url: `/api/avatars/persona-${i % 5}.png`,
}));

const AVATAR_FILES = [
  'luca-agent-designer.png',
  'luca-agent-planner.png',
  'luca-agent-researcher.png',
  'luca-agent-supervisor.png',
  'luca-agent-mission.png',
];

const ROUTER_ANSWERS = [
  {
    match: /Etapa atual:\s*Supervisor/i,
    content: '- Objetivo real: escolher uma única frente para o próximo ciclo, sem dividir a equipe.\n- Limite: ciclo curto, sem dependência externa, métrica observável.\n- Critério de sucesso: decisão executável hoje, com risco explícito.\n- Risco principal: decidir por hype em vez de evidência de uso.',
  },
  {
    match: /Etapa atual:\s*Decisor da missao/i,
    content: '- Prioridade: replay de incidentes do Laboratório.\n- Escopo: replay + relatório acionável sobre telemetria já coletada.\n- Dependência: nenhuma externa; usa o pipeline de casos que já existe.\n- Próxima ação: fechar o contrato de incidente e ligar na bancada.',
  },
  {
    match: /Etapa atual:\s*Execucao/i,
    bySlug: {
      'elon-musk': '- Replay é o caminho de menor complexidade: pipeline de casos já existe.\n- Integração nova multiplica superfície sem provar demanda.\n- Ação: cortar escopo até o replay rodar ponta a ponta em um caso real.',
      'aurora': '- Replay converte telemetria parada em evidência de valor.\n- Métrica proposta: tempo até o primeiro relatório útil por incidente.\n- Integrações ficam para o ciclo seguinte, com demanda medida.',
      'tars': '- Risco do replay: reconstrução sem critério vira vitrine técnica.\n- Mitigação: critério de "replay útil" definido antes de construir.\n- Integrações têm risco de acordo externo que não controlamos.',
    },
    content: '- Replay usa o pipeline de casos existente; custo marginal baixo.\n- Integrações novas dependem de acordo externo.\n- Próxima ação: definir critério de replay útil.',
  },
  {
    match: /Etapa atual:\s*Aprovacao/i,
    content: 'Veredito: aprovado com condição.\n- A direção replay-first está correta e coberta por evidência interna.\n- Lacuna: falta o critério numérico de "replay útil".\n- Condição: medir tempo até o primeiro relatório antes de ampliar escopo.',
  },
  {
    match: /Etapa atual:\s*Exibicao final/i,
    content: 'Veredito: o próximo ciclo é replay de incidentes.\n\nDecisão\n- Priorizar o replay do Laboratório; integrações novas ficam para o ciclo seguinte.\n\nEvidências\n- Pipeline de casos e telemetria já existem; custo marginal baixo.\n- Integrações exigem acordo externo que não controlamos.\n\nRiscos\n- Replay sem critério de sucesso vira vitrine técnica.\n\nPróximas ações\n- Definir a métrica de replay útil e fechar o contrato de incidente esta semana.',
  },
  {
    match: /Especialista visual|artefatos|JSON de artefatos/i,
    content: JSON.stringify({
      summary: 'Comparativo de esforço entre replay de incidentes e novas integrações.',
      report: {
        title: 'Próximo ciclo: replay first',
        markdown: 'O replay de incidentes usa pipeline existente e não depende de acordos externos. As novas integrações pedem mais esforço e prova de demanda. Ação: fechar o critério de replay útil ainda esta semana.',
      },
      charts: [{
        id: 'c1',
        title: 'Esforço relativo por frente',
        type: 'tower',
        items: [
          {label: 'Replay de incidentes', value: 3},
          {label: 'Novas integrações', value: 8},
        ],
        rationale: 'estimativa qualitativa sustentada pelo contexto da rodada',
      }],
      images: [],
      imageEngine: 'gpt-image',
    }),
  },
];

function answerFor(messages) {
  const text = (Array.isArray(messages) ? messages : [])
    .map((m) => `${m?.role || ''}: ${typeof m?.content === 'string' ? m.content : JSON.stringify(m?.content || '')}`)
    .join('\n');
  for (const entry of ROUTER_ANSWERS) {
    if (!entry.match.test(text)) continue;
    if (entry.bySlug) {
      const slugHit = Object.keys(entry.bySlug).find((slug) => new RegExp(`Sua persona:[^\\n]*\\(${slug}\\)|\\b${slug}\\b`, 'i').test(text));
      if (slugHit) return entry.bySlug[slugHit];
    }
    return entry.content;
  }
  return '- Ponto coberto.\n- Próxima ação definida.\n- Risco registrado.';
}

function json(res, status, body) {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'content-length': payload.length});
  res.end(payload);
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function startKamuiMock() {
  const port = await freePort();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/kamui/yume/health') return json(res, 200, {ok: true, data: {ok: true}});
    if (url.pathname === '/kamui/yume/personas') return json(res, 200, {ok: true, data: {personas: PERSONAS}});
    const avatar = url.pathname.match(/^\/kamui\/yume\/api\/avatars\/persona-(\d+)\.png$/);
    if (avatar) {
      const file = path.join(repoDir, 'public', 'agents', AVATAR_FILES[Number(avatar[1]) % AVATAR_FILES.length]);
      const bytes = await readFile(file);
      res.writeHead(200, {'content-type': 'image/png', 'cache-control': 'public, max-age=3600'});
      return res.end(bytes);
    }
    const prompt = url.pathname.match(/^\/kamui\/yume\/personas\/([^/]+)\/system-prompt$/);
    if (prompt) {
      const persona = PERSONAS.find((item) => item.slug === decodeURIComponent(prompt[1]));
      return persona ? json(res, 200, {ok: true, data: persona}) : json(res, 404, {ok: false, error: 'persona_not_found'});
    }
    const version = url.pathname.match(/^\/kamui\/yume\/personas\/([^/]+)\/version$/);
    if (version) {
      const persona = PERSONAS.find((item) => item.slug === decodeURIComponent(version[1]));
      return persona
        ? json(res, 200, {ok: true, data: {slug: persona.slug, version: persona.version, updated_at: persona.updated_at}})
        : json(res, 404, {ok: false, error: 'persona_not_found'});
    }
    const detail = url.pathname.match(/^\/kamui\/yume\/personas\/([^/]+)$/);
    if (detail) {
      const persona = PERSONAS.find((item) => item.slug === decodeURIComponent(detail[1]));
      return persona ? json(res, 200, {ok: true, data: {persona}}) : json(res, 404, {ok: false, error: 'persona_not_found'});
    }
    return json(res, 404, {ok: false, error: 'not_found'});
  });
  await new Promise((resolve, reject) => server.listen(port, '127.0.0.1', resolve).once('error', reject));
  return {server, port};
}

async function startRouterMock() {
  const port = await freePort();
  const calls = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === 'GET' && url.pathname === '/v1/models') {
      return json(res, 200, {data: [{id: 'fixture/mini-vitrine'}]});
    }
    if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
      let body = {};
      try { body = JSON.parse(await readBody(req)); } catch {}
      const content = answerFor(body.messages);
      calls.push({at: Date.now(), model: body.model, chars: content.length});
      // Latência de fixture: deixa cada etapa aparecer no polling da UI.
      await sleep(STAGE_DELAY_MS);
      return json(res, 200, {
        id: 'chatcmpl-mini-vitrine',
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: body.model || 'fixture/mini-vitrine',
        choices: [{index: 0, message: {role: 'assistant', content}, finish_reason: 'stop'}],
        usage: {prompt_tokens: 0, completion_tokens: 0, total_tokens: 0},
      });
    }
    return json(res, 404, {error: {message: 'not_found'}});
  });
  await new Promise((resolve, reject) => server.listen(port, '127.0.0.1', resolve).once('error', reject));
  return {server, port, calls};
}

async function waitFor(url, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {}
    await sleep(250);
  }
  throw new Error(`Servidor não respondeu em ${url}`);
}

async function main() {
  await mkdir(captureDir, {recursive: true});
  await mkdir(videoTmpDir, {recursive: true});
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'luca-mini-vitrine-'));
  await writeFile(path.join(dataDir, 'auth.json'), '{"version":1,"users":[],"sessions":[]}\n');

  const kamui = await startKamuiMock();
  const router = await startRouterMock();
  const appPort = await freePort();
  const app = spawn(process.execPath, [
    '--import', path.join(repoDir, 'scripts', 'offline-network.mjs'),
    'server/index.js',
  ], {
    cwd: repoDir,
    env: {
      ...process.env,
      PORT: String(appPort),
      HOST: '127.0.0.1',
      LUCA_DATA_DIR: dataDir,
      LUCA_AUTH_DATA_PATH: path.join(dataDir, 'auth.json'),
      LUCA_ADMIN_EMAILS: account.email,
      KAMUI_BASE: `http://127.0.0.1:${kamui.port}`,
      KAMUI_TIMEOUT_MS: '2000',
      ROUTER_BASE_URL: `http://127.0.0.1:${router.port}/v1`,
      ROUTER_API_KEY: '',
      NINE_ROUTER_API_KEY: '',
      REQUIRE_CLOUDFLARE_ACCESS: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let appLog = '';
  app.stdout.on('data', (chunk) => { appLog += chunk.toString(); });
  app.stderr.on('data', (chunk) => { appLog += chunk.toString(); });

  const timings = {startedAt: new Date().toISOString(), marks: {}};
  const mark = (name) => { timings.marks[name] = (Date.now() - t0) / 1000; };

  let browser;
  const t0 = Date.now();
  try {
    const baseUrl = `http://127.0.0.1:${appPort}`;
    await waitFor(`${baseUrl}/api/auth/session`);
    const registration = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(account),
    });
    if (!registration.ok) throw new Error(`registro falhou: ${registration.status} ${await registration.text()}`);
    const setCookie = registration.headers.getSetCookie?.()[0] || registration.headers.get('set-cookie') || '';
    const cookiePair = setCookie.split(';')[0];
    const separator = cookiePair.indexOf('=');
    if (separator < 1) throw new Error('cookie de sessão ausente');

    browser = await chromium.launch({channel: 'chrome', headless: true});
    const context = await browser.newContext({
      viewport: {width: 1600, height: 1000},
      deviceScaleFactor: 1,
      colorScheme: 'dark',
      recordVideo: {dir: videoTmpDir, size: {width: 1600, height: 1000}},
    });
    const page = await context.newPage();

    await page.goto(baseUrl, {waitUntil: 'load'});
    await context.addCookies([{
      name: cookiePair.slice(0, separator),
      value: cookiePair.slice(separator + 1),
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    }]);
    await page.reload({waitUntil: 'load'});
    await page.locator('[data-landing-cta="team"]').waitFor({timeout: 30000});
    mark('landing');
    await sleep(1500);
    await page.locator('[data-landing-cta="team"]').click();
    await page.getByRole('heading', {name: 'O que a equipe deve entregar?'}).waitFor();
    mark('painel');

    const preset = page.getByRole('button', {name: 'Aplicar preset Conselho de Estratégia'});
    await preset.waitFor({timeout: 20000});
    await sleep(1200);
    await preset.click();
    await page.locator('#luca-ai-team-side').getByText('5/5', {exact: true}).waitFor({timeout: 20000});
    mark('equipe_5de5');
    await sleep(900);

    const mission = page.locator('#luca-ai-mission');
    await mission.click();
    await mission.pressSequentially(MISSION, {delay: 26});
    mark('missao_digitada');
    await sleep(600);

    // runId vem da resposta real do POST; os marks de etapa usam o payload do
    // próprio runtime (steps concluídos), não o DOM — timing fiel à rodada.
    let runId = '';
    page.on('response', (response) => {
      if (response.url().includes('/api/luca-ai/persona-team/run') && response.request().method() === 'POST') {
        response.json().then((body) => { runId = body?.runId || runId; }).catch(() => {});
      }
    });
    await page.getByRole('button', {name: 'Enviar missão'}).click();
    mark('missao_enviada');

    const seenSteps = new Set();
    const statusHeaders = {'content-type': 'application/json', cookie: cookiePair};
    const deadline = Date.now() + 150000;
    let done = false;
    while (Date.now() < deadline && !done) {
      if (runId) {
        try {
          const status = await fetch(`${baseUrl}/api/luca-ai/persona-team/runs/${runId}`, {headers: statusHeaders}).then((r) => r.json());
          for (const step of status.steps || []) {
            const label = String(step?.roleLabel || step?.roleId || '').trim();
            if (label && !seenSteps.has(label)) {
              seenSteps.add(label);
              mark(`etapa_${label.toLowerCase().replace(/\s+/g, '_')}`);
            }
          }
          if (['completed', 'failed', 'succeeded'].includes(String(status.status))) done = true;
        } catch {}
      }
      await sleep(400);
    }
    await page.getByText('Entrega final', {exact: true}).waitFor({timeout: 30000});
    mark('entrega_final');
    await sleep(3500);
    mark('fim');

    const video = page.video();
    await context.close();
    const rawPath = await video.path();
    const {execFileSync} = await import('node:child_process');
    const cena = path.join(captureDir, 'cena.mp4');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', rawPath, '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', cena]);
    timings.video = {raw: rawPath, cena};
    timings.routerCalls = router.calls.length;
    timings.dataDir = dataDir;
    await writeFile(path.join(captureDir, 'timings.json'), JSON.stringify(timings, null, 2));
    console.log(JSON.stringify({cena, marks: timings.marks, routerCalls: router.calls.length}, null, 2));
  } catch (error) {
    throw new Error(`${error.message}\n${appLog.slice(-4000)}`);
  } finally {
    if (browser) await browser.close();
    app.kill();
    await new Promise((resolve) => kamui.server.close(resolve));
    await new Promise((resolve) => router.server.close(resolve));
  }
}

await main();
