import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { OperadorVista } = await loadFrontendModule('../../src/pages/OperadorPage.tsx');

const estado = ({ x = 0, z = 0, cm = 400 } = {}) => ({
  versao: 1, fase: 'dirigindo', tempoMs: 65_000,
  maquina: { x, z, rumoGraus: 0, velocidadeKph: 8, re: false },
  comandos: { esterco: 0, acelerador: 0.5, freio: 0 },
  sensor: { distanciaCm: cm, eco: cm < 400, alerta: cm <= 150 },
  atitude: { rolagemGraus: 0, arfagemGraus: 0 }, contato: false, tetoKph: 12,
});
const html = (retrato, agora = 10_000, extra = {}) => renderToStaticMarkup(createElement(OperadorVista, { retrato, agora, som: false, ...extra }));

test('sem retrato: aguardando o totem, sem mapa', () => {
  const h = html(null);
  assert.match(h, /data-sinal="aguardando"/);
  assert.match(h, /Aguardando o totem/);
  assert.match(h, /SIMULADO/);
  assert.doesNotMatch(h, /mapa-operador/);
});

test('ao vivo: mapa, sensor, velocidade, fase e som mudo por padrão', () => {
  const h = html({ estado: estado({ cm: 240 }), recebidoEm: 9_500 });
  assert.match(h, /data-sinal="ao-vivo"/);
  assert.match(h, />Totem ao vivo</);
  assert.match(h, />App conectado</);
  assert.match(h, /class="mapa-operador"/);
  assert.match(h, /2,4 m/);
  assert.match(h, /8 km\/h/);
  assert.match(h, /1:05/);
  assert.match(h, /aria-pressed="false"[^>]*>Som mudo/);
});

test('dentro da zona alagada: faixa de alerta e card de zona acesos', () => {
  const h = html({ estado: estado({ x: 25, z: 15 }), recebidoEm: 10_000 });
  assert.match(h, /Dentro da área alagada · saia/);
  assert.match(h, /data-zona-nivel="critico" data-alerta="true"><span>Zona de risco<\/span><strong>Área alagada<\/strong><small>zona de sinistro/);
  assert.match(h, /data-zona="alagado" data-ativa="dentro"/);
});

test('retrato velho: sem sinal há N s, mantendo o último mapa', () => {
  const h = html({ estado: estado(), recebidoEm: 1_000 }, 10_000);
  assert.match(h, /data-sinal="sem-sinal"/);
  assert.match(h, /Totem sem dados há 9,0 s/);
  assert.match(h, /data-situacao="velho"/);
});

/**
 * Todo CSS que a página do operador carrega: segue os imports locais (`@/`, `./`)
 * a partir do OperadorPage.tsx, inclusive os de componentes importados, porque o
 * Vite junta o CSS de toda a árvore no chunk da página. `import type` não conta.
 */
function cssDoOperador() {
  const src = fileURLToPath(new URL('../src/', import.meta.url));
  const vistos = new Set();
  const css = new Map();
  const resolver = (de, alvo) => {
    const base = alvo.startsWith('@/') ? path.join(src, alvo.slice(2)) : path.resolve(path.dirname(de), alvo);
    for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) if (existsSync(c) && statSync(c).isFile()) return c;
    return null;
  };
  const visitar = (arquivo) => {
    if (vistos.has(arquivo)) return;
    vistos.add(arquivo);
    const fonte = readFileSync(arquivo, 'utf8');
    for (const [, tipo, alvo] of fonte.matchAll(/^import\s+(type\s+)?(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)) {
      if (tipo || !(alvo.startsWith('@/') || alvo.startsWith('.'))) continue;
      const destino = resolver(arquivo, alvo);
      assert.ok(destino, `import não resolvido: ${alvo} em ${arquivo}`);
      if (destino.endsWith('.css')) css.set(path.relative(src, destino), readFileSync(destino, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''));
      else if (/\.tsx?$/.test(destino)) visitar(destino);
    }
  };
  visitar(path.join(src, 'pages/OperadorPage.tsx'));
  return css;
}

// Com o /gameplay no mesmo navegador, animação infinita aqui derrubou o jogo de 42 para 23 fps.
test('CSS do operador (todos os imports): nada infinito, keyframes só com opacity/transform, sem filter', () => {
  const todos = cssDoOperador();
  assert.ok(todos.has('pages/operadorPage.css'), `achou: ${[...todos.keys()]}`);
  assert.ok(todos.size >= 2, `o mapa traz o próprio CSS; achou: ${[...todos.keys()]}`);
  for (const [nome, css] of todos) {
    assert.doesNotMatch(css, /infinite/, nome);
    assert.doesNotMatch(css, /filter\s*:/, nome);
    for (const [, corpo] of css.matchAll(/@keyframes[^{]+\{((?:[^{}]*\{[^}]*\})*)\s*\}/g)) {
      for (const [, prop] of corpo.matchAll(/([a-z-]+)\s*:/g)) assert.ok(['opacity', 'transform'].includes(prop), `${nome}: keyframe anima ${prop}`);
    }
  }
  assert.match(todos.get('pages/operadorPage.css'), /\.operador\[data-oculto\] \* \{ animation-play-state: paused/);
});

test('aba oculta: marca data-oculto para pausar as animações', () => {
  const h = renderToStaticMarkup(createElement(OperadorVista, { retrato: null, agora: 0, som: false, oculto: true }));
  assert.match(h, /data-oculto="true"/);
});

test('totem com a aba oculta: selo "Jogo pausado no totem", mapa mantido', () => {
  const h = html({ estado: estado(), recebidoEm: 1_000, oculto: true }, 10_000);
  assert.match(h, /data-sinal="pausado"/);
  assert.match(h, /Jogo pausado no totem/);
  assert.match(h, /data-situacao="pausado"/);
});

// Webcam de sonolência no totem (/gameplay?webcam=1): card do motorista e faixa no tablet.
test('sem webcam no totem: card diz sem leitura; com alarme: card aceso e faixa de sonolência', () => {
  const sem = html({ estado: estado(), recebidoEm: 9_500 });
  // Sem webcam o card diz "Sem leitura": webcam desligada não é motorista ok.
  assert.doesNotMatch(sem, /data-motorista/);
  assert.match(sem, /<span>Motorista · webcam<\/span><strong>Sem leitura<\/strong><small>webcam desligada no totem/);
  const aberto = html({ estado: estado(), recebidoEm: 9_500, sono: { status: 'open', closedMs: 0 } });
  assert.match(aberto, /data-motorista="open"[^>]*><span>Motorista · webcam<\/span><strong>Olhos abertos<\/strong>/);
  assert.match(aberto, /class="operador-alerta" role="alert" hidden=""/);
  const dormindo = html({ estado: estado(), recebidoEm: 9_500, sono: { status: 'alarm', closedMs: 1400 } });
  assert.match(dormindo, /data-motorista="alarm" data-alerta="true"/);
  assert.match(dormindo, /<strong>Sonolência<\/strong><small>Olhos fechados há 1,4 s<\/small>/);
  assert.match(dormindo, /class="operador-alerta" role="alert">Atenção: sinais de sono</);
});

// Soak luca-soak item 5 (21/10): o totem sai do /gameplay (rota, pagehide, fechar a aba) com o
// motorista em alarme; o último retrato fica no servidor ~60 s e o tablet seguia em "sinais de sono".
test('totem saiu com o alarme de sono: sem sinal (ou pausado) o tablet apaga card e faixa de sono', () => {
  const ultimo = { estado: estado(), recebidoEm: 5_000, sono: { status: 'alarm', closedMs: 1400 } };
  const semSinal = html(ultimo, 10_000);
  assert.match(semSinal, /data-sinal="sem-sinal"/);
  assert.doesNotMatch(semSinal, /data-motorista/);
  assert.doesNotMatch(semSinal, /sinais de sono/);
  assert.match(semSinal, /class="operador-alerta" role="alert" hidden=""/);
  const pausado = html({ ...ultimo, oculto: true }, 10_000);
  assert.match(pausado, /data-sinal="pausado"/);
  assert.doesNotMatch(pausado, /data-motorista|sinais de sono/);
  // O alerta do próprio trator (sensor) segue valendo no último retrato, como antes.
  const perto = html({ ...ultimo, estado: estado({ cm: 90 }) }, 10_000);
  assert.doesNotMatch(perto, /sinais de sono/);
});

// Pedido do Linz (24/10): o selo dizia ONLINE e "Sem sinal há 852 s" ao mesmo tempo, sem dizer de quê.
test('app conectado e totem sem dados são dois selos; a faixa avisa que é a última leitura', () => {
  const h = html({ estado: estado({ x: 25, z: 15 }), recebidoEm: 0 }, 852_000);
  assert.match(h, /data-conexao="online"/);
  assert.match(h, /operador-conexao" data-estado="online"[^>]*>App conectado</);
  assert.match(h, /operador-sinal" role="status"[^>]*>Totem sem dados há 14 min 12 s</);
  assert.match(h, /Mostrando a última leitura, não o estado agora/);
  assert.match(h, /o totem parou de mandar retratos/);
  assert.match(h, /Área sem cor não quer dizer área segura/);
  // Valor que só vale ao vivo vira "—": nada de "Fora das zonas" ou alerta aceso com dado velho.
  assert.match(h, /data-zona-nivel="sem-dado" data-alerta="false"><span>Zona de risco<\/span><strong>—<\/strong><small>sem dado atual/);
  assert.match(h, /class="operador-alerta" role="alert" hidden=""/);
  assert.match(h, /data-geofence="sem-dado"/);
  assert.match(h, /<strong>há 14 min 12 s<\/strong>/);
});

test('tablet sem /ws: o selo do app fica vermelho e a faixa culpa a rede do tablet, não o totem', () => {
  const h = html({ estado: estado(), recebidoEm: 1_000 }, 10_000, { conexao: 'offline' });
  assert.match(h, /operador-conexao" data-estado="offline"[^>]*>App sem conexão</);
  assert.match(h, /Este tablet perdeu a conexão com o servidor; o totem pode continuar jogando/);
  const vazio = html(null, 0, { conexao: 'offline' });
  assert.match(vazio, /Este tablet está sem conexão com o servidor/);
});

test('corrida no menu ou no resultado: pausado com o motivo, não sem sinal', () => {
  const menu = html({ estado: estado(), recebidoEm: 9_800, pausa: 'menu' });
  assert.match(menu, /data-sinal="pausado"/);
  assert.match(menu, />Corrida pausada no menu</);
  const fim = html({ estado: { ...estado(), fase: 'fim' }, recebidoEm: 9_800, pausa: 'resultado', cenario: 'circuito' });
  assert.match(fim, />Resultado na tela do totem</);
  assert.match(fim, /Corrida encerrada/);
  assert.match(fim, /Corrida do circuito/);
});

test('trator em escala e no rumo: corpo 4,5 × 2,7 m centrado na posição, girado pelo rumo', () => {
  const h = html({ estado: { ...estado({ x: 10, z: -3 }), maquina: { x: 10, z: -3, rumoGraus: 30, velocidadeKph: 8, re: false } }, recebidoEm: 9_500 });
  assert.match(h, /class="mapa-operador-trator" data-x="10.00" data-z="-3.00" data-heading="30.00" data-comprimento-m="4.5" data-largura-m="2.7" transform="translate\(-3.00 -10.00\) rotate\(-30.00\)"/);
  assert.match(h, /class="mapa-operador-corpo" x="-1.35" y="-2.25" width="2.7" height="4.5"/);
  // Emissor do HC-SR04 a 2,2461 m da origem, como na física.
  assert.match(h, /class="mapa-operador-emissor" cy="-2.2461"/);
  // Antes: seta com scale(1.8) de ~14 m no mesmo mapa.
  assert.doesNotMatch(h, /scale\(/);
});

test('geofencing: rumo à área alagada acende possível sinistro; encosta de 22° é zona de sinistro', () => {
  const rumo = html({ estado: { ...estado({ x: 6, z: 15 }), maquina: { x: 6, z: 15, rumoGraus: 0, velocidadeKph: 10, re: false } }, recebidoEm: 9_500 });
  assert.match(rumo, /data-geofence="rumo"/);
  assert.match(rumo, /data-zona-nivel="atencao" data-alerta="false"><span>Zona de risco<\/span><strong>Área alagada<\/strong><small>possível sinistro/);
  assert.match(rumo, /Rumo à área alagada · desvie/);
  const encosta = html({ estado: { ...estado({ x: 30, z: -15.75 }), atitude: { rolagemGraus: 22, arfagemGraus: 0 } }, recebidoEm: 9_500 });
  assert.match(encosta, /data-zona-nivel="critico" data-alerta="true"><span>Zona de risco<\/span><strong>Encosta<\/strong><small>zona de sinistro/);
  assert.match(encosta, /Inclinação de 22° · freie/);
  // Fora das zonas mostra a distância até a faixa vermelha mais perto (regra do jogo, não número inventado).
  const livre = html({ estado: estado({ x: 0, z: 0 }), recebidoEm: 9_500 });
  assert.match(livre, /<strong>Fora das zonas<\/strong><small>[^<]+ a \d+ m</);
});

test('fardos e estacas só no mapa do circuito; nos desafios o mapa avisa que não os mostra', () => {
  const circuito = html({ estado: estado(), recebidoEm: 9_500, cenario: 'circuito' });
  assert.match(circuito, /data-obstaculo="fardo"/);
  assert.match(circuito, /data-obstaculo="estaca"/);
  assert.match(circuito, /mapa-operador-rota/);
  const desafios = html({ estado: estado(), recebidoEm: 9_500, cenario: 'desafios' });
  assert.doesNotMatch(desafios, /data-obstaculo="fardo"|mapa-operador-rota/);
  assert.match(desafios, /data-obstaculo="cenario"/);
  assert.match(desafios, /Os fardos de cada desafio não aparecem no mapa/);
});

test('botão de tela cheia troca o rótulo; com a tela cheia aparece o ☰ do menu', () => {
  const normal = html(null, 0);
  assert.match(normal, /aria-pressed="false"[^>]*>.*Tela cheia<\/button>/);
  assert.doesNotMatch(normal, /Abrir menu/);
  const cheia = html(null, 0, { telaCheia: true, aoAbrirMenu: () => {} });
  assert.match(cheia, /data-tela-cheia="true"/);
  assert.match(cheia, /Sair da tela cheia/);
  assert.match(cheia, /aria-label="Abrir menu"/);
});
