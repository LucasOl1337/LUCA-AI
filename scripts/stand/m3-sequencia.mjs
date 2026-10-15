#!/usr/bin/env node
// Roteiro de aceite da M3 ("IA clica no site") contra a demo offline (`npm run demo:sompo`).
// Faz o papel da página do stand: numa aba própria, posta ações no BroadcastChannel `luca-stand`
// e espera o resultado; o app, em outra aba com `?stand=1`, clica com o cursor visível.
// Uso: node scripts/stand/m3-sequencia.mjs --cdp http://127.0.0.1:19087 [--url http://127.0.0.1:4243]
//      [--prints DIR] [--video ARQ.mp4 --display :87 --xauthority ARQ]
// Nunca aponte para produção: o roteiro cria conta e grava episódio.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const opcoes = Object.fromEntries(process.argv.slice(2).reduce((pares, arg, i, todos) => (
  arg.startsWith('--') ? [...pares, [arg.slice(2), todos[i + 1]]] : pares), []));
const url = opcoes.url ?? 'http://127.0.0.1:4243';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) throw new Error(`Só demo local: ${url}`);
if (!opcoes.cdp) throw new Error('Informe --cdp (endpoint do Chromium da bancada).');
const prints = opcoes.prints ? path.resolve(opcoes.prints) : null;
if (prints) mkdirSync(prints, { recursive: true });

const PASSOS = [
  { acao: 'abrir_aba', args: { aba: 'telemetria' }, espera: true, print: 'm3-1-telemetria' },
  { acao: 'rodar_cenario', args: { id: 'stand-obstaculo-a-tempo' }, espera: true, print: 'm3-2-cenario' },
  { acao: 'analisar_na_bancada', args: {}, espera: true, print: 'm3-3-bancada' },
  { acao: 'abrir_aba', args: { aba: 'carteira' }, espera: false, print: 'm3-4-recusa' },
];

const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
let gravador = null;
if (opcoes.video) {
  gravador = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'x11grab', '-framerate', '25', '-video_size', opcoes.tamanho ?? '1600x1000',
    '-i', opcoes.display ?? ':0', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', path.resolve(opcoes.video)],
  { env: { ...process.env, DISPLAY: opcoes.display, XAUTHORITY: opcoes.xauthority ?? process.env.XAUTHORITY }, stdio: ['pipe', 'inherit', 'inherit'] });
}

const navegador = await chromium.connectOverCDP(opcoes.cdp);
const contexto = navegador.contexts()[0];
const stand = await contexto.newPage();
await stand.goto(`${url}/api/health`);
const conta = await stand.evaluate(async () => {
  const resposta = await fetch('/api/auth/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Stand M3', email: `stand-m3-${Date.now()}@luca.test`, password: 'senha-demo-stand-m3' }),
  });
  return resposta.status;
});
console.log(JSON.stringify({ conta }));

const app = await contexto.newPage();
await app.setViewportSize({ width: 1600, height: 900 }).catch(() => {});
await app.goto(`${url}/sompo?stand=1`);
await app.bringToFront();
await pausa(2500);

const resultados = [];
for (const passo of PASSOS) {
  const id = `m3-${passo.acao}-${resultados.length + 1}`;
  const resultado = await stand.evaluate(({ id, acao, args }) => new Promise((ok) => {
    const canal = new BroadcastChannel('luca-stand');
    const prazo = setTimeout(() => { canal.close(); ok({ id, ok: false, mensagem: 'sem resposta em 90 s' }); }, 90000);
    canal.onmessage = ({ data }) => {
      if (data?.tipo !== 'acao_site_resultado' || data.id !== id) return;
      clearTimeout(prazo); canal.close(); ok(data);
    };
    canal.postMessage({ tipo: 'acao_site', id, acao, args });
  }), { id, acao: passo.acao, args: passo.args });
  resultados.push({ ...passo, resultado });
  console.log(JSON.stringify({ acao: passo.acao, args: passo.args, resultado }));
  await pausa(1500);
  if (prints) await app.screenshot({ path: path.join(prints, `${passo.print}.png`) });
}

if (gravador) { gravador.stdin.write('q'); await new Promise((ok) => gravador.on('close', ok)); }
await stand.close();
await navegador.close();
const falhas = resultados.filter((item) => item.resultado.ok !== item.espera);
console.log(JSON.stringify({ aceite: falhas.length === 0, falhas: falhas.map((item) => item.acao) }));
process.exit(falhas.length === 0 ? 0 : 1);
