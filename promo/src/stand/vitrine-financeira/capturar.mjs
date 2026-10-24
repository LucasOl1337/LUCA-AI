// Captura da vitrine financeira (24/10): telas reais do LUCA-AI atual em 1920x1080
// nativo, sem upscale. Runtime local isolado (porta e LUCA_DATA_DIR próprios,
// conta descartável, LUCA_SOMPO_OFFLINE, rede externa bloqueada), Chromium com GPU
// numa bancada agent-bench em 1920x1080 e x11grab por cena. Roda na fila pesada:
//   agent-bench fila luca-vitrine rodar -- node promo/src/stand/vitrine-financeira/capturar.mjs --saida DIR
// Pré-requisitos: `npm run build`; `xrandr -s 1920x1080` dentro da bancada.
import {execFileSync, spawn} from 'node:child_process';
import {mkdtemp, mkdir, writeFile} from 'node:fs/promises';
import {existsSync, readFileSync} from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(aqui, '../../../..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, all) => (v.startsWith('--') ? [...acc, [v.slice(2), all[i + 1]]] : acc), []));
const saida = path.resolve(args.saida || path.join(os.tmpdir(), 'vitrine-financeira'));
const BANCADA = args.bancada || 'luca-vitrine';
const SO = (args.cenas || 'b1,b2,b3,b4,b5,b6').split(',');
const W = 1920; const H = 1080;
// --seco 1: ensaio headless sem gravar (valida seletores fora da fila; sem cena 3D).
const SECO = Boolean(args.seco);
const Y4M = args.y4m || '/home/lol/tmp/luca-webcam/rosto-1080.y4m';
const estado = JSON.parse(execFileSync('agent-bench', ['status', BANCADA], {encoding: 'utf8'}));
const ENV_X = {...process.env, DISPLAY: estado.display, XAUTHORITY: `/run/user/1000/agent-bench/${BANCADA}/Xauthority`};
const conta = {name: 'Demo Vitrine', email: 'vitrine@luca.test', password: `vitrine-${Date.now()}`};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1).padStart(6), ...a);

async function portaLivre() {
  return new Promise((ok, erro) => { const s = net.createServer(); s.unref(); s.on('error', erro); s.listen(0, '127.0.0.1', () => { const {port} = s.address(); s.close(() => ok(port)); }); });
}
async function esperar(url, ms = 30000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { try { const r = await fetch(url); if (r.status < 500) return; } catch {} await sleep(300); }
  throw new Error(`sem resposta em ${url}`);
}

// Gravação nativa do display da bancada, uma cena por arquivo; marcas relativas ao início.
let rec = null;
const marcas = {};
function gravar(cena) {
  if (SECO) { rec = {cena, p: null, inicio: Date.now()}; marcas[cena] = {}; log('REC(seco)', cena); return; }
  const arq = path.join(saida, 'bruto', `${cena}.mkv`);
  const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'x11grab', '-draw_mouse', '0', '-framerate', '30',
    '-video_size', `${W}x${H}`, '-i', `${estado.display}+0,0`, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '12', '-pix_fmt', 'yuv420p', arq],
  {env: ENV_X, stdio: ['pipe', 'ignore', 'inherit']});
  rec = {cena, p, inicio: Date.now()}; marcas[cena] = {};
  log('REC', cena);
}
const marcar = (rotulo) => { if (rec) { marcas[rec.cena][rotulo] = (Date.now() - rec.inicio) / 1000; log('MARCA', rec.cena, rotulo); } };
async function parar() {
  if (!rec) return; const {p, cena} = rec; rec = null;
  if (!p) { log('STOP(seco)', cena); return; }
  p.stdin.write('q'); await new Promise((r) => p.on('exit', r)); log('STOP', cena);
}

async function main() {
  if (!existsSync(path.join(repoDir, 'dist', 'index.html'))) throw new Error('rode `npm run build` antes');
  const tela = SECO ? `current ${W} x ${H}` : execFileSync('xrandr', [], {env: ENV_X, encoding: 'utf8'}).split('\n')[0];
  if (!tela.includes(`current ${W} x ${H}`)) throw new Error(`bancada fora de ${W}x${H}: ${tela}`);
  await mkdir(path.join(saida, 'bruto'), {recursive: true});
  await mkdir(path.join(saida, 'prints'), {recursive: true});
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'luca-vitrine-fin-'));
  await writeFile(path.join(dataDir, 'auth.json'), '{"version":1,"users":[],"sessions":[]}\n');
  const porta = await portaLivre();
  const app = spawn(process.execPath, ['--import', path.join(aqui, '../rede-permitida.mjs'), 'server/index.js'], {cwd: repoDir, stdio: ['ignore', 'pipe', 'pipe'], env: {
    ...process.env, PORT: String(porta), HOST: '127.0.0.1', LUCA_DATA_DIR: dataDir, LUCA_AUTH_DATA_PATH: path.join(dataDir, 'auth.json'),
    LUCA_ADMIN_EMAILS: '', LUCA_SOMPO_OFFLINE: 'true', REQUIRE_CLOUDFLARE_ACCESS: 'false', KAMUI_BASE: 'http://127.0.0.1:1', KAMUI_INTERNAL_API_TOKEN: '',
    SENNIN_INTERNAL_API_TOKEN: '', ROUTER_BASE_URL: 'http://127.0.0.1:1', ROUTER_API_KEY: '', NINE_ROUTER_API_KEY: '', LUCA_MACHINE_TOKEN: '',
    ELEVENLABS_API_KEY: '', LUCA_CAPTURA_PERMITIDOS: '', LUCA_CAPTURA_LOG_REDE: path.join(saida, 'rede.jsonl'),
  }});
  let appLog = ''; app.stdout.on('data', (c) => { appLog = (appLog + c).slice(-20000); }); app.stderr.on('data', (c) => { appLog = (appLog + c).slice(-20000); });
  const base = `http://127.0.0.1:${porta}`;
  const perfil = await mkdtemp(path.join(os.tmpdir(), 'luca-vitrine-chromium-'));
  let ctx;
  const info = {inicio: new Date().toISOString(), base, dataDir, commit: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repoDir, encoding: 'utf8'}).trim(), erros: [], prints: []};
  try {
    await esperar(`${base}/api/auth/session`);
    ctx = await chromium.launchPersistentContext(perfil, {
      executablePath: '/usr/bin/chromium', headless: SECO, env: ENV_X, ...(SECO ? {viewport: {width: W, height: H}, deviceScaleFactor: 1} : {viewport: null}), locale: 'pt-BR', colorScheme: 'dark',
      ignoreDefaultArgs: ['--enable-automation'],
      args: [...(SECO ? [] : ['--ozone-platform=x11', '--kiosk']), `--window-size=${W},${H}`, '--window-position=0,0', '--force-device-scale-factor=1', '--hide-scrollbars',
        '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${Y4M}`, '--autoplay-policy=no-user-gesture-required',
        '--no-first-run', '--no-default-browser-check', '--password-store=basic', '--disable-features=Translate', '--lang=pt-BR'],
    });
    const page = ctx.pages()[0] || await ctx.newPage();
    page.on('pageerror', (e) => info.erros.push(`pageerror: ${String(e.message).slice(0, 200)}`));
    await page.goto(base, {waitUntil: 'load'});
    const reg = await page.evaluate(async (c) => (await fetch('/api/auth/register', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(c)})).status, conta);
    if (reg !== 201 && reg !== 200) throw new Error(`registro falhou: ${reg}`);
    info.viewport = await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]);
    log('viewport', info.viewport);
    if (info.viewport[0] !== W || info.viewport[1] !== H || info.viewport[2] !== 1) throw new Error(`viewport ${info.viewport} != ${W}x${H}@1`);
    const cenas = await import('./cenas.mjs');
    await cenas.rodar({page, base, so: SO, gravar, parar, marcar, sleep, log, info, saida});
  } catch (e) {
    info.erros.push(String(e?.stack || e)); log('ERRO', e?.message);
  } finally {
    await parar().catch(() => {});
    await ctx?.close().catch(() => {});
    app.kill();
    await writeFile(path.join(saida, 'marcas.json'), JSON.stringify(marcas, null, 1));
    await writeFile(path.join(saida, 'captura.json'), JSON.stringify(info, null, 1));
    await writeFile(path.join(saida, 'app.log'), appLog);
  }
  if (info.erros.length) { console.error(info.erros.join('\n')); process.exitCode = 1; }
}
await main();
