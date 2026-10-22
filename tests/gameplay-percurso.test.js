import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';
import { parseLabCase, toLocalCoordinate } from '../shared/lab-telemetry.js';
import { amostraDoPercurso, manifestoDoPercurso, mapaDoPercurso, PERCURSO_ORIGEM, percursoParaLonLat, registroDoPercurso } from '../shared/percurso-lab.js';

const { criarMotorGameplay } = await loadFrontendModule('../../src/components/gameplay/motorGameplay.ts');
const { DESAFIO_ALAGADO, DESAFIOS, RASTRO_VAZIO, passoDesafio, textoResultado } = await loadFrontendModule('../../src/components/gameplay/desafios.ts');
const { TRECHOS_PERCURSO, notaDoTrecho, resumoPercurso, REGRAS_NOTA } = await loadFrontendModule('../../src/components/gameplay/percurso.ts');
const { ZONAS_TALHAO, TALHAO, ENCOSTA_TALHAO, geofenceTalhao } = await loadFrontendModule('../../src/components/gameplay/geofenceTalhao.ts');
const { textoDaAnalise } = await loadFrontendModule('../../src/components/gameplay/analisePercurso.ts');

const DT = 1 / 60;
const relogio = () => { let t = 0; return { agora: () => t, andar: (ms) => { t += ms; } }; };

/** Dirige o trecho no motor real até o desafio fechar; `comando(estado)` decide o volante a cada quadro. */
function dirigir(desafio, comando, limite = 90 * 60) {
  const r = relogio();
  const motor = criarMotorGameplay(r.agora);
  motor.reiniciar(desafio.inicio);
  let rastro = RASTRO_VAZIO;
  const estados = [];
  for (let i = 0; i < limite && !rastro.resultado; i += 1) {
    motor.quadro(DT, comando(motor.ler()));
    r.andar(1000 / 60);
    const estado = motor.ler();
    estados.push(estado);
    rastro = passoDesafio(rastro, estado, desafio);
  }
  return { resultado: rastro.resultado, estados };
}

test('percurso guiado: fardo, encosta e área alagada, na ordem; as rodadas do /gameplay seguem as duas de antes', () => {
  assert.deepEqual(TRECHOS_PERCURSO.map((d) => d.id), ['fardo-a-frente', 'pendente-lateral', 'area-alagada']);
  assert.deepEqual(DESAFIOS.map((d) => d.id), ['fardo-a-frente', 'pendente-lateral']);
  // O trecho alagado parte na faixa da zona do geofence (a mesma do minimapa), olhando para ela.
  const zona = ZONAS_TALHAO[0].poligono.rings[0];
  const z0 = Math.min(...zona.map((p) => p.z)), z1 = Math.max(...zona.map((p) => p.z));
  assert.ok(DESAFIO_ALAGADO.inicio.z > z0 && DESAFIO_ALAGADO.inicio.z < z1);
  assert.ok(DESAFIO_ALAGADO.inicio.x < Math.min(...zona.map((p) => p.x)));
});

test('área alagada no motor real: seguir reto entra; o geofence avisou antes', () => {
  const { resultado } = dirigir(DESAFIO_ALAGADO, () => ({ esterco: 0, acelerador: 1, freio: 0 }));
  assert.equal(resultado.desafio, 'area-alagada');
  assert.equal(resultado.desfecho, 'entrou');
  assert.equal(resultado.alertou, true);
  assert.equal(notaDoTrecho(resultado), 0);
  assert.equal(textoResultado(resultado).titulo, 'Entrou na área alagada');
});

test('área alagada no motor real: frear no aviso para antes da água', () => {
  let avisou = false;
  const { resultado } = dirigir(DESAFIO_ALAGADO, (estado) => {
    // O geofence projeta 3 s à frente; ao 1º aviso, freia.
    avisou ||= geofenceTalhao(estado.maquina).nivel !== 'fora';
    return avisou ? { esterco: 0, acelerador: 0, freio: 1 } : { esterco: 0, acelerador: 1, freio: 0 };
  });
  assert.equal(resultado.desfecho, 'parou');
  assert.equal(resultado.alertou, true);
  assert.equal(notaDoTrecho(resultado), 90);
});

test('área alagada no motor real: virar para fora da zona contorna e fecha o trecho', () => {
  // Zona em z 9–24, partida em z 13. Esterço −1 aumenta o rumo (vira para z menor): sai pela borda z < 9 e endireita.
  const { resultado } = dirigir(DESAFIO_ALAGADO, (estado) => ({
    esterco: estado.maquina.z > 5 && estado.maquina.rumoGraus < 35 ? -1 : estado.maquina.rumoGraus > 2 ? 1 : 0,
    acelerador: 1, freio: 0,
  }));
  assert.equal(resultado.desfecho, 'desviou');
  assert.ok(notaDoTrecho(resultado) >= 80);
});


test('nota por regra: valores do texto das regras, tempo esgotado fora da média', () => {
  assert.equal(REGRAS_NOTA.length, 4);
  assert.equal(notaDoTrecho({ desafio: 'fardo-a-frente', desfecho: 'parou', alertaCm: 150, reacaoS: 0.5, paradaCm: 33, contatoKph: null }), 100);
  assert.equal(notaDoTrecho({ desafio: 'fardo-a-frente', desfecho: 'parou', alertaCm: 150, reacaoS: 1.8, paradaCm: 10, contatoKph: null }), 80);
  assert.equal(notaDoTrecho({ desafio: 'fardo-a-frente', desfecho: 'encostou', alertaCm: 150, reacaoS: null, paradaCm: null, contatoKph: 6 }), 20);
  assert.equal(notaDoTrecho({ desafio: 'fardo-a-frente', desfecho: 'encostou', alertaCm: null, reacaoS: null, paradaCm: null, contatoKph: 6 }), 0);
  assert.equal(notaDoTrecho({ desafio: 'pendente-lateral', desfecho: 'atravessou', alertaGraus: 20, reacaoS: 1, maxGraus: 22 }), 100);
  assert.equal(notaDoTrecho({ desafio: 'pendente-lateral', desfecho: 'atravessou', alertaGraus: 20, reacaoS: null, maxGraus: 22 }), 70);
  assert.equal(notaDoTrecho({ desafio: 'pendente-lateral', desfecho: 'tombou', alertaGraus: 20, reacaoS: null, maxGraus: 40 }), 0);
  const tempo = { desafio: 'area-alagada', desfecho: 'tempo', alertou: false, reacaoS: null };
  assert.equal(notaDoTrecho(tempo), null);
  const resumo = resumoPercurso([
    { desafio: 'fardo-a-frente', desfecho: 'parou', alertaCm: 150, reacaoS: 0.5, paradaCm: 33, contatoKph: null },
    { desafio: 'pendente-lateral', desfecho: 'atravessou', alertaGraus: 20, reacaoS: null, maxGraus: 22 },
    tempo,
  ]);
  assert.equal(resumo.nota, 85);
  assert.deepEqual(resumo.trechos.map((t) => t.titulo), ['Fardo à frente', 'Pendente lateral', 'Área alagada'].map((t, i) => TRECHOS_PERCURSO[i].titulo));
  // Linguagem: nota do percurso simulado, nunca risco de seguro.
  assert.doesNotMatch(REGRAS_NOTA.join(' '), /seguro|sinistro|risco|cobertura/i);
});

test('registro do percurso vira caso do Laboratório: sintético, fictício, sem colunas inventadas', () => {
  const { estados } = dirigir(DESAFIO_ALAGADO, () => ({ esterco: 0, acelerador: 1, freio: 0 }));
  const amostras = estados.filter((_, i) => i % 12 === 0).map((e) => amostraDoPercurso(e, { inclinado: false }));
  const registro = registroDoPercurso(amostras, '2026-10-21T19:00:00.000Z');
  const zona = ZONAS_TALHAO[0].poligono.rings[0];
  const caso = parseLabCase(registro.csv, {
    fileName: 'percurso-totem.csv',
    manifest: manifestoDoPercurso({ amostras: registro.amostras, duracaoMs: registro.duracaoMs }),
    map: mapaDoPercurso({ talhao: TALHAO, alagado: zona, encosta: ENCOSTA_TALHAO.rings[0] }),
  });
  assert.equal(caso.synthetic, true);
  assert.equal(caso.samples.length, registro.amostras);
  assert.ok(caso.samples.length > 20);
  // O que o jogo não mede fica ausente, não zerado.
  assert.equal(caso.samples[0].coolant_temp_c, null);
  assert.equal(caso.samples[0].engine_rpm, null);
  assert.equal(caso.samples[0].ground_speed_kmh >= 0, true);
  // Entrar na zona aparece como evento de geofence do Laboratório sobre a mesma área.
  assert.ok(caso.events.some((e) => /geofence|water|água|alagad/i.test(`${e.type} ${e.title} ${e.description}`)), JSON.stringify(caso.events.map((e) => e.type)));
  // Ida e volta das coordenadas preserva os metros do simulador.
  const [lon, lat] = percursoParaLonLat(30, 15);
  const local = toLocalCoordinate(lon, lat, PERCURSO_ORIGEM);
  assert.ok(Math.abs(local.x - 30) < 0.01 && Math.abs(local.z - 15) < 0.01);
});

test('texto da análise liga a hipótese ao instante da evidência; parcial diz quantos eixos', () => {
  const analise = {
    id: 'a1', status: 'partial', createdAt: '2026-10-21T19:00:00Z',
    axes: [
      { id: 'operation', title: 'Operação', status: 'completed', summary: 'O operador freou depois do aviso.', hypotheses: [] },
      { id: 'mechanical', title: 'Mecânica', status: 'failed', summary: '', hypotheses: [] },
    ],
    hypotheses: [{ title: 'Reação lenta ao aviso de água', evidence: [{ elapsedMs: 12_400, description: 'freio 2 s após geofence' }] }],
  };
  const texto = textoDaAnalise(analise, 'Percurso do totem');
  assert.match(texto.titulo, /parcial \(1\/2/);
  assert.equal(texto.resumo, 'O operador freou depois do aviso.');
  assert.match(texto.achados[0], /^Reação lenta ao aviso de água — em .*12.*: freio 2 s após geofence$/);
});

test('painel da análise: espera honesta, falha com a mensagem do servidor, pronta com o caso', async () => {
  const { AnaliseAgentes } = await loadFrontendModule('../../src/components/gameplay/PercursoCabine.tsx');
  const html = (analise) => renderToStaticMarkup(createElement(AnaliseAgentes, { analise }));
  assert.match(html({ tipo: 'parada' }), /podem analisar o registro deste percurso/);
  assert.match(html({ tipo: 'analisando', segundos: 42, amostras: 216 }), /há 42 s \(216 amostras\)/);
  const falha = html({ tipo: 'falha', mensagem: 'Limite de 100 casos atingido.' });
  assert.match(falha, /role="alert"/);
  assert.match(falha, /Limite de 100 casos atingido\./);
  const pronta = html({ tipo: 'pronta', titulo: 'Análise dos agentes:', resumo: 'Sem frenagem no aviso.', achados: ['A — em 00:10: b'], caso: 'Percurso do totem · x' });
  assert.match(pronta, /data-pronta/);
  assert.match(pronta, /Caso completo no Laboratório: Percurso do totem · x/);
});

test('cabine do percurso desenha a trilha e a abertura do 1º trecho, com o painel e o minimapa', async () => {
  const { PercursoCabine } = await loadFrontendModule('../../src/components/gameplay/PercursoCabine.tsx');
  const motor = criarMotorGameplay(() => 0);
  const h = renderToStaticMarkup(createElement(PercursoCabine, { canal: motor, som: false, aoSair() {} }));
  assert.match(h, /data-percurso-trecho="fardo-a-frente"/);
  assert.match(h, /data-etapa="abertura"/);
  assert.match(h, /1\/3 · /);
  for (const t of TRECHOS_PERCURSO) assert.ok(h.includes(`>${t.titulo}</li>`), t.titulo);
  assert.match(h, /gameplay-painel/);
  const css = fs.readFileSync(new URL('../src/components/gameplay/painelCabine.css', import.meta.url), 'utf8');
  assert.match(css, /\.gameplay-percurso-livre\s*\{[^}]*pointer-events:\s*auto/);
  assert.match(css, /\.gameplay-percurso-resumo\s+\.gameplay-painel-selo\s*\{[^}]*position:\s*static/);
  assert.match(css, /\.gameplay-percurso\s+\.gameplay-painel-alerta\s*\{[^}]*top:\s*7\.4cqh/);
  assert.match(css, /@container\s*\(max-aspect-ratio:\s*4\s*\/\s*5\)/);
});
