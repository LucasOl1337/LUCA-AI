import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { CATALOGO, FORA_DO_MENU, GRUPOS_SO_TOQUE, conferirCatalogo, itemDoCatalogo } from '../shared/stand/catalogo.ts';
import { ACOES_SITE, IDS_PAGINAS, validarAcaoSite } from '../shared/stand/acoes-site.ts';
import { COMANDOS_VOZ } from '../shared/stand/comandos-voz.ts';
import { ehEventoPagina } from '../shared/stand/eventos.ts';
import { cabecalhosDeSeguranca } from '../server/cabecalhos-seguranca.js';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { planejarAcao } = await loadFrontendModule('../../src/components/stand/site/acaoDoStand.ts');
const { MenuTotem } = await loadFrontendModule('../../src/components/stand/MenuTotem.tsx');
const { PainelComandos } = await loadFrontendModule('../../src/components/stand/PainelComandos.tsx');

test('catálogo do menu confere com as ações reais: toda ação no menu (ou fora com motivo), todo item válido', () => {
  assert.deepEqual(conferirCatalogo(), []);
  const usadas = new Set(CATALOGO.flatMap((g) => g.itens).filter((i) => i.alvo.tipo === 'acao').map((i) => i.alvo.acao));
  for (const def of ACOES_SITE) assert.ok(usadas.has(def.nome) || FORA_DO_MENU[def.nome], def.nome);
});

test('não esconde opções: cada valor de cada argumento das ações tem item próprio no menu', () => {
  const itens = CATALOGO.flatMap((g) => g.itens).filter((i) => i.alvo.tipo === 'acao');
  for (const def of ACOES_SITE) {
    for (const [chave, arg] of Object.entries(def.args)) {
      for (const valor of arg.valores) {
        assert.ok(itens.some((i) => i.alvo.acao === def.nome && i.alvo.args[chave] === valor), `${def.nome} ${chave}=${valor}`);
      }
    }
  }
  // Mais de 10: os exemplos antigos não limitam o universo (grill r1, Q1).
  assert.ok(itens.length > 40, `itens de ação: ${itens.length}`);
});

test('grupos do menu são os mesmos ids dos comandos de voz (painel e prompt não divergem)', () => {
  assert.deepEqual(CATALOGO.map((g) => g.id), [...COMANDOS_VOZ.map((c) => c.id), ...GRUPOS_SO_TOQUE]);
  const vitrine = itemDoCatalogo('abrir_vitrine');
  assert.deepEqual(vitrine.alvo, { tipo: 'acao', acao: 'abrir_vitrine', args: {} });
  assert.equal(vitrine.requer, undefined, 'o toque abre a vitrine também sem voz');
});

test('gameplay e operador são destinos explícitos; admin continua fora (grill r1, Q4)', () => {
  assert.ok(IDS_PAGINAS.includes('gameplay') && IDS_PAGINAS.includes('operador'));
  assert.equal(itemDoCatalogo('simulacao').alvo.acao, 'abrir_simulacao');
  assert.deepEqual(itemDoCatalogo('gameplay').alvo, { tipo: 'acao', acao: 'abrir_pagina', args: { pagina: 'gameplay' } });
  assert.deepEqual(itemDoCatalogo('operador').alvo, { tipo: 'acao', acao: 'abrir_pagina', args: { pagina: 'operador' } });
  for (const pagina of ['admin', 'personas', 'configuracao']) assert.equal(validarAcaoSite('abrir_pagina', { pagina }).ok, false);
  // O iframe do /stand precisa poder emoldurar os dois; admin segue DENY.
  for (const caminho of ['/gameplay', '/operador']) assert.equal(cabecalhosDeSeguranca(caminho)['X-Frame-Options'], 'SAMEORIGIN', caminho);
  assert.equal(cabecalhosDeSeguranca('/admin')['X-Frame-Options'], 'DENY');
});

test('item do menu passa pelo mesmo planner da voz: abre a página e executa no Executor', () => {
  const item = itemDoCatalogo('sensor-ensaio-curva');
  const plano = planejarAcao(item.alvo.acao, item.alvo.args, { modo: 'coruja', pagina: null });
  assert.equal(plano.ok, true);
  assert.deepEqual(plano.passos.map((p) => p.tipo), ['modo', 'executor']);
  assert.equal(plano.passos[1].caminho, '/sensor');
  const vizinho = planejarAcao(item.alvo.acao, item.alvo.args, { modo: 'site', pagina: 'sensor' });
  assert.deepEqual(vizinho.passos.map((p) => p.tipo), ['executor'], 'já na página: só executa');
});

test('pergunta do menu é evento da página válido, com limite de 500 caracteres', () => {
  assert.equal(ehEventoPagina({ tipo: 'pergunta_texto', texto: 'O que é o LUCA?' }), true);
  assert.equal(ehEventoPagina({ tipo: 'pergunta_texto', texto: '   ' }), false);
  assert.equal(ehEventoPagina({ tipo: 'pergunta_texto', texto: 'x'.repeat(501) }), false);
});

test('painel ao lado da coruja: grupos são botões (não texto morto), com ou sem voz', () => {
  const html = renderToStaticMarkup(createElement(PainelComandos, { voz: false, aoEscolher() {} }));
  assert.equal((html.match(/<button/g) ?? []).length, 5, 'exatamente as cinco experiências');
  assert.match(html, /data-comando="sonolencia"/);
  for (const id of GRUPOS_SO_TOQUE) assert.doesNotMatch(html, new RegExp(`data-comando="${id}"`));
  assert.match(html, /Toque para ver/);
  assert.match(renderToStaticMarkup(createElement(PainelComandos, { voz: true, aoEscolher() {} })), /Toque ou peça/);
});

test('menu: nível 1 lista grupos; nível 2 mostra todas as opções, motivo de indisponível e o retorno', () => {
  const base = { aberto: true, status: null, indisponivel: () => null, motivoSemTexto: null, aoAbrirGrupo() {}, aoFechar() {}, aoExecutar() {}, aoPerguntar() {} };
  const n1 = renderToStaticMarkup(createElement(MenuTotem, { ...base, grupo: null }));
  assert.equal((n1.match(/data-grupo="/g) ?? []).length, CATALOGO.length);
  assert.match(n1, /data-grupo="sonolencia"/);
  const sompo = CATALOGO.find((g) => g.id === 'sompo');
  const n2 = renderToStaticMarkup(createElement(MenuTotem, {
    ...base,
    grupo: 'sompo',
    status: { item: 'sompo-aba-casos', fase: 'falha', mensagem: 'O painel não respondeu.' },
    indisponivel: (i) => (i.id === 'sompo-inicio' ? 'motivo de teste' : null),
  }));
  assert.equal((n2.match(/data-item="/g) ?? []).length, sompo.itens.length);
  assert.match(n2, /Todas as opções/);
  assert.match(n2, /Não deu: O painel não respondeu\./);
  assert.match(n2, /motivo de teste/);
  assert.equal(renderToStaticMarkup(createElement(MenuTotem, { ...base, aberto: false, grupo: null })), '');
  const semVoz = renderToStaticMarkup(createElement(MenuTotem, { ...base, grupo: 'perguntar', motivoSemTexto: 'assistente desligado' }));
  assert.match(semVoz, /placeholder="assistente desligado"/);
  assert.match(semVoz, /disabled=""/);
});
