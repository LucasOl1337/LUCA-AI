// Ensaio da feira automatizado (luca-pedidos item 6 → teste versionado): totem,
// tablet do operador e stand em Chromium de verdade contra o runtime isolado.
// O palco 3D do gameplay vira um palco falso sem WebGL (tests/support/palco-falso.ts):
// o motor, o /ws e o tablet são os de verdade. A rede do tablet passa por um
// proxy TCP que cai e volta sob comando (tests/support/feira-rede.js).
//
// Cenários e o commit que cada um protege:
//   a) rede do tablet cai 10 s e volta: /operador ao vivo em ≤5 s sem F5 (C1, e87604a)
//   b) sessão revogada de fora: /operador vai ao login e /stand ao "sem login" (C6, e6f13f8)
//   c) F5 no /gameplay?quiosque=1 volta à cabine sem clique (211ba5c)
//   d) depois do F5 do totem o /operador volta ao vivo sozinho (211ba5c)
//   e) aba do totem oculta: tablet mostra "Jogo pausado no totem" e volta (8ab7d22 + e2e1ce9)
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runtime, temporary } from './support/cli.js';
import { borda, buildSemWebgl, rede } from './support/feira-rede.js';

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
const SENHA = 'feira-e2e-senha-local-123';
const EMAIL = 'totem@feira-e2e.test';

/** Sessão nova da mesma conta (cada aparelho da feira tem a sua). */
async function entrar(url, rota, corpo) {
  const resposta = await fetch(`${url}/api/auth/${rota}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
  assert.ok(resposta.ok, `${rota}: HTTP ${resposta.status}`);
  return resposta.headers.get('set-cookie').split(';')[0];
}

/**
 * Chromium headless não esconde aba (bringToFront não muda `visibilityState`).
 * O totem ganha um interruptor: `hidden`/`visibilityState` passam a ler dele e
 * a troca dispara o `visibilitychange` que o GameplayKiosk e o palco escutam.
 */
const ABA_CONTROLAVEL = `(() => {
  let oculta = false;
  Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => oculta });
  Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => (oculta ? 'hidden' : 'visible') });
  window.__abaOculta = (valor) => { oculta = valor; document.dispatchEvent(new Event('visibilitychange')); };
})();`;

describe('ensaio da feira de ponta a ponta', { skip: navegador ? false : 'sem Chromium para o Playwright' }, () => {
  let browser;
  let direto;
  let redeTablet;
  let totem;
  let tablet;
  const ctxs = {};
  const inicio = Date.now();
  // runtime()/temporary()/borda()/rede() registram a limpeza em `t.after`: aqui ela roda no after da suíte.
  const limpezas = [];
  const ctx = { after: (fn) => limpezas.push(fn) };

  async function contexto(nome, base, cookie, { abaControlavel = false } = {}) {
    const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const [n, v] = cookie.split('=');
    await c.addCookies([{ name: n, value: v, url: base }]);
    if (abaControlavel) await c.addInitScript(ABA_CONTROLAVEL);
    ctxs[nome] = c;
    return c.newPage();
  }

  /** Lê/age no totem sem contar como gesto: o `evaluate` do Playwright ativa o usuário e mascararia o "sem clique". */
  let cdpTotem;
  async function noTotem(expressao) {
    cdpTotem ??= await ctxs.totem.newCDPSession(totem);
    const { result, exceptionDetails } = await cdpTotem.send('Runtime.evaluate', { expression: expressao, returnByValue: true, userGesture: false });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  }

  /**
   * Garante a cabine no totem. Sem o quiosque (211ba5c) a página fica na landing: toca em
   * Iniciar para os outros cenários seguirem e só o c) acusar a regressão.
   */
  async function totemJogando() {
    const cabine = totem.locator('[data-gameplay] [data-palco="falso"]');
    const iniciar = totem.getByRole('button', { name: 'Iniciar Gameplay' });
    await cabine.or(iniciar).first().waitFor({ timeout: 15_000 });
    if (await iniciar.isVisible()) await iniciar.click();
    await cabine.waitFor({ timeout: 15_000 });
  }

  const sinal = (p) => p.evaluate(() => document.querySelector('.operador')?.dataset.sinal ?? null);
  /** Espera o selo do tablet chegar a `nivel`; devolve quanto levou (ms). */
  async function tabletEm(nivel, prazoMs) {
    const t0 = Date.now();
    try {
      await tablet.waitForFunction((n) => document.querySelector('.operador')?.dataset.sinal === n, nivel, { timeout: prazoMs, polling: 100 });
    } catch {
      const selo = await tablet.evaluate(() => document.querySelector('.operador-sinal')?.textContent ?? document.body.innerText.slice(0, 120)).catch(() => '?');
      assert.fail(`tablet não chegou a "${nivel}" em ${prazoMs} ms (selo: ${selo})`);
    }
    return Date.now() - t0;
  }
  async function abrirTablet() {
    await tablet.goto(`${redeTablet.url}/operador`);
    return tabletEm('ao-vivo', 10_000);
  }

  before(async () => {
    const pasta = await temporary(ctx);
    const t0 = Date.now();
    const dist = join(pasta, 'dist');
    await buildSemWebgl(dist);
    const tBuild = Date.now() - t0;
    const runtimeUrl = await runtime(ctx, pasta);
    direto = await borda(ctx, dist, runtimeUrl);
    redeTablet = await rede(ctx, direto);
    await entrar(direto, 'register', { name: 'Totem da feira', email: EMAIL, password: SENHA });
    browser = await navegador.chromium.launch({ executablePath: navegador.caminho, args: ['--autoplay-policy=no-user-gesture-required'] });
    totem = await contexto('totem', direto, await entrar(direto, 'login', { email: EMAIL, password: SENHA }), { abaControlavel: true });
    tablet = await contexto('tablet', redeTablet.url, await entrar(direto, 'login', { email: EMAIL, password: SENHA }));
    await totem.goto(`${direto}/gameplay?quiosque=1`);
    await totemJogando();
    console.log(`# preparo: build ${tBuild} ms, total ${Date.now() - inicio} ms`);
  });

  after(async () => {
    await browser?.close();
    for (const fn of limpezas.reverse()) await fn();
    console.log(`# ensaio inteiro: ${Date.now() - inicio} ms`);
  });

  it('a) rede do tablet cai 10 s e o /operador volta ao vivo sozinho em até 5 s (C1)', async () => {
    await abrirTablet();
    redeTablet.cair();
    try {
      await tabletEm('sem-sinal', 5_000);
      // Queda do ensaio: longa o bastante para a religação de 3 s achar a rede fora.
      await new Promise((r) => setTimeout(r, 10_000));
      assert.equal(await sinal(tablet), 'sem-sinal');
    } finally {
      redeTablet.voltar();
    }
    const volta = await tabletEm('ao-vivo', 5_000);
    console.log(`# a) ao vivo ${volta} ms depois da rede voltar`);
  });

  it('e) aba do totem oculta: o tablet mostra "Jogo pausado no totem" e volta ao vivo (C3)', async () => {
    await abrirTablet();
    await noTotem('window.__abaOculta(true)');
    try {
      const pausa = await tabletEm('pausado', 3_000);
      assert.equal((await tablet.textContent('.operador-sinal')).trim(), 'Jogo pausado no totem');
      // Passado o SEM_SINAL_MS (2 s) segue "pausado", não "sem sinal".
      await new Promise((r) => setTimeout(r, 2_500));
      assert.equal(await sinal(tablet), 'pausado');
      await noTotem('window.__abaOculta(false)');
      const volta = await tabletEm('ao-vivo', 3_000);
      console.log(`# e) pausado em ${pausa} ms, ao vivo de novo em ${volta} ms`);
    } finally {
      // Falhou no meio: o totem não pode seguir "oculto" e derrubar os cenários seguintes.
      await noTotem('window.__abaOculta(false)');
    }
  });

  it('c) F5 no /gameplay?quiosque=1 volta à cabine sem clique', async () => {
    const t0 = Date.now();
    await totem.reload({ waitUntil: 'commit' });
    try {
      // Só CDP sem gesto daqui em diante: o waitForSelector do Playwright também ativa o usuário.
      let cabine = null;
      while (cabine === null && Date.now() - t0 < 10_000) {
        const pronto = await noTotem('!!document.querySelector(\'[data-quiosque="true"] [data-gameplay] [data-palco="falso"]\')').catch(() => false);
        if (pronto) cabine = Date.now() - t0;
        else await new Promise((r) => setTimeout(r, 100));
      }
      assert.ok(cabine !== null, 'a cabine do quiosque não voltou em 10 s depois do F5');
      assert.equal(await noTotem('navigator.userActivation.hasBeenActive'), false, 'ninguém tocou no totem');
      assert.equal(await noTotem('document.body.innerText.includes("Iniciar Gameplay")'), false, 'sem landing');
      console.log(`# c) cabine ${cabine} ms depois do F5, sem gesto`);
    } finally {
      await totemJogando();
    }
  });

  it('d) F5 no totem: o /operador recebe o jogo novo sem ninguém mexer no tablet', async () => {
    await abrirTablet();
    // Antes do F5 o totem sai dirigindo: o retrato do jogo novo ("Parado") prova que o tablet ouviu o totem recarregado.
    await totem.keyboard.down('ArrowUp');
    await tablet.waitForFunction(() => document.body.innerText.includes('Dirigindo'), null, { timeout: 5_000, polling: 100 });
    await totem.keyboard.up('ArrowUp');
    const t0 = Date.now();
    await totem.reload({ waitUntil: 'commit' });
    try {
      await tablet.waitForFunction(() => document.body.innerText.includes('Parado · esperando R2'), null, { timeout: 8_000, polling: 100 })
        .catch(() => assert.fail('o tablet não recebeu o jogo novo do totem em 8 s depois do F5'));
      const volta = await tabletEm('ao-vivo', 1_000);
      console.log(`# d) tablet com o jogo novo ${Date.now() - t0} ms depois do F5 (ao vivo em +${volta} ms)`);
    } finally {
      await totemJogando();
    }
  });

  it('b) sessão revogada de fora: /operador vai ao login e /stand ao "sem login" (C6)', async () => {
    await abrirTablet();
    const cookieStand = await entrar(direto, 'login', { email: EMAIL, password: SENHA });
    const stand = await contexto('stand', direto, cookieStand);
    // Relógio do Playwright no stand: anda sozinho e deixa pular só a janela do poll do /api/state (5 s).
    await stand.clock.install();
    await stand.goto(`${direto}/stand`);
    await stand.waitForSelector('main.stand:not([data-sem-login])', { timeout: 10_000 });
    const cookieTablet = (await ctxs.tablet.cookies()).find((c) => c.name === 'luca_session');
    for (const cookie of [`${cookieTablet.name}=${cookieTablet.value}`, cookieStand]) {
      const saida = await fetch(`${direto}/api/auth/logout`, { method: 'POST', headers: { cookie } });
      assert.equal(saida.status, 200);
    }
    const t0 = Date.now();
    // Pular 5 s alcança o poll do /api/state (LOCAL_POLL_MS) e não o de /api/stand/status (60 s):
    // sem o e6f13f8 o stand seguiria "ouvindo" com a sessão morta.
    await stand.clock.fastForward(5_000);
    // Os dois aparelhos são conferidos e relatados, mesmo quando um deles falha.
    const [operador, standSemLogin] = await Promise.allSettled([
      tablet.waitForSelector('input[type=password]', { timeout: 6_000 }).then(() => console.log(`# b) /operador no login em ${Date.now() - t0} ms`)),
      stand.waitForSelector('main.stand[data-sem-login][data-motivo="sem_login"]', { timeout: 3_000 }).then(() => console.log(`# b) /stand sem login em ${Date.now() - t0} ms (relógio +5 s)`)),
    ]);
    const falhas = [
      operador.status === 'rejected' && '/operador não foi ao login em 6 s',
      standSemLogin.status === 'rejected' && '/stand não foi ao "sem login" em 3 s com o relógio +5 s',
    ].filter(Boolean);
    assert.deepEqual(falhas, []);
    assert.equal(await tablet.locator('.operador').count(), 0, 'o painel com o usuário antigo saiu da tela');
  });
});
