// Captura do vídeo pipeline-completo (M5) numa instância local isolada do
// LUCA-AI, com o navegador na bancada agent-bench `luca-stand-m5` (CDP, GPU real).
//
// - Telemetria: só o simulador (LUCA_SOMPO_OFFLINE=true). O feed físico do
//   Firebase é lido duas vezes por GET só para registrar se estava vivo (Q3).
// - Bancada de agentes: 9Router real (chave do ambiente) e personas por GET no
//   Kamui da sennin-kvm via túnel SSH. Token só no env do filho; nada gravado.
//   Uma corrida só. Se falhar, timings.json registra e o vídeo usa o plano B.
// - Rede do servidor: rede-permitida.mjs bloqueia tudo fora de 127.0.0.1, do
//   host do 9Router e de GET no Kamui, e loga cada saída em rede.jsonl.
//
// Uso (pela fila pesada):
//   agent-bench fila luca-stand-m5 rodar -- node promo/src/stand/capturar-pipeline.mjs --saida DIR
// Pré-requisito: build em dist/. Saída: DIR/cena.mp4, timings.json, run.json, rede.jsonl, prints/.

import {execFileSync, spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir, mkdtemp, writeFile} from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(aqui, '..', '..', '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, all) => (v.startsWith('--') ? [...acc, [v.slice(2), all[i + 1]]] : acc), []));
const saida = path.resolve(args.saida || path.join(os.tmpdir(), 'm5-captura'));
const BANCADA = args.bancada || 'luca-stand-m5';
const LARGURA = 1920;
const ALTURA = 1080;
const CENARIO = 'max-front-obstacle';
const DESFECHO = 'safe-stop';
const FIREBASE = 'https://trator-monitoramento-default-rtdb.firebaseio.com/trator/001/sensores/timestamp.json';
const conta = {name: 'Demo Stand', email: 'stand-m5@luca.test', password: `stand-m5-${Date.now()}`};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function portaLivre() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const {port} = s.address(); s.close(() => resolve(port)); });
  });
}

async function esperar(url, ms = 30000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    try { const r = await fetch(url); if (r.status < 500) return r.status; } catch {}
    await sleep(300);
  }
  throw new Error(`sem resposta em ${url}`);
}

/** Feed físico: duas leituras GET separadas por 6 s. Nunca escreve. */
async function feedFisico() {
  const ler = () => fetch(FIREBASE, {signal: AbortSignal.timeout(6000)}).then((r) => r.json()).catch(() => null);
  const a = await ler();
  await sleep(6000);
  const b = await ler();
  return {timestampA: a, timestampB: b, vivo: a != null && b != null && a !== b};
}

async function abrirKamui() {
  let token = '';
  try {
    token = execFileSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', 'sennin-kvm',
      "sudo -n sed -n 's/^KAMUI_INTERNAL_API_TOKEN=//p' /etc/sennin/luca-ai.env"], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']})
      .trim().replace(/^['"]|['"]$/g, '');
  } catch { return null; }
  if (!token) return null;
  const porta = await portaLivre();
  const tunel = spawn('ssh', ['-N', '-o', 'BatchMode=yes', '-o', 'ExitOnForwardFailure=yes', '-L', `${porta}:127.0.0.1:1338`, 'sennin-kvm'], {stdio: 'ignore'});
  const base = `http://127.0.0.1:${porta}`;
  try { await esperar(`${base}/kamui/yume/health`, 20000); } catch { tunel.kill(); return null; }
  return {base, token, fechar: () => tunel.kill()};
}

function cdpDaBancada() {
  execFileSync('agent-bench', ['ensure', BANCADA], {stdio: 'ignore'});
  const info = JSON.parse(execFileSync('agent-bench', ['cdp', BANCADA], {encoding: 'utf8'}));
  if (info.lives_in !== BANCADA || !info.browser_url) throw new Error(`CDP fora da bancada ${BANCADA}`);
  return info.browser_url;
}

async function main() {
  if (!existsSync(path.join(repoDir, 'dist', 'index.html'))) throw new Error('rode o build antes (dist/)');
  await mkdir(path.join(saida, 'prints'), {recursive: true});
  const bruto = path.join(saida, 'bruto');
  await mkdir(bruto, {recursive: true});
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'luca-stand-m5-'));
  await writeFile(path.join(dataDir, 'auth.json'), '{"version":1,"users":[],"sessions":[]}\n');

  const feed = await feedFisico();
  const kamui = await abrirKamui();
  const routerRaiz = (process.env.NINE_ROUTER_BASE_URL || process.env.NINEROUTER_HOSTINGER_BASE_URL || '').replace(/\/+$/, '').replace(/\/v1$/, '');
  const routerChave = process.env.NINE_ROUTER_BASE_URL ? process.env.NINE_ROUTER_API_KEY : process.env.NINEROUTER_HOSTINGER_API_KEY;
  const routerReal = Boolean(routerRaiz && routerChave);
  const bancada = {
    kamui: kamui ? 'real (GET via túnel sennin-kvm)' : 'indisponível',
    router: routerReal ? `9Router real (${new URL(routerRaiz).host})` : 'desligado',
  };

  const portaApp = await portaLivre();
  const env = {
    ...process.env,
    PORT: String(portaApp),
    HOST: '127.0.0.1',
    LUCA_DATA_DIR: dataDir,
    LUCA_AUTH_DATA_PATH: path.join(dataDir, 'auth.json'),
    LUCA_ADMIN_EMAILS: conta.email,
    LUCA_SOMPO_OFFLINE: 'true',
    REQUIRE_CLOUDFLARE_ACCESS: 'false',
    KAMUI_BASE: kamui?.base || 'http://127.0.0.1:1',
    KAMUI_INTERNAL_API_TOKEN: kamui?.token || '',
    SENNIN_INTERNAL_API_TOKEN: '',
    ROUTER_BASE_URL: routerReal ? `${routerRaiz}/v1` : 'http://127.0.0.1:1',
    ROUTER_API_KEY: routerReal ? routerChave : '',
    NINE_ROUTER_API_KEY: '',
    LUCA_MACHINE_TOKEN: '',
    LUCA_CAPTURA_PERMITIDOS: routerReal ? new URL(routerRaiz).host : '',
    LUCA_CAPTURA_LOG_REDE: path.join(saida, 'rede.jsonl'),
  };
  const app = spawn(process.execPath, ['--import', path.join(aqui, 'rede-permitida.mjs'), 'server/index.js'], {cwd: repoDir, env, stdio: ['ignore', 'pipe', 'pipe']});
  let appLog = '';
  app.stdout.on('data', (c) => { appLog = (appLog + c).slice(-20000); });
  app.stderr.on('data', (c) => { appLog = (appLog + c).slice(-20000); });

  const rastro = {viewport: {largura: LARGURA, altura: ALTURA}, cliques: [], cursor: [], marcas: {}};
  const info = {id: 'pipeline-completo', inicio: new Date().toISOString(), cenario: `${CENARIO}/${DESFECHO}`, feed, bancada, prints: [], run: null, erros: []};
  let browser;
  let context;
  let t0 = 0;
  const agora = () => (Date.now() - t0) / 1000;
  let mouse = {x: LARGURA / 2, y: ALTURA / 2};

  try {
    const base = `http://127.0.0.1:${portaApp}`;
    await esperar(`${base}/api/auth/session`);
    const reg = await fetch(`${base}/api/auth/register`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(conta)});
    if (!reg.ok) throw new Error(`registro falhou: ${reg.status}`);
    const par = (reg.headers.getSetCookie?.()[0] || reg.headers.get('set-cookie') || '').split(';')[0];
    const sep = par.indexOf('=');
    if (sep < 1) throw new Error('cookie de sessão ausente');

    browser = await chromium.connectOverCDP(cdpDaBancada());
    context = await browser.newContext({
      viewport: {width: LARGURA, height: ALTURA},
      deviceScaleFactor: 1,
      colorScheme: 'dark',
      locale: 'pt-BR',
      recordVideo: {dir: bruto, size: {width: LARGURA, height: ALTURA}},
    });
    await context.addCookies([{name: par.slice(0, sep), value: par.slice(sep + 1), domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax'}]);
    const page = await context.newPage();
    t0 = Date.now();
    page.on('pageerror', (e) => info.erros.push(`pageerror: ${String(e.message).slice(0, 300)}`));

    const marca = (nome) => { rastro.marcas[nome] = agora(); };
    const print = async (nome) => {
      const arq = path.join(saida, 'prints', `${String(info.prints.length + 1).padStart(2, '0')}-${nome}.png`);
      await page.screenshot({path: arq});
      info.prints.push({nome, t: agora(), arquivo: path.relative(saida, arq)});
    };
    const mover = async (x, y, ms = 700) => {
      const passos = Math.max(6, Math.round(ms / 40));
      const de = {...mouse};
      rastro.cursor.push({t: agora(), x: de.x, y: de.y});
      for (let i = 1; i <= passos; i++) {
        const k = i / passos;
        const e = k * k * (3 - 2 * k);
        await page.mouse.move(de.x + (x - de.x) * e, de.y + (y - de.y) * e);
        await sleep(ms / passos);
      }
      mouse = {x, y};
      rastro.cursor.push({t: agora(), x, y});
    };
    const centro = async (loc) => {
      await loc.scrollIntoViewIfNeeded();
      const b = await loc.boundingBox();
      if (!b) throw new Error('elemento sem caixa');
      return {x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2)};
    };
    const apontar = async (loc, ms) => { const c = await centro(loc); await mover(c.x, c.y, ms); return c; };
    const clicar = async (loc, ms) => {
      const c = await apontar(loc, ms);
      await sleep(250);
      rastro.cliques.push({t: agora(), x: c.x, y: c.y});
      await page.mouse.click(c.x, c.y);
    };

    // B1 + B3 · Trator MAX com obstáculo frontal (simulado)
    await page.goto(`${base}/sompo?aba=telemetria&cenario=${CENARIO}&desfecho=${DESFECHO}`, {waitUntil: 'load'});
    await page.locator('[data-sompo-model="gltf"], [data-sompo-model="modular"]').first().waitFor({timeout: 120000});
    await sleep(1500);
    marca('b1_campo');
    const palco = page.locator('.sompo-simulator-stage, [data-sompo-model]').first();
    await apontar(palco, 1000);
    await print('b1-campo');
    await sleep(3000);
    marca('b3_simulador');
    await apontar(page.getByText('Telemetria sintética').first(), 900);
    await sleep(1500);
    await apontar(page.locator('select[name="sompo-scenario"]'), 900);
    await sleep(1500);
    await page.getByText('Alerta de colisão').first().waitFor({timeout: 30000})
      .then(() => marca('b3_alerta'))
      .catch(() => info.erros.push('alerta de colisão não apareceu na pré-visualização'));
    await apontar(page.getByText(/Alerta de colisão|Colisão\/inclinação/).first(), 800).catch(() => {});
    await print('b3-alerta');
    await sleep(3000);

    // B4 · Gravar o episódio (real, telemetria simulada)
    const gravar = page.locator('[data-sompo-episode-run]');
    await gravar.waitFor({timeout: 30000});
    await clicar(gravar);
    marca('b4_gravando');
    await page.locator('[data-sompo-episode-recording]').waitFor({timeout: 30000}).catch(() => {});
    await apontar(palco, 900);
    await sleep(4000);
    await print('b4-gravando');
    await page.locator('[data-sompo-episode-done], [data-sompo-episode-error]').first().waitFor({timeout: 120000});
    if (await page.locator('[data-sompo-episode-error]').count()) throw new Error(`episódio falhou: ${await page.locator('[data-sompo-episode-error]').innerText()}`);
    await apontar(page.locator('[data-sompo-episode-done]'), 800);
    marca('b4_registrado');
    await print('b4-registrado');
    await sleep(2000);

    // B5 · Enviar à bancada (Conselho de Estratégia, padrão do painel)
    let runId = '';
    page.on('response', (resp) => {
      if (resp.url().includes('/api/luca-ai/persona-team/run') && resp.request().method() === 'POST') {
        resp.json().then((b) => { runId = b?.runId || runId; }).catch(() => {});
      }
    });
    const enviar = page.locator('[data-sompo-telemetry-run]');
    await enviar.waitFor({timeout: 30000});
    await page.locator('.sompo-telemetry-action').scrollIntoViewIfNeeded();
    await sleep(800);
    marca('b5_painel');
    await print('b5-painel');
    await clicar(enviar, 900);
    marca('b5_clique');
    await page.waitForURL(/luca-ai|sessao=/, {timeout: 120000}).catch(() => info.erros.push('sessão da bancada não abriu'));
    marca('b5_sessao');
    await sleep(4000);
    await print('b5-sessao');
    const limite = Date.now() + 14 * 60_000;
    const etapas = new Set();
    let estado = null;
    while (Date.now() < limite) {
      if (runId) {
        try {
          estado = await fetch(`${base}/api/luca-ai/persona-team/runs/${runId}`, {headers: {cookie: par}}).then((r) => r.json());
          for (const st of estado.steps || []) {
            const rot = String(st?.roleLabel || st?.roleId || '').trim();
            if (rot && !etapas.has(rot)) { etapas.add(rot); marca(`b5_etapa_${rot.toLowerCase().replace(/\s+/g, '_')}`); }
          }
          if (['completed', 'failed', 'succeeded', 'error', 'cancelled'].includes(String(estado.status))) break;
        } catch {}
      }
      await sleep(1500);
    }
    info.run = {runId: runId || null, status: estado?.status || (runId ? 'timeout' : 'sem_run'), etapas: [...etapas], erro: estado?.error || null};
    if (estado) await writeFile(path.join(saida, 'run.json'), JSON.stringify(estado, null, 2));

    // B6 · Veredito (só se a corrida real entregou)
    const entrega = page.getByText('Entrega final', {exact: true}).first();
    if (await entrega.waitFor({timeout: 30000}).then(() => true).catch(() => false)) {
      await entrega.scrollIntoViewIfNeeded();
      await sleep(1200);
      marca('b6_entrega');
      await apontar(entrega, 900);
      await print('b6-entrega');
      for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 45); await sleep(120); }
      await sleep(3500);
      marca('b6_texto');
      await print('b6-entrega-texto');
      await sleep(2500);
    } else {
      marca('b6_sem_entrega');
      await print('b6-sem-entrega');
    }

    // B7 · Safra: o mesmo episódio, com as imagens
    await page.goto(`${base}/sompo?aba=safra`, {waitUntil: 'load'});
    await page.locator('#sompo-fleet-title').waitFor({timeout: 30000});
    const ultimo = page.locator('.sompo-fleet-now .sompo-fleet-episode').first();
    await ultimo.waitFor({timeout: 30000});
    await ultimo.scrollIntoViewIfNeeded();
    await sleep(1000);
    marca('b7_safra');
    await clicar(ultimo.locator('summary'));
    await ultimo.locator('.sompo-fleet-frames img').first().waitFor({timeout: 30000});
    await sleep(1200);
    await apontar(ultimo.locator('.sompo-fleet-frames'), 900);
    marca('b7_frames');
    await print('b7-frames');
    await sleep(5000);

    marca('fim');
    await sleep(800);
    const video = page.video();
    await context.close();
    context = null;
    const cru = await video.path();
    const cena = path.join(saida, 'cena.mp4');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', cru, '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', cena]);
    info.video = {cru: path.relative(saida, cru), cena: path.relative(saida, cena)};
  } catch (erro) {
    info.erros.push(String(erro?.message || erro));
    throw erro;
  } finally {
    info.fim = new Date().toISOString();
    await writeFile(path.join(saida, 'timings.json'), JSON.stringify({...info, rastro}, null, 2));
    await writeFile(path.join(saida, 'app.log'), appLog.replaceAll(kamui?.token || '\u0000', '[token]').replaceAll(routerChave || '\u0000', '[chave]'));
    if (context) await context.close().catch(() => {});
    // connectOverCDP: close() só desconecta; o Chromium da bancada continua.
    if (browser) await browser.close().catch(() => {});
    app.kill();
    kamui?.fechar();
  }
  console.log(JSON.stringify({saida, marcas: rastro.marcas, run: info.run, erros: info.erros, bancada, feed}, null, 2));
}

await main();
