import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {copyFile, cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const promoDir = path.resolve(scriptDir, '..');
const repoDir = path.resolve(promoDir, '..');
const runtimeDir = path.join(promoDir, '.runtime');
const captureDir = path.join(promoDir, 'public', 'captures');
const brandDir = path.join(promoDir, 'public', 'brand');

const account = {name: 'Equipe LUCA', email: 'promo@luca.test', password: 'luca-promo-2026'};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

function json(res, status, body) {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'content-length': payload.length});
  res.end(payload);
}

function firstParagraph(markdown, heading) {
  const marker = `## ${heading}`;
  const index = String(markdown || '').indexOf(marker);
  if (index < 0) return '';
  return String(markdown).slice(index + marker.length).split('\n## ')[0].split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).join(' ').slice(0, 190);
}

async function loadPersonas() {
  const raw = JSON.parse(await readFile(path.join(repoDir, '.luca', 'system-state.json'), 'utf8'));
  const agents = Array.isArray(raw.personaAgents) ? raw.personaAgents : [];
  if (!agents.length) throw new Error('Nenhuma persona real encontrada em .luca/system-state.json');
  return agents.slice(0, 8).map((agent, index) => ({
    slug: agent.slug,
    name: agent.name || agent.slug,
    model: agent.model || '',
    version: agent.cachedVersion ?? null,
    updated_at: agent.cachedAt || null,
    description: firstParagraph(agent.cachedSystemPrompt, 'Função') || 'Especialista disponível no catálogo vivo do LUCA.',
    purpose: firstParagraph(agent.cachedSystemPrompt, 'Identidade'),
    system_prompt: agent.cachedSystemPrompt || `Você é ${agent.name || agent.slug}.`,
    avatar_url: `/api/avatars/persona-${index % 5}.png`,
  }));
}

async function startKamuiMock(personas) {
  const avatarFiles = [
    'luca-agent-designer.png',
    'luca-agent-planner.png',
    'luca-agent-researcher.png',
    'luca-agent-supervisor.png',
    'luca-agent-mission.png',
  ];
  const port = await freePort();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/kamui/yume/health') return json(res, 200, {ok: true, data: {ok: true}});
    if (url.pathname === '/kamui/yume/personas') return json(res, 200, {ok: true, data: {personas}});
    const avatar = url.pathname.match(/^\/kamui\/yume\/api\/avatars\/persona-(\d+)\.png$/);
    if (avatar) {
      const file = path.join(repoDir, 'public', 'agents', avatarFiles[Number(avatar[1]) % avatarFiles.length]);
      const bytes = await readFile(file);
      res.writeHead(200, {'content-type': 'image/png', 'cache-control': 'public, max-age=3600'});
      return res.end(bytes);
    }
    const prompt = url.pathname.match(/^\/kamui\/yume\/personas\/([^/]+)\/system-prompt$/);
    if (prompt) {
      const persona = personas.find((item) => item.slug === decodeURIComponent(prompt[1]));
      return persona ? json(res, 200, {ok: true, data: persona}) : json(res, 404, {ok: false, error: 'persona_not_found'});
    }
    return json(res, 404, {ok: false, error: 'not_found'});
  });
  await new Promise((resolve, reject) => server.listen(port, '127.0.0.1', resolve).once('error', reject));
  return {server, port};
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
  await rm(runtimeDir, {recursive: true, force: true});
  await mkdir(runtimeDir, {recursive: true});
  await mkdir(captureDir, {recursive: true});
  await mkdir(brandDir, {recursive: true});
  await cp(path.join(repoDir, '.luca', 'system-state.json'), path.join(runtimeDir, 'system-state.json'));
  const heartbeat = path.join(repoDir, '.luca', 'heartbeat-report.json');
  try { await cp(heartbeat, path.join(runtimeDir, 'heartbeat-report.json')); } catch {}
  await writeFile(path.join(runtimeDir, 'auth.json'), '{"version":1,"users":[],"sessions":[]}\n');
  await copyFile(path.join(repoDir, 'public', 'icon-512.png'), path.join(brandDir, 'icon-512.png'));
  await copyFile(path.join(repoDir, 'public', 'cyber-owl.jpg'), path.join(brandDir, 'cyber-owl.jpg'));
  await copyFile(path.join(repoDir, 'public', 'v2-design', 'assets', 'jetbrains-mono-latin-wght-normal-B9CIFXIH.woff2'), path.join(brandDir, 'jetbrains-mono.woff2'));

  const personas = await loadPersonas();
  const kamui = await startKamuiMock(personas);
  const appPort = await freePort();
  const app = spawn(process.execPath, ['server/index.js'], {
    cwd: repoDir,
    env: {
      ...process.env,
      PORT: String(appPort),
      HOST: '127.0.0.1',
      LUCA_DATA_DIR: runtimeDir,
      LUCA_AUTH_DATA_PATH: path.join(runtimeDir, 'auth.json'),
      LUCA_ADMIN_EMAILS: account.email,
      KAMUI_BASE: `http://127.0.0.1:${kamui.port}`,
      KAMUI_TIMEOUT_MS: '2000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let appLog = '';
  app.stdout.on('data', (chunk) => { appLog += chunk.toString(); });
  app.stderr.on('data', (chunk) => { appLog += chunk.toString(); });

  let browser;
  try {
    const baseUrl = `http://127.0.0.1:${appPort}`;
    await waitFor(`${baseUrl}/api/auth/session`);
    const registration = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(account),
    });
    if (!registration.ok) throw new Error(`Falha ao preparar conta de captura: ${registration.status} ${await registration.text()}`);
    const setCookie = registration.headers.getSetCookie?.()[0] || registration.headers.get('set-cookie') || '';
    const cookiePair = setCookie.split(';')[0];
    const separator = cookiePair.indexOf('=');
    if (separator < 1) throw new Error('Cookie de sessão não retornado pelo runtime');

    browser = await chromium.launch({channel: 'chrome', headless: true});
    const context = await browser.newContext({viewport: {width: 1920, height: 1080}, deviceScaleFactor: 1, colorScheme: 'dark'});
    const page = await context.newPage();

    await page.goto(baseUrl, {waitUntil: 'load'});
    await page.getByRole('heading', {name: 'Entre no LUCA'}).waitFor();
    await page.screenshot({path: path.join(captureDir, '00-auth.png')});

    await context.addCookies([{name: cookiePair.slice(0, separator), value: cookiePair.slice(separator + 1), domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax'}]);
    await page.reload({waitUntil: 'load'});
    await page.getByRole('button', {name: 'Abrir LUCA-AI', exact: true}).waitFor();
    await page.screenshot({path: path.join(captureDir, '01-home.png')});

    const nav = page.getByRole('navigation', {name: 'Navegação principal'});
    await nav.getByRole('button', {name: 'Personas', exact: true}).click();
    await page.getByRole('heading', {name: 'Persona Cards'}).waitFor();
    await page.locator('article').first().waitFor();
    await sleep(500);
    await page.screenshot({path: path.join(captureDir, '02-personas.png')});

    const slugs = personas.map((persona) => persona.slug);
    const assignments = {
      supervisor: [slugs[0]],
      mission: [slugs[1] || slugs[0]],
      execution: [...new Set([slugs[2] || slugs[0], slugs[0]])].slice(0, 2),
      approval: [slugs[1] || slugs[0]],
      display: [slugs[2] || slugs[0]],
    };
    const transcript = [
      {id: 'promo-operator', role: 'operator', name: 'Operador', content: 'Transforme os sinais desta semana em uma recomendação executiva clara, com prioridade, risco e próximo passo.', status: 'info', timestamp: '2026-07-27T18:30:00.000Z'},
      {id: 'promo-supervisor', role: 'persona', name: personas[0].name, slug: slugs[0], model: personas[0].model, stage: 'Supervisor', content: '**Critério de sucesso:** uma decisão que possa ser executada hoje, sustentada pelos sinais disponíveis.', status: 'ok', timestamp: '2026-07-27T18:30:02.000Z'},
      {id: 'promo-execution', role: 'persona', name: personas[2]?.name || personas[0].name, slug: slugs[2] || slugs[0], model: personas[2]?.model || personas[0].model, stage: 'Executores', content: '**Leitura:** o maior ganho está em concentrar a equipe na oportunidade de maior impacto e menor dependência externa.', status: 'ok', timestamp: '2026-07-27T18:30:05.000Z'},
      {id: 'promo-approval', role: 'persona', name: personas[1]?.name || personas[0].name, slug: slugs[1] || slugs[0], model: personas[1]?.model || personas[0].model, stage: 'Aprovação', content: '**Aprovado com uma ressalva:** medir o primeiro resultado em 48 horas antes de ampliar o escopo.', status: 'ok', timestamp: '2026-07-27T18:30:08.000Z'},
    ];
    const finalResult = {id: 'promo-final', role: 'persona', name: personas[2]?.name || personas[0].name, slug: slugs[2] || slugs[0], model: personas[2]?.model || personas[0].model, stage: 'Exibição final', content: '## Recomendação\n\n**Prioridade:** executar a oportunidade de maior impacto nesta semana.\n\n- Começar com um piloto de 48 horas.\n- Acompanhar conversão e tempo poupado.\n- Escalar somente depois da evidência.\n\n**Próximo passo:** definir o responsável e iniciar hoje.', status: 'ok', timestamp: '2026-07-27T18:30:10.000Z'};

    await page.evaluate(({assignments, firstSlug}) => {
      localStorage.setItem('luca.activePage', JSON.stringify('luca-ai'));
      localStorage.setItem('luca.lucaAi.operationMode', JSON.stringify('team'));
      localStorage.setItem('luca.lucaAi.workflowAssignments', JSON.stringify(assignments));
      localStorage.setItem('luca.lucaAi.transcript', JSON.stringify([]));
      localStorage.setItem('luca.lucaAi.finalResult', JSON.stringify(null));
      localStorage.setItem('luca.lucaAi.activePersonaSlug', JSON.stringify(firstSlug));
      localStorage.setItem('luca.lucaAi.cleanUiVersion', '9router-clean-v1');
    }, {assignments, firstSlug: slugs[0]});
    await page.reload({waitUntil: 'load'});
    await page.getByRole('heading', {name: 'O que a equipe deve entregar?'}).waitFor();
    await page.locator('#luca-ai-team-side').getByText('5/5', {exact: true}).waitFor();
    await sleep(400);
    await page.screenshot({path: path.join(captureDir, '03-team-flow.png')});

    const mission = page.getByLabel('Missão da bancada');
    await mission.fill('Transforme os sinais desta semana em uma recomendação executiva clara, com prioridade, risco e próximo passo.');
    await page.screenshot({path: path.join(captureDir, '04-mission-ready.png')});

    await page.evaluate(({transcript, finalResult}) => {
      localStorage.setItem('luca.lucaAi.transcript', JSON.stringify(transcript));
      localStorage.setItem('luca.lucaAi.finalResult', JSON.stringify(finalResult));
    }, {transcript, finalResult});
    await page.reload({waitUntil: 'load'});
    const closeTeam = page.getByRole('button', {name: 'Fechar equipe'});
    if (await closeTeam.isVisible()) await closeTeam.click();
    await page.getByText('Entrega final', {exact: true}).waitFor();
    await sleep(350);
    await page.screenshot({path: path.join(captureDir, '05-delivery.png')});

    await context.close();
  } catch (error) {
    throw new Error(`${error.message}\n${appLog.slice(-4000)}`);
  } finally {
    if (browser) await browser.close();
    app.kill();
    await new Promise((resolve) => kamui.server.close(resolve));
  }
}

await main();
