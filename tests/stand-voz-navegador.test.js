// Voz do stand num navegador de verdade (Chromium + microfone falso), contra
// um servidor falso: /api/stand/sessao, Scribe falso (WebSocket) e turno falso.
// Prova que o toque abre o microfone, o áudio chega ao Scribe e a saudação toca,
// e que, sem conexão, a página cai no modo sem voz em vez de ficar presa em
// "Ligando o microfone…". Sob Playwright o `audioWorklet.addModule` não resolve
// (19/10), então o caminho feliz também exercita a captura pelo ScriptProcessor.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };

async function chromiumDisponivel() {
  try {
    const { chromium } = await import('playwright');
    for (const caminho of [process.env.LUCA_TESTE_CHROMIUM, '/usr/bin/chromium', chromium.executablePath()]) {
      if (caminho && existsSync(caminho)) return { chromium, caminho };
    }
  } catch { /* sem playwright */ }
  return null;
}

const navegador = await chromiumDisponivel();

describe('voz do stand no navegador', { skip: navegador ? false : 'sem Chromium para o Playwright' }, () => {
  let pasta;
  let servidor;
  let base;
  let browser;
  let tcpMudo;
  const scribe = { conexoes: 0, audios: 0 };
  const turnos = [];
  let modoSessao = 'ok';

  // PCM16 a 24 kHz: 0,3 s de um tom baixo, o bastante para a fila tocar.
  const pcmSaudacao = (() => {
    const amostras = new Int16Array(7200);
    for (let i = 0; i < amostras.length; i += 1) amostras[i] = Math.round(Math.sin(i / 8) * 3000);
    return Buffer.from(amostras.buffer).toString('base64');
  })();

  before(async () => {
    pasta = mkdtempSync(join(tmpdir(), 'stand-voz-nav-'));
    const { build } = await import('vite');
    await build({ root: RAIZ, logLevel: 'error', build: { outDir: pasta, emptyOutDir: true } });

    tcpMudo = createTcpServer(() => { /* aceita e nunca responde o handshake */ });
    await new Promise((ok) => tcpMudo.listen(0, '127.0.0.1', ok));
    const portaMuda = tcpMudo.address().port;

    servidor = createServer(async (req, res) => {
      const url = new URL(req.url, 'http://x');
      const json = (status, corpo) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(corpo)); };
      if (url.pathname === '/api/auth/session') {
        return json(200, { user: { id: 'u1', name: 'Stand', email: 'stand@teste', role: 'user', status: 'active' } });
      }
      if (url.pathname === '/api/stand/status') return json(200, { ligado: true });
      if (url.pathname === '/api/stand/sessao') {
        if (modoSessao === 'pendurada') return; // nunca responde
        const host = req.headers.host;
        const scribeUrl = modoSessao === 'ws_mudo' ? `ws://127.0.0.1:${portaMuda}/` : `ws://${host}/scribe-falso`;
        return json(200, { provedor: 'elevenlabs', conversa_id: 'c-teste', limites: { silencio_s: 20, teto_s: 240 }, sessao: {}, conexao: { transporte: 'scribe', url: scribeUrl } });
      }
      if (url.pathname === '/api/stand/turno') {
        let corpo = '';
        for await (const pedaco of req) corpo += pedaco;
        turnos.push(JSON.parse(corpo || '{}'));
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
        res.write(`${JSON.stringify({ t: 'frase', texto: 'Oi! Eu sou o LUCA.' })}\n`);
        res.write(`${JSON.stringify({ t: 'audio', pcm: pcmSaudacao })}\n`);
        return res.end(`${JSON.stringify({ t: 'fim', motivo: 'ok' })}\n`);
      }
      if (url.pathname.startsWith('/api/')) return json(404, { error: 'nao_existe' });
      let arquivo = join(pasta, normalize(url.pathname));
      if (!arquivo.startsWith(pasta) || !existsSync(arquivo) || statSync(arquivo).isDirectory()) arquivo = join(pasta, 'index.html');
      res.writeHead(200, { 'Content-Type': TIPOS[extname(arquivo)] || 'application/octet-stream' });
      res.end(readFileSync(arquivo));
    });
    const wss = new WebSocketServer({ noServer: true });
    servidor.on('upgrade', (req, socket, head) => {
      if (!req.url.startsWith('/scribe-falso')) return socket.destroy();
      wss.handleUpgrade(req, socket, head, (ws) => {
        scribe.conexoes += 1;
        ws.on('message', (dados) => {
          try { if (JSON.parse(String(dados)).message_type === 'input_audio_chunk') scribe.audios += 1; } catch { /* ignora */ }
        });
      });
    });
    await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
    base = `http://127.0.0.1:${servidor.address().port}`;
    browser = await navegador.chromium.launch({
      executablePath: navegador.caminho,
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
    });
  });

  after(async () => {
    await browser?.close();
    servidor?.close();
    tcpMudo?.close();
    if (pasta) rmSync(pasta, { recursive: true, force: true });
  });

  async function abrirStand() {
    const pagina = await browser.newPage();
    const avisos = [];
    pagina.on('console', (m) => avisos.push(m.text()));
    await pagina.goto(`${base}/stand`);
    await pagina.locator('main.stand[data-voz-stand="ligada"]').waitFor({ timeout: 15000 });
    await pagina.locator('main.stand').click({ position: { x: 40, y: 40 } });
    return { pagina, avisos };
  }

  it('toque abre o microfone, manda áudio ao Scribe e toca a saudação', async () => {
    modoSessao = 'ok';
    const { pagina, avisos } = await abrirStand();
    await pagina.waitForFunction(() => document.querySelector('main.stand')?.dataset.sessao === 'ativa');
    const prazo = Date.now() + 12000;
    while ((scribe.audios < 5 || !turnos.some((t) => t.evento === 'saudacao')) && Date.now() < prazo) {
      await new Promise((ok) => setTimeout(ok, 200));
    }
    assert.equal(scribe.conexoes, 1, 'abriu o WebSocket do Scribe');
    assert.ok(scribe.audios >= 5, `áudio do microfone chegou ao Scribe (${scribe.audios} pedaços)`);
    assert.deepEqual(turnos.find((t) => t.evento === 'saudacao'), { conversa_id: 'c-teste', evento: 'saudacao' });
    await pagina.getByText('Oi! Eu sou o LUCA.').waitFor({ timeout: 5000 });
    assert.equal(await pagina.locator('main.stand').getAttribute('data-sessao'), 'ativa');
    assert.ok(!avisos.some((a) => /turno falhou/.test(a)), avisos.join('\n'));
    await pagina.close();
  });

  it('sessão que não responde cai no modo sem voz em até 8 s', async () => {
    modoSessao = 'pendurada';
    const { pagina } = await abrirStand();
    const inicio = Date.now();
    await pagina.locator('main.stand[data-voz-stand="desligada"]').waitFor({ timeout: 11000 });
    const passou = Date.now() - inicio;
    assert.ok(passou >= 7000 && passou < 10500, `caiu em ${passou} ms`);
    assert.equal(await pagina.locator('main.stand').getAttribute('data-motivo'), 'erro:sem_conexao_sessao');
    assert.equal(await pagina.getByText('Ligando o microfone…').count(), 0);
    await pagina.close();
  });

  it('WebSocket do Scribe que não abre cai no modo sem voz com a etapa', async () => {
    modoSessao = 'ws_mudo';
    const { pagina } = await abrirStand();
    await pagina.locator('main.stand[data-voz-stand="desligada"]').waitFor({ timeout: 11000 });
    assert.equal(await pagina.locator('main.stand').getAttribute('data-motivo'), 'erro:sem_conexao_provedor');
    assert.equal(await pagina.getByText('Ligando o microfone…').count(), 0);
    await pagina.close();
  });
});
