// Captura dos vídeos M6 (painel-sompo e painel-segurado) numa instância
// local isolada do LUCA-AI: data dir temporário, telemetria só do simulador
// (LUCA_SOMPO_OFFLINE=true), conta de demonstração local.
//
// Bancada de agentes (só no roteiro sompo): 9Router real com a chave do
// próprio ambiente (NINE_ROUTER_*) e personas lidas por GET no Kamui da
// sennin-kvm via túnel SSH. O token Kamui vive só no env do processo filho;
// nada é impresso nem gravado. Se a bancada falhar, a captura registra a
// falha em timings.json e o vídeo usa o plano B do roteiro (só o envio).
//
// Uso: node promo/src/stand/sompo/capturar-paineis.mjs --roteiro sompo|segurado --saida DIR
// Pré-requisito: `npm run build` (o Express serve dist/).
// Saída: DIR/cena.mp4 (1920x1080), DIR/timings.json (rastro p/ ZoomCursor), DIR/prints/*.png, DIR/run.json.

import {execFileSync, spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir, mkdtemp, writeFile} from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, all) => (v.startsWith('--') ? [...acc, [v.slice(2), all[i + 1]]] : acc), []));
const roteiro = args.roteiro;
if (!['sompo', 'segurado'].includes(roteiro)) throw new Error('--roteiro sompo|segurado');
const saida = path.resolve(args.saida || path.join(os.tmpdir(), `m6-captura-${roteiro}`));
const LARGURA = 1920;
const ALTURA = 1080;
const VEICULO_TRATOR = 'trator-0001';
const CENARIO = 'max-slope-rollover';
const DESFECHO = 'controlled-stop';
const conta = {name: 'Demo Stand', email: 'stand-m6@luca.test', password: `stand-m6-${Date.now()}`};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function portaLivre() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const {port} = s.address(); s.close(() => resolve(port)); });
  });
}

async function esperar(url, ms = 30000, headers = {}) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    try { const r = await fetch(url, {headers}); if (r.status < 500) return r.status; } catch {}
    await sleep(300);
  }
  throw new Error(`sem resposta em ${url}`);
}

/** Kamui real (GET) via túnel SSH; devolve {base, token, fechar} ou null se indisponível. */
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

async function main() {
  if (!existsSync(path.join(repoDir, 'dist', 'index.html'))) throw new Error('rode `npm run build` antes');
  await mkdir(path.join(saida, 'prints'), {recursive: true});
  const bruto = path.join(saida, 'bruto');
  await mkdir(bruto, {recursive: true});
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'luca-stand-m6-'));
  await writeFile(path.join(dataDir, 'auth.json'), '{"version":1,"users":[],"sessions":[]}\n');

  const usaBancada = roteiro === 'sompo';
  const kamui = usaBancada ? await abrirKamui() : null;
  const routerBase = process.env.NINE_ROUTER_BASE_URL ? `${process.env.NINE_ROUTER_BASE_URL.replace(/\/+$/, '').replace(/\/v1$/, '')}/v1` : '';
  const bancada = {
    kamui: kamui ? 'real (GET via túnel sennin-kvm)' : 'indisponível',
    router: usaBancada && routerBase && process.env.NINE_ROUTER_API_KEY ? '9Router real' : 'desligado',
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
    ROUTER_BASE_URL: bancada.router === '9Router real' ? routerBase : 'http://127.0.0.1:1',
    ROUTER_API_KEY: bancada.router === '9Router real' ? process.env.NINE_ROUTER_API_KEY : '',
    NINE_ROUTER_API_KEY: '',
    LUCA_MACHINE_TOKEN: '',
  };
  const app = spawn(process.execPath, ['server/index.js'], {cwd: repoDir, env, stdio: ['ignore', 'pipe', 'pipe']});
  let appLog = '';
  app.stdout.on('data', (c) => { appLog = (appLog + c).slice(-20000); });
  app.stderr.on('data', (c) => { appLog = (appLog + c).slice(-20000); });

  const rastro = {viewport: {largura: LARGURA, altura: ALTURA}, cliques: [], cursor: [], marcas: {}};
  const info = {roteiro, inicio: new Date().toISOString(), bancada, prints: [], run: null, erros: []};
  let browser;
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

    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || '/usr/sbin/chromium',
      headless: true,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    });
    const context = await browser.newContext({
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
    const rolar = async (dy, ms = 900) => {
      const passos = 12;
      for (let i = 0; i < passos; i++) { await page.mouse.wheel(0, dy / passos); await sleep(ms / passos); }
    };
    const modeloPronto = () => page.locator('[data-sompo-model="gltf"], [data-sompo-model="modular"]').first().waitFor({timeout: 120000});

    async function gravarEpisodio(prefixo) {
      const botao = page.locator('[data-sompo-episode-run]');
      await botao.waitFor({timeout: 30000});
      await clicar(botao);
      marca(`${prefixo}_gravando`);
      await page.locator('[data-sompo-episode-recording]').waitFor({timeout: 30000}).catch(() => {});
      await sleep(4000);
      await print(`${prefixo}-gravando`);
      await page.locator('[data-sompo-episode-done], [data-sompo-episode-error]').first().waitFor({timeout: 120000});
      if (await page.locator('[data-sompo-episode-error]').count()) throw new Error(`episódio falhou: ${await page.locator('[data-sompo-episode-error]').innerText()}`);
      marca(`${prefixo}_registrado`);
      await print(`${prefixo}-registrado`);
    }

    async function abrirTrator() {
      await page.goto(`${base}/sompo?aba=telemetria&veiculo=${VEICULO_TRATOR}&cenario=${CENARIO}&desfecho=${DESFECHO}`, {waitUntil: 'load'});
      await modeloPronto();
      await sleep(1500);
    }

    async function abrirUltimoEpisodio(prefixo) {
      const ultimo = page.locator('.sompo-fleet-now .sompo-fleet-episode').first();
      await ultimo.waitFor({timeout: 30000});
      await clicar(ultimo.locator('summary'));
      await ultimo.locator('.sompo-fleet-frames img').first().waitFor({timeout: 30000});
      await sleep(1200);
      await apontar(ultimo.locator('.sompo-fleet-frames'), 900);
      marca(`${prefixo}_frames`);
      await print(`${prefixo}-frames`);
      await sleep(4000);
    }

    if (roteiro === 'sompo') {
      // Preparo: grava um episódio de verdade para a Safra ter o que mostrar.
      marca('preparo');
      await abrirTrator();
      await gravarEpisodio('preparo');

      // B1 · Welcome
      await page.goto(`${base}/sompo`, {waitUntil: 'load'});
      await page.locator('#sompo-welcome-title').waitFor({timeout: 30000});
      await sleep(1500);
      marca('b1_welcome');
      await apontar(page.locator('#sompo-welcome-title'), 900);
      await print('b1-welcome');
      await sleep(2500);

      // B2 · Casos agrícolas + dados públicos
      await clicar(page.locator('.sompo-welcome-proceed'));
      await page.locator('#sompo-entry-title').waitFor();
      await sleep(900);
      await clicar(page.locator('.sompo-entry-option[href="/sompo?aba=casos"]'));
      await page.locator('.sompo-context-card').first().waitFor({timeout: 30000});
      marca('b2_casos');
      await sleep(800);
      const cards = page.locator('.sompo-context-card');
      for (let i = 0; i < await cards.count(); i++) { await apontar(cards.nth(i), 700); await sleep(900); }
      await print('b2-contexto');
      marca('b2_grade');
      await apontar(page.locator('.sompo-case-card').first(), 900);
      await rolar(420);
      await sleep(1500);
      await print('b2-casos');

      // B3 · Safra: frota demonstrativa
      await page.mouse.wheel(0, -4000);
      await sleep(600);
      await clicar(page.locator('.sompo-view-switch button', {hasText: 'Safra'}));
      await page.locator('#sompo-fleet-title').waitFor({timeout: 30000});
      await sleep(1500);
      const demo = page.locator('.sompo-fleet-demo');
      await demo.scrollIntoViewIfNeeded();
      marca('b3_safra_demo');
      await apontar(demo.locator('.sompo-fleet-badge'), 900);
      await sleep(1200);
      await apontar(demo.locator('.sompo-fleet-charts article').nth(0), 900);
      await sleep(1500);
      await print('b3-frota');
      await apontar(demo.locator('.sompo-fleet-charts article').nth(1), 900);
      await sleep(2000);

      // B4 · Último episódio gravado (o do preparo)
      await page.locator('.sompo-fleet-now').scrollIntoViewIfNeeded();
      marca('b4_episodio');
      await abrirUltimoEpisodio('b4');

      // B6 (gravado antes do clique): rodapé com as pendências declaradas
      const rodape = page.locator('.sompo-fleet-decision');
      await rodape.scrollIntoViewIfNeeded();
      await sleep(800);
      marca('b6_rodape');
      await apontar(rodape.locator('p').first(), 900);
      await print('b6-rodape');
      await sleep(2500);

      // B5 · Bancada de agentes (9Router real, uma corrida só)
      let runId = '';
      page.on('response', (resp) => {
        if (resp.url().includes('/api/luca-ai/persona-team/run') && resp.request().method() === 'POST') {
          resp.json().then((b) => { runId = b?.runId || runId; }).catch(() => {});
        }
      });
      marca('b5_clique');
      await clicar(rodape.getByRole('button', {name: /Decidir a próxima safra na bancada/}));
      await page.waitForURL(/luca-ai|sessao=/, {timeout: 60000}).catch(() => {});
      marca('b5_sessao');
      await sleep(4000);
      await print('b5-sessao');
      const cabecalho = {cookie: par};
      const limite = Date.now() + 9 * 60_000;
      const etapas = new Set();
      let estado = null;
      while (Date.now() < limite) {
        if (runId) {
          try {
            estado = await fetch(`${base}/api/luca-ai/persona-team/runs/${runId}`, {headers: cabecalho}).then((r) => r.json());
            for (const st of estado.steps || []) {
              const rot = String(st?.roleLabel || st?.roleId || '').trim();
              if (rot && !etapas.has(rot)) { etapas.add(rot); marca(`b5_etapa_${rot.toLowerCase().replace(/\s+/g, '_')}`); }
            }
            if (['completed', 'failed', 'succeeded', 'error', 'cancelled'].includes(String(estado.status))) break;
          } catch {}
        }
        await sleep(1500);
      }
      info.run = {
        runId: runId || null,
        status: estado?.status || (runId ? 'timeout' : 'sem_run'),
        etapas: [...etapas],
        erro: estado?.error || null,
      };
      if (estado) await writeFile(path.join(saida, 'run.json'), JSON.stringify(estado, null, 2));
      const entrega = page.getByText('Entrega final', {exact: true}).first();
      if (await entrega.isVisible().catch(() => false) || await entrega.waitFor({timeout: 30000}).then(() => true).catch(() => false)) {
        await entrega.scrollIntoViewIfNeeded();
        await sleep(1200);
        marca('b5_entrega');
        await apontar(entrega, 900);
        await print('b5-entrega');
        await rolar(500, 1500);
        await sleep(3000);
        await print('b5-entrega-texto');
      } else {
        marca('b5_sem_entrega');
        await print('b5-sem-entrega');
      }
    } else {
      // B1 · Veículos: cadastro de exemplo
      await page.goto(`${base}/sompo?aba=veiculos`, {waitUntil: 'load'});
      const cartao = page.locator('.sompo-vehicles-list li', {hasText: 'John Deere 6110J'});
      await cartao.waitFor({timeout: 30000});
      await sleep(1200);
      marca('b1_veiculos');
      await apontar(cartao.locator('.sompo-vehicles-card-title'), 900);
      await print('b1-veiculos');
      await sleep(2000);

      // B2 · Usar no simulador
      await clicar(cartao.getByRole('button', {name: /Usar no simulador/}));
      marca('b2_simulador');
      await modeloPronto();
      await sleep(1500);
      await print('b2-simulador');

      // B3 · Curva inclinada, parada controlada (simulado)
      const cenario = page.locator('select[name="sompo-scenario"]');
      await apontar(cenario, 900);
      rastro.cliques.push({t: agora(), ...mouse});
      await cenario.selectOption(CENARIO);
      await sleep(900);
      const desfecho = page.locator('select[name="sompo-scenario-outcome"]');
      if (await desfecho.count()) {
        await apontar(desfecho, 700);
        rastro.cliques.push({t: agora(), ...mouse});
        await desfecho.selectOption(DESFECHO);
      }
      marca('b3_cenario');
      await sleep(1200);
      await print('b3-cenario');
      const alerta = page.getByText('Alerta de inclinação').first();
      await alerta.waitFor({timeout: 30000}).then(() => marca('b3_alerta')).catch(() => info.erros.push('alerta de inclinação não apareceu na pré-visualização'));
      await apontar(page.locator('.sompo-simulator-stage, [data-sompo-model]').first(), 900);
      await print('b3-alerta');
      await sleep(6000);

      // B4 · Gravar o episódio
      marca('b4_gravar');
      await gravarEpisodio('b4');
      await sleep(1500);

      // B5 · Safra: o episódio vira evidência
      await page.mouse.wheel(0, -4000);
      await sleep(500);
      await clicar(page.locator('.sompo-view-switch button', {hasText: 'Safra'}));
      await page.locator('#sompo-fleet-title').waitFor({timeout: 30000});
      await page.locator('.sompo-fleet-now').scrollIntoViewIfNeeded();
      marca('b5_safra');
      await abrirUltimoEpisodio('b5');
    }

    marca('fim');
    await sleep(1000);
    const video = page.video();
    await context.close();
    const cru = await video.path();
    const cena = path.join(saida, 'cena.mp4');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', cru, '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', cena]);
    info.video = {cru: path.relative(saida, cru), cena: path.relative(saida, cena)};
  } catch (erro) {
    info.erros.push(String(erro?.message || erro));
    await writeFile(path.join(saida, 'app.log'), appLog.replaceAll(kamui?.token || '\u0000', '[token]'));
    throw erro;
  } finally {
    info.fim = new Date().toISOString();
    await writeFile(path.join(saida, 'timings.json'), JSON.stringify({...info, rastro}, null, 2));
    if (browser) await browser.close().catch(() => {});
    app.kill();
    kamui?.fechar();
  }
  console.log(JSON.stringify({saida, marcas: rastro.marcas, run: info.run, erros: info.erros, bancada}, null, 2));
}

await main();
