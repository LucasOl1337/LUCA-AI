import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

const {
  DESAFIO_FARDO, DESAFIOS, RASTRO_VAZIO, passoDesafio, eventoDesafio, textoResultado,
} = await loadFrontendModule('../../src/components/gameplay/desafios.ts');

const estado = ({ t = 0, fase = 'dirigindo', cm = 400, kph = 6, freio = 0, contato = false, re = false } = {}) => ({
  versao: 1, fase, tempoMs: t,
  maquina: { x: 0, z: 0, rumoGraus: 0, velocidadeKph: kph, re },
  comandos: { esterco: 0, acelerador: freio ? 0 : 1, freio },
  sensor: { distanciaCm: cm, eco: cm < 400, alerta: cm < 400 && cm <= 150 },
  atitude: { rolagemGraus: 0, arfagemGraus: 0 },
  contato, tetoKph: 6,
});
const rodar = (quadros, desafio = DESAFIO_FARDO) => quadros.reduce((r, q) => passoDesafio(r, estado(q), desafio), RASTRO_VAZIO);

test('desafio do fardo: 20 m à frente do sensor, teto de 6 km/h, até 60 s de condução', () => {
  assert.deepEqual(DESAFIOS.map((d) => d.id), ['fardo-a-frente']);
  const [fardo] = DESAFIO_FARDO.inicio.obstaculos;
  // Face do fardo a 20 m do emissor (2,2461 m à frente da origem).
  assert.ok(Math.abs(fardo.x - fardo.raioM - 2.2461 - 20) < 1e-9);
  assert.equal(fardo.z, 0);
  assert.equal(DESAFIO_FARDO.inicio.tetoKph, 6);
  assert.ok(DESAFIO_FARDO.limiteMs <= 90_000);
});

test('parou a tempo: alerta a 150 cm, freio 0,5 s depois, parado com alerta aceso', () => {
  const r = rodar([
    { t: 1000, cm: 400 }, { t: 9000, cm: 180 },
    { t: 10_000, cm: 150 }, { t: 10_500, cm: 70, freio: 1 },
    { t: 10_900, cm: 33, kph: 0, freio: 1 },
  ]);
  assert.deepEqual(r.resultado, { desfecho: 'parou', alertaCm: 150, reacaoS: 0.5, paradaCm: 33, contatoKph: null });
  const texto = textoResultado(r.resultado);
  assert.equal(texto.titulo, 'Parou a tempo');
  assert.deepEqual(texto.linhas, ['O LUCA-AI avisou a 150 cm do fardo', 'Você freou 0,5 s depois do aviso', 'Parou a 33 cm']);
});

test('L2 segurado engata ré: a parada vale e a distância é a menor, não a da ré', () => {
  const r = rodar([
    { t: 1000 }, { t: 10_000, cm: 150 }, { t: 10_400, cm: 80, freio: 1 }, { t: 10_800, cm: 41, kph: 0.4, freio: 1 },
    { t: 10_870, cm: 44, kph: 0.6, re: true, freio: 1 },
  ]);
  assert.equal(r.resultado.desfecho, 'parou');
  assert.equal(r.resultado.paradaCm, 41);
});

test('parado longe antes do alerta não fecha', () => {
  assert.equal(rodar([{ t: 1000 }, { t: 5000, cm: 180, kph: 0, freio: 1 }]).resultado, null);
});

test('encostou: Reação atrasada com a velocidade do evento de contato', () => {
  let r = rodar([{ t: 1000 }, { t: 10_000, cm: 150 }, { t: 11_200, cm: 40, freio: 1 }]);
  r = eventoDesafio(r, { tipo: 'contato', tempoMs: 11_400, velocidadeKph: 3.2 }, estado({ t: 11_400, cm: 2, kph: 0 }));
  r = passoDesafio(r, estado({ t: 11_400, cm: 2, kph: 0, freio: 1, contato: true }));
  assert.equal(r.resultado.desfecho, 'encostou');
  assert.equal(r.resultado.contatoKph, 3.2);
  assert.equal(r.resultado.reacaoS, 1.2);
  const texto = textoResultado(r.resultado);
  assert.equal(texto.titulo, 'Reação atrasada');
  assert.equal(texto.linhas.at(-1), 'Encostou no fardo');
});

test('evento de alerta marca o instante exato da física; já freando conta reação 0', () => {
  let r = rodar([{ t: 1000 }]);
  r = eventoDesafio(r, { tipo: 'alerta', ligado: true, tempoMs: 9_870 }, estado({ t: 9_870, cm: 150, freio: 0.5 }));
  assert.equal(r.alertaMs, 9_870);
  assert.equal(r.freandoNoAlerta, true);
  r = passoDesafio(r, estado({ t: 10_200, cm: 40, kph: 0, freio: 1 }));
  assert.equal(r.resultado.reacaoS, 0);
  assert.equal(textoResultado(r.resultado).linhas[1], 'Você já estava freando no aviso');
});

test('tempo esgota sem chegar; pronto não conta e parado no começo não fecha', () => {
  assert.equal(rodar([{ t: 0, fase: 'pronto', kph: 0 }]).resultado, null);
  assert.equal(rodar([{ t: 500, kph: 0, cm: 120 }, { t: 2000, kph: 0, cm: 120 }]).resultado, null, 'não andou ainda');
  const r = rodar([{ t: 1000 }, { t: DESAFIO_FARDO.limiteMs, cm: 900 }]);
  assert.equal(r.resultado.desfecho, 'tempo');
  assert.equal(textoResultado(r.resultado).linhas[0], 'O LUCA-AI não precisou avisar');
});

test('fase fim da Direção encerra e resultado fechado não muda mais', () => {
  const r = rodar([{ t: 1000 }, { t: 5000, fase: 'fim' }]);
  assert.equal(r.resultado.desfecho, 'tempo');
  assert.equal(passoDesafio(r, estado({ t: 6000, contato: true })), r);
});

test('resultado não carrega nome nem dado pessoal', () => {
  const r = rodar([{ t: 1000 }, { t: DESAFIO_FARDO.limiteMs }]);
  assert.deepEqual(Object.keys(r.resultado).sort(), ['alertaCm', 'contatoKph', 'desfecho', 'paradaCm', 'reacaoS']);
});

const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const { createElement } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { ResultadoDesafio, AberturaDesafio } = await loadFrontendModule('../../src/components/gameplay/ResultadoDesafio.tsx');

test('tela de resultado: título, três linhas, frase, selo e contagem', () => {
  const resultado = { desfecho: 'parou', alertaCm: 150, reacaoS: 0.5, paradaCm: 33, contatoKph: null };
  const html = renderToStaticMarkup(createElement(ResultadoDesafio, { resultado, restanteS: 7.2 }));
  assert.match(html, /data-desfecho="parou"/);
  assert.match(html, /Parou a tempo/);
  assert.equal((html.match(/<li>/g) ?? []).length, 3);
  assert.match(html, /SIMULADO/);
  assert.match(html, /Recomeça em 8 s/);
  assert.match(renderToStaticMarkup(createElement(AberturaDesafio, { texto: DESAFIO_FARDO.abertura })), /Quando o LUCA-AI avisar, freie/);
});

test('evento de alerta com retrato de um quadro antes: distância vem do próximo passo', () => {
  let r = rodar([{ t: 1000 }]);
  r = eventoDesafio(r, { tipo: 'alerta', ligado: true, tempoMs: 9_900 }, estado({ t: 9_880, cm: 151 }));
  assert.equal(r.alertaCm, null);
  r = passoDesafio(r, estado({ t: 9_966, cm: 139 }));
  assert.equal(r.alertaMs, 9_900);
  assert.equal(r.alertaCm, 139);
});

const { DesafioCabine } = await loadFrontendModule('../../src/components/gameplay/DesafioCabine.tsx');

test('DesafioCabine abre na rodada 1, na abertura, com o painel montado', () => {
  const retrato = estado({ t: 0, fase: 'pronto', kph: 0 });
  const canal = { ler: () => retrato, assinar: () => () => {}, aoEvento: () => () => {}, reiniciar() {}, encerrar() {} };
  const html = renderToStaticMarkup(createElement(DesafioCabine, { canal, som: false }));
  assert.match(html, /data-etapa="abertura"/);
  assert.match(html, /data-rodada="1"/);
  assert.match(html, /data-desafio="fardo-a-frente"/);
  assert.match(html, /gameplay-painel-cabine/);
});
