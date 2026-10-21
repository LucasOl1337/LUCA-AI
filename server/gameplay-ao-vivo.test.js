import assert from 'node:assert/strict';
import test from 'node:test';
import {
  conexaoDaMesmaOrigem, criarGameplayAoVivo, normalizarRetrato, normalizarSono, PAUSADO_MAX_MS, RETRATO_MAX_BYTES, RETRATO_INTERVALO_MIN_MS, RETRATO_RECENTE_MS, TIPO_RETRATO,
} from './gameplay-ao-vivo.js';

const retratoValido = (o = {}) => ({
  versao: 1, fase: 'dirigindo', tempoMs: 1200,
  maquina: { x: 20, z: 15, rumoGraus: 0, velocidadeKph: 8, re: false },
  comandos: { esterco: 0, acelerador: 0.5, freio: 0 },
  sensor: { distanciaCm: 400, eco: false, alerta: false },
  atitude: { rolagemGraus: 0, arfagemGraus: 0 }, contato: false, tetoKph: 12, ...o,
});

const socket = (userId) => ({ userId, readyState: 1, recebidas: [], send(t) { this.recebidas.push(JSON.parse(t)); } });

test('normalizarRetrato remonta só os campos conhecidos e recusa tipo errado', () => {
  const comExtra = { ...retratoValido(), html: '<script>', maquina: { ...retratoValido().maquina, segredo: 'x' } };
  const limpo = normalizarRetrato(comExtra);
  assert.deepEqual(limpo, retratoValido());
  assert.equal(limpo.html, undefined);
  assert.equal(limpo.maquina.segredo, undefined);
  assert.equal(normalizarRetrato(retratoValido({ fase: 'hack' })), null);
  assert.equal(normalizarRetrato(retratoValido({ tempoMs: '1200' })), null);
  assert.equal(normalizarRetrato(retratoValido({ maquina: { x: Infinity } })), null);
  assert.equal(normalizarRetrato(retratoValido({ contato: 1 })), null);
  assert.equal(normalizarRetrato(null), null);
});

test('repassa só aos outros sockets da mesma conta, nunca ao remetente nem a outra conta', () => {
  const ao = criarGameplayAoVivo({ agora: () => 1000 });
  const totem = socket('A'), tablet = socket('A'), outro = socket('B');
  const r = ao.receber(totem, JSON.stringify({ kind: TIPO_RETRATO, estado: retratoValido(), lixo: 1 }), { clientes: [totem, tablet, outro] });
  assert.equal(r, 'repassado');
  assert.equal(totem.recebidas.length, 0);
  assert.equal(outro.recebidas.length, 0);
  assert.deepEqual(tablet.recebidas, [{ kind: TIPO_RETRATO, estado: retratoValido(), idadeMs: 0 }]);
});

test('descarta tipo desconhecido, JSON inválido, binário, excesso de tamanho e de taxa', () => {
  let t = 0;
  const ao = criarGameplayAoVivo({ agora: () => t });
  const s = socket('A'), par = socket('A');
  const env = (dados, extra = {}) => { t += RETRATO_INTERVALO_MIN_MS; return ao.receber(s, dados, { clientes: [s, par], ...extra }); };
  assert.equal(env(JSON.stringify({ kind: 'state', estado: retratoValido() })), 'descartado:tipo');
  assert.equal(env('{nao json'), 'descartado:json');
  assert.equal(env(Buffer.from('{}'), { isBinary: true }), 'descartado:binario');
  assert.equal(env('x'.repeat(RETRATO_MAX_BYTES + 1)), 'descartado:tamanho');
  assert.equal(env(JSON.stringify({ kind: TIPO_RETRATO, estado: { versao: 1 } })), 'descartado:formato');
  assert.equal(ao.receber(socket(null), '{}'), 'descartado:sem-conta');
  assert.equal(ao.receber({ ...socket('A'), mesmaOrigem: false }, '{}'), 'descartado:origem');
  const valido = JSON.stringify({ kind: TIPO_RETRATO, estado: retratoValido() });
  assert.equal(env(valido), 'repassado');
  // Rajada: 10 mensagens no mesmo instante, só a primeira depois do intervalo passa.
  t += RETRATO_INTERVALO_MIN_MS;
  const rajada = Array.from({ length: 10 }, () => ao.receber(s, valido, { clientes: [s, par] }));
  assert.deepEqual(rajada, ['repassado', ...Array(9).fill('descartado:taxa')]);
  assert.equal(par.recebidas.length, 2);
});

// Ensaio da feira (item 7): aba do totem oculta vira "jogo pausado" no tablet.
test('campo opcional oculto: só booleano passa, chega ao par e ao tablet que abre depois', () => {
  let t = 0;
  const ao = criarGameplayAoVivo({ agora: () => t });
  const totem = socket('A'), tablet = socket('A');
  const env = (extra) => { t += RETRATO_INTERVALO_MIN_MS; return ao.receber(totem, JSON.stringify({ kind: TIPO_RETRATO, estado: retratoValido(), ...extra }), { clientes: [totem, tablet] }); };
  assert.equal(env({ oculto: 'sim' }), 'descartado:formato');
  assert.equal(env({ oculto: 1 }), 'descartado:formato');
  assert.equal(env({ oculto: true }), 'repassado');
  assert.equal(tablet.recebidas.at(-1).oculto, true);
  const tarde = socket('A');
  ao.aoConectar(tarde);
  assert.equal(tarde.recebidas[0].oculto, true);
  assert.equal(env({ oculto: false }), 'repassado');
  assert.equal('oculto' in tablet.recebidas.at(-1), false, 'visível de novo: o campo some');
  assert.equal(env({}), 'repassado');
  assert.equal('oculto' in tablet.recebidas.at(-1), false);
  // Mesmo teto de tamanho: o campo não abre brecha para mensagem maior.
  assert.equal(env({ oculto: true, x: 'a'.repeat(RETRATO_MAX_BYTES) }), 'descartado:tamanho');
});

test('só escreve quem conectou da própria origem', () => {
  assert.equal(conexaoDaMesmaOrigem({ host: 'luca-ai.com.br', origin: 'https://luca-ai.com.br' }), true);
  assert.equal(conexaoDaMesmaOrigem({ host: '127.0.0.1:4242' }), true);
  assert.equal(conexaoDaMesmaOrigem({ host: 'luca-ai.com.br', origin: 'https://mal.example' }), false);
  assert.equal(conexaoDaMesmaOrigem({ host: 'luca-ai.com.br', 'sec-fetch-site': 'cross-site' }), false);
  assert.equal(conexaoDaMesmaOrigem({ host: '127.0.0.1:4242', 'x-forwarded-host': 'luca-ai.com.br', 'cf-ray': '1', origin: 'https://luca-ai.com.br' }), true);
});

test('tablet que conecta depois recebe o último retrato da própria conta, se recente', () => {
  let t = 5000;
  const ao = criarGameplayAoVivo({ agora: () => t });
  ao.receber(socket('A'), JSON.stringify({ kind: TIPO_RETRATO, estado: retratoValido() }));
  t += 1500;
  const tablet = socket('A'), estranho = socket('B');
  ao.aoConectar(tablet);
  ao.aoConectar(estranho);
  assert.equal(tablet.recebidas[0].idadeMs, 1500);
  assert.equal(estranho.recebidas.length, 0);
  t += 120_000;
  const tarde = socket('A');
  ao.aoConectar(tarde);
  assert.equal(tarde.recebidas.length, 0);
});

// A7(c): totem pausado há mais de 60 s; o tablet que entra depois vê "Jogo pausado", não "Aguardando o totem".
test('tablet que conecta depois recebe o retrato oculto até PAUSADO_MAX_MS; retrato normal segue com 60 s', () => {
  let t = 10_000;
  const ao = criarGameplayAoVivo({ agora: () => t });
  ao.receber(socket('A'), JSON.stringify({ kind: TIPO_RETRATO, estado: retratoValido(), oculto: true }));
  t += RETRATO_RECENTE_MS + 1000;
  const tablet = socket('A');
  ao.aoConectar(tablet);
  assert.equal(tablet.recebidas.length, 1, 'pausado há 61 s ainda chega ao tablet novo');
  assert.equal(tablet.recebidas[0].oculto, true);
  assert.equal(tablet.recebidas[0].idadeMs, RETRATO_RECENTE_MS + 1000);
  t = 10_000 + PAUSADO_MAX_MS + 1;
  const muitoTarde = socket('A');
  ao.aoConectar(muitoTarde);
  assert.equal(muitoTarde.recebidas.length, 0, 'passou de PAUSADO_MAX_MS: o tablet já trataria como sem sinal');
  // Retrato visível continua valendo só 60 s.
  const totem = socket('B');
  ao.receber(totem, JSON.stringify({ kind: TIPO_RETRATO, estado: retratoValido() }));
  t += RETRATO_RECENTE_MS + 1000;
  const tabletB = socket('B');
  ao.aoConectar(tabletB);
  assert.equal(tabletB.recebidas.length, 0);
});

// Webcam de sonolência no /gameplay?webcam=1 (opção do CP3): só status e tempo, nunca imagem.
test('campo opcional sono: remontado, repassado ao tablet e ao que abre depois; lixo é descartado', () => {
  let t = 0;
  const ao = criarGameplayAoVivo({ agora: () => t });
  const totem = socket('A'), tablet = socket('A');
  const env = (extra) => { t += RETRATO_INTERVALO_MIN_MS; return ao.receber(totem, JSON.stringify({ kind: TIPO_RETRATO, estado: retratoValido(), ...extra }), { clientes: [totem, tablet] }); };
  assert.equal(env({ sono: { status: 'alarm', closedMs: 1200, frame: 'data:image/png;base64,xx' } }), 'repassado');
  assert.deepEqual(tablet.recebidas.at(-1).sono, { status: 'alarm', closedMs: 1200 }, 'só os dois campos conhecidos');
  const tarde = socket('A');
  ao.aoConectar(tarde);
  assert.deepEqual(tarde.recebidas[0].sono, { status: 'alarm', closedMs: 1200 });
  for (const sono of [{ status: 'dormindo', closedMs: 0 }, { status: 'open', closedMs: -1 }, { status: 'open', closedMs: '0' }, { status: 'open' }, 'alarm', null]) {
    assert.equal(env({ sono }), 'descartado:formato', JSON.stringify(sono));
  }
  assert.equal(env({}), 'repassado');
  assert.equal('sono' in tablet.recebidas.at(-1), false, 'webcam desligada: o campo some');
});

test('normalizarSono: ausente fica ausente, inválido vira null', () => {
  assert.equal(normalizarSono(undefined), undefined);
  assert.equal(normalizarSono({ status: 'unknown', closedMs: 0 }).status, 'unknown');
  assert.equal(normalizarSono({ status: 'closed', closedMs: Infinity }), null);
});
