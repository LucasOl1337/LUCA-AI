// Cenas da vitrine financeira (ROTEIRO.md da frente Vitrine, 24/10). Cada cena grava
// um .mkv nativo; marcas viram pontos de corte na montagem.
const CENARIO = 'max-front-obstacle';
const DESFECHO = 'safe-stop';

export async function rodar({page, base, so, gravar, parar, marcar, sleep, log, info, saida}) {
  let n = 0;
  const print = async (nome) => { const arq = `${saida}/prints/${String(++n).padStart(2, '0')}-${nome}.png`; await page.screenshot({path: arq}); info.prints.push(arq); };
  const rolarSuave = async (alvo, ms = 1400) => page.evaluate(async ([sel, ms]) => {
    const el = document.querySelector(sel); if (!el) return false;
    const y0 = scrollY; const box = el.getBoundingClientRect();
    const destino = Math.max(0, y0 + box.top - Math.max(40, (innerHeight - box.height) / 2));
    const t0 = performance.now();
    await new Promise((ok) => { const passo = (t) => { const k = Math.min(1, (t - t0) / ms); const e = k * k * (3 - 2 * k); scrollTo(0, y0 + (destino - y0) * e); k < 1 ? requestAnimationFrame(passo) : ok(); }; requestAnimationFrame(passo); });
    return true;
  }, [alvo, ms]);
  const rolarContainer = async (sel, ms = 1400) => page.evaluate(async ([sel, ms]) => {
    const el = document.querySelector(sel); if (!el) return false;
    let pai = el.parentElement; while (pai && !(pai.scrollHeight > pai.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(pai).overflowY))) pai = pai.parentElement;
    const alvo = pai || document.scrollingElement; const y0 = alvo.scrollTop;
    const top = el.getBoundingClientRect().top - (pai ? pai.getBoundingClientRect().top : 0);
    const destino = Math.max(0, y0 + top - Math.max(40, (alvo.clientHeight - el.getBoundingClientRect().height) / 2));
    const t0 = performance.now();
    await new Promise((ok) => { const passo = (t) => { const k = Math.min(1, (t - t0) / ms); const e = k * k * (3 - 2 * k); alvo.scrollTop = y0 + (destino - y0) * e; k < 1 ? requestAnimationFrame(passo) : ok(); }; requestAnimationFrame(passo); });
    return true;
  }, [sel, ms]);

  if (so.includes('b1')) {
    // b1 · SOMPO: boas-vindas e o cartão "Um trator tombado vale R$ 400 mil".
    await page.goto(`${base}/sompo`, {waitUntil: 'load'});
    await page.locator('#sompo-welcome-title').waitFor({timeout: 30000});
    await sleep(2500);
    gravar('b1');
    await sleep(3500); marcar('welcome'); await print('b1-welcome');
    await rolarContainer('[data-story="risco-agro-maquinas"]', 2200);
    marcar('cartao'); await sleep(1500); await print('b1-cartao');
    await sleep(8000);
    await parar();
  }

  if (so.includes('b2')) {
    // b2 + b4a · Trator MAX com obstáculo frontal: alerta a 150 cm e parada; depois grava o episódio.
    await page.goto(`${base}/sompo?aba=telemetria&cenario=${CENARIO}&desfecho=${DESFECHO}`, {waitUntil: 'load'});
    await page.locator('[data-sompo-model="gltf"], [data-sompo-model="modular"]').first().waitFor({timeout: 120000});
    await sleep(2000);
    await rolarContainer('[data-sompo-model]', 600);
    await sleep(1500);
    gravar('b2');
    marcar('inicio');
    await page.getByText('Alerta de colisão').first().waitFor({timeout: 60000}).then(() => marcar('alerta')).catch(() => info.erros.push('b2: sem alerta de colisão'));
    await print('b2-alerta');
    await sleep(9000);
    marcar('gravar');
    await page.locator('[data-sompo-episode-run]').scrollIntoViewIfNeeded().catch(() => {});
    await page.locator('[data-sompo-episode-run]').click();
    await page.locator('[data-sompo-episode-recording]').waitFor({timeout: 30000}).then(() => marcar('gravando')).catch(() => {});
    await rolarContainer('[data-sompo-model]', 700);
    await page.locator('[data-sompo-episode-done], [data-sompo-episode-error]').first().waitFor({timeout: 120000});
    if (await page.locator('[data-sompo-episode-error]').count()) info.erros.push('b2: episódio falhou');
    await rolarContainer('[data-sompo-episode-done]', 900);
    marcar('registrado'); await print('b2-registrado');
    await sleep(5000);
    await parar();
  }

  if (so.includes('b3')) {
    // b3 · Monitor de sonolência com câmera sintética (rosto de teste em y4m).
    await page.goto(`${base}/sonolencia`, {waitUntil: 'load'});
    await page.getByRole('button', {name: 'Ativar webcam'}).waitFor({timeout: 30000});
    await sleep(2000);
    gravar('b3');
    await sleep(1500); marcar('ativar');
    await page.getByRole('button', {name: 'Ativar webcam'}).click();
    await page.locator('.drowsiness-page[data-ready="true"]').waitFor({timeout: 45000}).then(() => marcar('pronto')).catch(() => info.erros.push('b3: monitor não ficou pronto'));
    await page.locator('.drowsiness-page[data-eyes="open"]').waitFor({timeout: 20000}).then(() => marcar('aberto')).catch(() => {});
    await page.locator('.drowsiness-page[data-eyes="closed"]').waitFor({timeout: 20000}).then(() => marcar('fechado')).catch(() => info.erros.push('b3: sem olhos fechados'));
    await page.locator('.drowsiness-page[data-eyes="alarm"]').waitFor({timeout: 20000}).then(() => marcar('alarme')).catch(() => info.erros.push('b3: sem alarme'));
    await print('b3-alarme');
    await sleep(9000);
    await parar();
    await page.getByRole('button', {name: 'Parar monitor'}).click().catch(() => {});
  }

  if (so.some((c) => ['b4', 'b5', 'b6'].includes(c))) {
    // b4b · b5 · b6 · Safra: último episódio com as imagens, frota demonstrativa e rodapé de pendências.
    await page.goto(`${base}/sompo?aba=safra`, {waitUntil: 'load'});
    await page.locator('#sompo-fleet-title').waitFor({timeout: 30000});
    const ultimo = page.locator('.sompo-fleet-now .sompo-fleet-episode').first();
    const temEpisodio = await ultimo.waitFor({timeout: 20000}).then(() => true).catch(() => false);
    await sleep(1500);
    gravar('safra');
    if (temEpisodio) {
      await rolarContainer('.sompo-fleet-now', 1200);
      await sleep(800);
      await ultimo.locator('summary').click(); marcar('episodio');
      await ultimo.locator('.sompo-fleet-frames img').first().waitFor({timeout: 30000}).catch(() => info.erros.push('safra: sem frames'));
      await sleep(800);
      await rolarContainer('.sompo-fleet-now .sompo-fleet-frames', 1000);
      marcar('frames'); await print('safra-frames');
      await sleep(7000);
    } else info.erros.push('safra: sem episódio gravado (rode b2 junto)');
    await rolarContainer('.sompo-fleet-demo', 1600); marcar('frota'); await print('safra-frota');
    await sleep(3000);
    await rolarContainer('.sompo-fleet-charts', 1200); marcar('graficos'); await print('safra-graficos');
    await sleep(9000);
    await rolarContainer('.sompo-fleet-decision', 1600); marcar('rodape'); await print('safra-rodape');
    await sleep(7000);
    await parar();
  }

  if (so.includes('b6')) {
    // b6b · Início do app: "Do sensor na máquina à decisão da equipe."
    await page.goto(`${base}/`, {waitUntil: 'load'});
    await page.locator('#home-abertura-titulo').waitFor({timeout: 30000});
    await sleep(2000);
    gravar('inicio');
    marcar('abertura'); await print('inicio');
    await sleep(8000);
    await parar();
  }
  log('cenas ok', so.join(','));
}
