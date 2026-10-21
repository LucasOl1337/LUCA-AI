// Voz do stand num navegador de verdade (Chromium + microfone falso), contra
// um servidor falso: /api/stand/sessao, Scribe falso (WebSocket) e turno falso.
// Prova que o toque abre o microfone, o áudio chega ao Scribe e a saudação toca,
// e que, sem conexão, a página cai no modo sem voz em vez de ficar presa em
// "Ligando o microfone…". Sob Playwright o `audioWorklet.addModule` não resolve
// sozinho: o Playwright anexa os alvos com `waitForDebuggerOnStart` e o alvo
// `worklet` fica pausado esperando um debugger que nunca o solta (21/10). Sem
// cliente CDP o módulo carrega em ~5 ms. Os testes que não chamam
// `soltarWorklets` exercitam a reserva pelo ScriptProcessor; os que chamam,
// o caminho do worklet, que é o do totem.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { cabecalhosDeSeguranca } from '../server/cabecalhos-seguranca.js';

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

/**
 * Solta o worklet que o auto-attach do Playwright deixa pausado: anexa só os
 * alvos `worklet` desta página e manda `runIfWaitingForDebugger`. Fica anexado
 * (morre com a página): desanexar fazia o worklet seguinte às vezes não
 * responder (21/10, 1 em 3). Chamar antes do `goto`.
 */
async function soltarWorklets(pagina) {
  const cdp = await pagina.context().newCDPSession(pagina);
  cdp.on('Target.attachedToTarget', ({ sessionId }) => {
    const message = JSON.stringify({ id: 1, method: 'Runtime.runIfWaitingForDebugger' });
    cdp.send('Target.sendMessageToTarget', { sessionId, message }).catch(() => { /* página fechou */ });
  });
  await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: false, filter: [{ type: 'worklet' }] });
}

/** WAV mono 16 bits: `silencioS` de silêncio e `vozS` de um tom alto, como alguém falando no microfone. */
function wavDeEscuta(silencioS, vozS, hz = 24000) {
  const amostras = new Int16Array(Math.round((silencioS + vozS) * hz));
  for (let i = Math.round(silencioS * hz); i < amostras.length; i += 1) amostras[i] = Math.round(Math.sin(i / 12) * 9000);
  const cabecalho = Buffer.alloc(44);
  cabecalho.write('RIFF', 0); cabecalho.writeUInt32LE(36 + amostras.byteLength, 4); cabecalho.write('WAVE', 8);
  cabecalho.write('fmt ', 12); cabecalho.writeUInt32LE(16, 16); cabecalho.writeUInt16LE(1, 20); cabecalho.writeUInt16LE(1, 22);
  cabecalho.writeUInt32LE(hz, 24); cabecalho.writeUInt32LE(hz * 2, 28); cabecalho.writeUInt16LE(2, 32); cabecalho.writeUInt16LE(16, 34);
  cabecalho.write('data', 36); cabecalho.writeUInt32LE(amostras.byteLength, 40);
  return Buffer.concat([cabecalho, Buffer.from(amostras.buffer)]);
}

describe('voz do stand no navegador', { skip: navegador ? false : 'sem Chromium para o Playwright' }, () => {
  let pasta;
  let servidor;
  let base;
  let browser;
  let tcpMudo;
  /** `formatos`: taxa e bytes de PCM de cada `input_audio_chunk` que chega. */
  const scribe = { conexoes: 0, audios: 0, rajadas: [], formatos: [] };
  const turnos = [];
  let modoSessao = 'ok';
  let escutaNoServidor = false;
  let browserEscuta;
  /** Quando definido, o Scribe falso devolve esta transcrição parcial depois de 40 pedaços de áudio. */
  let parcialDoScribe = '';

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
      // Cabeçalhos de produção: a Permissions-Policy de cada página vale para o documento inteiro.
      for (const [nome, valor] of Object.entries(cabecalhosDeSeguranca(url.pathname))) res.setHeader(nome, valor);
      const json = (status, corpo) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(corpo)); };
      if (url.pathname === '/api/health') return json(200, { ok: true });
      if (url.pathname === '/api/auth/session') {
        return json(200, { user: { id: 'u1', name: 'Stand', email: 'stand@teste', role: 'user', status: 'active' } });
      }
      if (url.pathname === '/api/stand/status') return json(200, { ligado: true, escuta: escutaNoServidor });
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
        // Pedaços que chegam nos primeiros 100 ms da conexão: a pré-rolagem da escuta vem de uma vez.
        const rajada = { inicio: 0, pedacos: 0 };
        scribe.rajadas.push(rajada);
        let pedacos = 0;
        ws.on('message', (dados) => {
          try {
            const mensagem = JSON.parse(String(dados));
            if (mensagem.message_type !== 'input_audio_chunk') return;
            scribe.audios += 1;
            scribe.formatos.push({ hz: mensagem.sample_rate, bytes: Buffer.from(mensagem.audio_base_64, 'base64').length });
            rajada.inicio ||= Date.now();
            if (Date.now() - rajada.inicio < 100) rajada.pedacos += 1;
            pedacos += 1;
            if (parcialDoScribe && pedacos === 40) ws.send(JSON.stringify({ message_type: 'partial_transcript', text: parcialDoScribe }));
          } catch { /* ignora */ }
        });
      });
    });
    await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
    base = `http://127.0.0.1:${servidor.address().port}`;
    browser = await navegador.chromium.launch({
      executablePath: navegador.caminho,
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
    });
    // Microfone da escuta: 5 s de silêncio e 1 s de voz, em laço (folga para a página abrir sob carga).
    const wav = join(pasta, 'escuta.wav');
    writeFileSync(wav, wavDeEscuta(5, 1));
    browserEscuta = await navegador.chromium.launch({
      executablePath: navegador.caminho,
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`, '--autoplay-policy=no-user-gesture-required'],
    });
  });

  after(async () => {
    await browser?.close();
    await browserEscuta?.close();
    servidor?.close();
    tcpMudo?.close();
    if (pasta) rmSync(pasta, { recursive: true, force: true });
  });

  async function abrirStand({ worklet = false } = {}) {
    const pagina = await browser.newPage();
    const avisos = [];
    pagina.on('console', (m) => avisos.push(m.text()));
    if (worklet) await soltarWorklets(pagina);
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

  it('captura pelo worklet (o caminho do totem): sem reserva, mesmo formato do ScriptProcessor', async () => {
    modoSessao = 'ok';
    // Referência: o caminho da reserva, como o Playwright deixa sem ajuda.
    const formatosDaReserva = [...scribe.formatos];
    assert.ok(formatosDaReserva.length >= 5, 'o teste anterior mandou áudio pelo ScriptProcessor');
    const conexoesAntes = scribe.conexoes;
    const pedacosAntes = scribe.formatos.length;
    const { pagina, avisos } = await abrirStand({ worklet: true });
    try {
      await pagina.waitForFunction(() => document.querySelector('main.stand')?.dataset.sessao === 'ativa');
      const prazo = Date.now() + 12000;
      while (scribe.formatos.length - pedacosAntes < 20 && Date.now() < prazo) await new Promise((ok) => setTimeout(ok, 100));
      assert.equal(scribe.conexoes, conexoesAntes + 1);
      assert.ok(!avisos.some((a) => /worklet do microfone falhou/.test(a)), `caiu na reserva:\n${avisos.join('\n')}`);
      const doWorklet = scribe.formatos.slice(pedacosAntes);
      assert.ok(doWorklet.length >= 20, `áudio do worklet chegou ao Scribe (${doWorklet.length} pedaços)`);
      // Mesmo contrato nos dois caminhos: PCM16 a 24 kHz em blocos de 50 ms (1200 amostras).
      const formato = (lista) => [...new Set(lista.map((f) => `${f.hz} Hz, ${f.bytes} B`))];
      assert.deepEqual(formato(doWorklet), ['24000 Hz, 2400 B']);
      assert.deepEqual(formato(formatosDaReserva), ['24000 Hz, 2400 B']);
    } finally {
      await pagina.close();
    }
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

  it('escuta: voz abre a conversa sem toque, sem saudação, com a pré-rolagem; barulho sem fala pausa', async () => {
    modoSessao = 'ok';
    escutaNoServidor = true;
    const antes = { conexoes: scribe.conexoes, turnos: turnos.length };
    const pagina = await browserEscuta.newPage();
    try {
      await pagina.goto(`${base}/stand`);
      const main = pagina.locator('main.stand');
      // Estado e texto no mesmo instante: a voz do wav pode despertar logo depois.
      await pagina.waitForFunction(() => {
        const main = document.querySelector('main.stand');
        return main?.dataset.escuta === 'ouvindo' && main.textContent.includes('É só falar que eu escuto.');
      }, null, { timeout: 15000 });
      // Ninguém tocou: a voz do wav desperta a sessão.
      await pagina.locator('main.stand[data-escuta="conversa"]').waitFor({ timeout: 15000 });
      assert.equal(await main.getAttribute('data-sessao'), 'ativa');
      const prazo = Date.now() + 8000;
      while (scribe.conexoes === antes.conexoes && Date.now() < prazo) await new Promise((ok) => setTimeout(ok, 100));
      await new Promise((ok) => setTimeout(ok, 500));
      assert.equal(await main.getAttribute('data-tela'), 'atracao', 'Despertar sem palavra não tira a Atração da tela');
      const rajada = scribe.rajadas.at(-1);
      // O despertar pede 250 ms acima do limiar: ao menos esses 5 blocos vão juntos.
      assert.ok(rajada.pedacos >= 5, `pré-rolagem chegou de uma vez ao Scribe (${rajada.pedacos} pedaços em 100 ms)`);
      assert.equal(turnos.slice(antes.turnos).filter((t) => t.evento === 'saudacao').length, 0, 'despertada pela voz não saúda');
      // O Scribe falso nunca transcreve: 6 s depois a sessão fecha sem fala e a escuta volta.
      await pagina.waitForFunction(() => document.querySelector('main.stand')?.dataset.sessao === 'silencio', null, { timeout: 12000 });
      await pagina.locator('main.stand[data-escuta="ouvindo"]').waitFor({ timeout: 3000 });
      // 2º despertar sem fala: a escuta pausa em vez de abrir sessão atrás de sessão.
      await pagina.locator('main.stand[data-escuta="pausada"]').waitFor({ timeout: 30000 });
      assert.ok(scribe.conexoes - antes.conexoes >= 2);
    } finally {
      escutaNoServidor = false;
      await pagina.close();
    }
  });

  it('escuta: a Conversa só abre quando o Scribe devolve palavra de verdade', async () => {
    modoSessao = 'ok';
    escutaNoServidor = true;
    parcialDoScribe = 'o que é o luca';
    const pagina = await browserEscuta.newPage();
    try {
      await pagina.goto(`${base}/stand`);
      await pagina.locator('main.stand[data-escuta="conversa"]').waitFor({ timeout: 20000 });
      await pagina.locator('main.stand[data-tela="conversa"]').waitFor({ timeout: 8000 });
      await pagina.getByText('o que é o luca').waitFor({ timeout: 3000 });
    } finally {
      escutaNoServidor = false;
      parcialDoScribe = '';
      await pagina.close();
    }
  });

  it('escuta na Vitrine: despertar falso não corta o vídeo; palavra leva à Coruja na Conversa', async () => {
    modoSessao = 'ok';
    escutaNoServidor = true;
    const antes = scribe.conexoes;
    const pagina = await browserEscuta.newPage();
    try {
      // Relógio falso correndo em tempo real, para o teste poder adiantar a barra (abaixo).
      await pagina.clock.install();
      await pagina.goto(`${base}/stand`);
      const main = pagina.locator('main.stand');
      await pagina.locator('main.stand[data-escuta="ouvindo"]').waitFor({ timeout: 15000 });
      // Botão da barra direto: não passa pelo toque da Atração (que abriria a conversa).
      await pagina.evaluate(() => {
        const botao = [...document.querySelectorAll('.stand-barra button')].find((b) => b.textContent.includes('Vitrine'));
        botao.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      });
      await pagina.locator('main.stand[data-modo="vitrine"][data-escuta="ouvindo"]').waitFor({ timeout: 5000 });
      // Barra apagada (5 s): a linha fixa aparece. O relógio da página pula os 5 s da barra;
      // esperar em tempo real disputava com o despertar do WAV (5 s de silêncio desde a
      // abertura do microfone): sob carga a voz chegava antes e a linha some na conversa.
      await pagina.clock.fastForward(5_500);
      await pagina.locator('.stand-linha-escuta', { hasText: 'O LUCA só ouve quando você fala com ele.' }).waitFor({ timeout: 3000 });
      // 1º despertar sem palavra: a sessão abre e fecha sem tirar a Vitrine.
      await pagina.locator('main.stand[data-escuta="conversa"]').waitFor({ timeout: 15000 });
      assert.equal(await main.getAttribute('data-modo'), 'vitrine', 'despertar sem palavra não corta a Vitrine');
      await pagina.waitForFunction(() => document.querySelector('main.stand')?.dataset.sessao === 'silencio', null, { timeout: 12000 });
      assert.equal(await main.getAttribute('data-modo'), 'vitrine');
      assert.ok(scribe.conexoes > antes);
      // 2º despertar com palavra: a Coruja assume já na Conversa, com a pergunta na legenda.
      parcialDoScribe = 'como o trator avisa';
      await pagina.locator('main.stand[data-modo="coruja"][data-tela="conversa"]').waitFor({ timeout: 20000 });
      await pagina.getByText('como o trator avisa').waitFor({ timeout: 3000 });
      assert.equal(await pagina.locator('.stand-linha-escuta').count(), 0, 'a linha some na Conversa');
    } finally {
      escutaNoServidor = false;
      parcialDoScribe = '';
      await pagina.close();
    }
  });

  it('permissão pendente: ajuda aos 10 s, Vitrine disponível e resposta tardia volta a ouvir', async () => {
    escutaNoServidor = true;
    const pagina = await browser.newPage();
    try {
      await pagina.addInitScript(() => {
        const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = (opcoes) => new Promise((resolve, reject) => {
          window.__permitirMicrofone = () => original(opcoes).then(resolve, reject);
        });
      });
      // Relógio da página parado: os 10 s contam do setTimeout do app, não de quando o teste
      // percebe o "abrindo" (sob carga essa percepção atrasava mais de 0,5 s e a ajuda saía
      // "cedo" no relógio do teste). A montagem anda em passos de 100 ms (o Suspense do React
      // usa timer), então ao ver "abrindo" o prazo da ajuda já correu entre 0 e 100 ms.
      await pagina.clock.install();
      await pagina.clock.pauseAt(Date.now() + 1000);
      await pagina.goto(`${base}/stand`);
      const abrindo = pagina.locator('main.stand[data-escuta="abrindo"]');
      const limite = Date.now() + 15000;
      while (Date.now() < limite && await abrindo.count() === 0) { await pagina.clock.runFor(100); await pagina.waitForTimeout(20); }
      await abrindo.waitFor({ timeout: 1000 });
      await pagina.getByText('Ligando o microfone…').waitFor();
      await pagina.clock.runFor(9_800);
      assert.equal(await pagina.locator('main.stand').getAttribute('data-escuta'), 'abrindo', 'não mostrou ajuda antes dos 10 s');
      assert.equal(await pagina.getByText('Permita o microfone pra conversar com o LUCA.').count(), 0);
      await pagina.clock.runFor(200);
      await pagina.getByText('Permita o microfone pra conversar com o LUCA.').waitFor({ timeout: 3000 });
      assert.equal(await pagina.locator('main.stand').getAttribute('data-escuta'), 'ajuda_microfone');
      // Daqui em diante o relógio volta a correr: o prazo do worklet (2,5 s) precisa passar sozinho.
      await pagina.clock.resume();
      await pagina.evaluate(() => {
        const botao = [...document.querySelectorAll('.stand-barra button')].find((b) => b.textContent.includes('Vitrine'));
        botao.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      });
      await pagina.locator('main.stand[data-modo="vitrine"][data-escuta="ajuda_microfone"]').waitFor();
      await pagina.evaluate(() => { window.__permitirMicrofone(); });
      await pagina.locator('main.stand[data-modo="vitrine"][data-escuta="ouvindo"]').waitFor({ timeout: 8000 });
      assert.equal(await pagina.getByText('Permita o microfone pra conversar com o LUCA.').count(), 0);
    } finally {
      escutaNoServidor = false;
      await pagina.close();
    }
  });

  it('permissão rápida: a ajuda não aparece depois de 10 s', async () => {
    escutaNoServidor = true;
    const pagina = await browser.newPage();
    try {
      await pagina.addInitScript(() => {
        window.__viuAjuda = false;
        new MutationObserver(() => {
          if (document.querySelector('main.stand')?.dataset.escuta === 'ajuda_microfone') window.__viuAjuda = true;
        }).observe(document, { subtree: true, attributes: true, childList: true });
      });
      await pagina.goto(`${base}/stand`);
      await pagina.locator('main.stand[data-escuta="ouvindo"]').waitFor({ timeout: 15000 });
      await pagina.waitForTimeout(10500);
      assert.equal(await pagina.evaluate(() => window.__viuAjuda), false);
      assert.equal(await pagina.getByText('Permita o microfone pra conversar com o LUCA.').count(), 0);
    } finally {
      escutaNoServidor = false;
      await pagina.close();
    }
  });

  it('escuta sem --autoplay-policy: abre e volta a ouvir sem toque, depois de cada conversa', async () => {
    // Sem a flag do kiosk e sem nenhum gesto: AudioContext criado antes do microfone nasce
    // `suspended` e a escuta ficaria em `precisa_toque` (achado em produção, 19/10).
    // Só locator/waitFor aqui: `pagina.evaluate` do Playwright conta como gesto do usuário.
    modoSessao = 'ok';
    escutaNoServidor = true;
    const wav = join(pasta, 'escuta-sem-flag.wav');
    writeFileSync(wav, wavDeEscuta(5, 1));
    const semFlag = await navegador.chromium.launch({
      executablePath: navegador.caminho,
      // A política real do Chrome sem a flag; o Playwright liga a liberal por padrão.
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`, '--autoplay-policy=document-user-activation-required'],
      ignoreDefaultArgs: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
    });
    try {
      const pagina = await semFlag.newPage();
      await pagina.goto(`${base}/stand`);
      const main = pagina.locator('main.stand');
      await pagina.locator('main.stand[data-escuta="ouvindo"]').waitFor({ timeout: 15000 });
      // A voz do wav abre a conversa; o Scribe falso não transcreve e ela fecha sem fala.
      await pagina.locator('main.stand[data-escuta="conversa"]').waitFor({ timeout: 15000 });
      await pagina.locator('main.stand[data-sessao="silencio"]').waitFor({ timeout: 12000 });
      // De volta à escuta (ou à pausa curta de falsos), nunca pedindo toque.
      await pagina.locator('main.stand[data-escuta="ouvindo"], main.stand[data-escuta="pausada"]').waitFor({ timeout: 4000 });
      assert.notEqual(await main.getAttribute('data-escuta'), 'precisa_toque');
      assert.equal(await pagina.getByText('Toca na tela pra começar a conversa').count(), 0);
    } finally {
      escutaNoServidor = false;
      await semFlag.close();
    }
  });

  it('/totem → "Abrir Totem" carrega o documento do /stand e o microfone abre (20/10)', async () => {
    // /totem vem com microphone=(); por pushState o /stand herdava a política e o
    // getUserMedia caía em "Permissions policy violation" (escuta=erro).
    escutaNoServidor = true;
    const pagina = await browser.newPage();
    const avisos = [];
    pagina.on('console', (m) => avisos.push(m.text()));
    try {
      await pagina.goto(`${base}/totem`);
      await pagina.evaluate(() => { window.__mesmoDocumento = true; });
      await pagina.getByRole('button', { name: 'Abrir Totem' }).click();
      await pagina.waitForURL(`${base}/stand/`);
      await pagina.locator('main.stand[data-escuta="ouvindo"]').waitFor({ timeout: 15000 });
      assert.equal(await pagina.evaluate(() => window.__mesmoDocumento ?? false), false, 'o /stand é documento novo');
      assert.equal(await pagina.evaluate(() => document.featurePolicy?.allowsFeature('microphone') ?? true), true);
      assert.ok(!avisos.some((a) => /Permissions policy violation/.test(a)), avisos.join('\n'));
      // Volta: sair do stand também troca de documento (o painel não fica com microfone liberado).
      await pagina.evaluate(() => { window.__mesmoDocumento = true; });
      await pagina.keyboard.press('Shift+Q');
      await pagina.waitForURL(`${base}/`);
      await pagina.locator('#root *').first().waitFor();
      assert.equal(await pagina.evaluate(() => window.__mesmoDocumento ?? false), false, 'o painel é documento novo');
    } finally {
      escutaNoServidor = false;
      await pagina.close();
    }
  });
});
