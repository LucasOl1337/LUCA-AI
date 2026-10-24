import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

// Lucas, 24/10: "os efeitos sonoros de alerta não tão parecendo alerta de
// máquina da vida real, tanto pra colisão quanto pra sonolência".
globalThis.window ??= globalThis;
const T = await loadFrontendModule('../../src/components/gameplay/timbreAlarme.ts');
const { criarMotorBipe } = await loadFrontendModule('../../src/components/gameplay/bipeCabine.ts');
const { BIPE_SONO, BIPE_RE } = await loadFrontendModule('../../src/components/gameplay/alertaCabine.ts');
const { criarAudioCircuito, rajadaCircuito } = await loadFrontendModule('../../src/components/gameplay/audioCircuito.ts');

/** Contexto que registra fontes, onda, frequências e a curva de ganho agendada. */
function contexto() {
  const fontes = [];
  const curva = () => { const p = { value: 0, eventos: [], setValueAtTime(v, t) { p.eventos.push(['set', v, t]); }, linearRampToValueAtTime(v, t) { p.eventos.push(['ramp', v, t]); }, cancelScheduledValues(t) { p.eventos.push(['cancel', t]); } }; return p; };
  const ctx = {
    state: 'running', currentTime: 0, sampleRate: 48000, destination: {},
    createPeriodicWave(_re, im) { return { im: [...im] }; },
    createGain() { return { gain: curva(), connect: (d) => d, disconnect() {} }; },
    createBiquadFilter() { return { type: '', frequency: curva(), Q: { value: 0 }, connect: (d) => d }; },
    createBuffer(_c, n) { const d = new Float32Array(n); return { getChannelData: () => d }; },
    createBufferSource() { const b = { connect: (d) => d, start(t) { b.inicio = t; fontes.push(b); }, stop(t) { b.fim = t; }, disconnect() {} }; return b; },
    createOscillator() {
      const o = { frequency: curva(), setPeriodicWave(w) { o.onda = w; }, connect: (g) => g, disconnect() {}, start(t) { o.inicio = t; fontes.push(o); }, stop(t) { o.fim = t; } };
      return o;
    },
  };
  return { ctx, fontes };
}
const som = (ctx) => ({ obter: () => ctx, destravar: async () => true, ligarDestravas: () => () => {} });

test('nenhum alarme é senoide: buzzer e buzina têm harmônicos; sensor agudo de piezo, ré de buzina, sono com dois tons', () => {
  const { ctx, fontes } = contexto();
  for (const def of Object.values(T.ALARMES)) T.agendarRajada(ctx, def, ctx.destination);
  for (const o of fontes.filter((f) => f.onda)) assert.ok(o.onda.im.filter((a) => a > 0.05).length >= 3, 'três ou mais harmônicos');
  assert.ok(T.ALARMES.proximidade.hz >= 2000 && T.ALARMES.proximidade.hz <= 3500, 'piezo de cabine: 2–3,5 kHz');
  assert.equal(T.ALARMES.re.voz, 'buzina');
  assert.equal(T.ALARMES.re.padrao[0][1] / T.ALARMES.re.periodoMs, 0.5, 'ré: meio ligado, meio desligado');
  assert.equal(new Set(T.ALARMES.sono.padrao.map((p) => p[2])).size, 2, 'sono alterna dois tons');
  assert.notEqual(T.ALARMES.sono.hz, T.ALARMES.proximidade.hz, 'sono não se confunde com o sensor');
});

test('rajada: um pulso por item do padrão, ataque e soltura sem estalo, pico abaixo de 1', () => {
  const { ctx, fontes } = contexto();
  const def = T.ALARMES.sono;
  const r = T.agendarRajada(ctx, def, ctx.destination, 1);
  const subidas = r.ganho.gain.eventos.filter(([k, v]) => k === 'ramp' && v > 0);
  assert.equal(subidas.length, def.padrao.length);
  for (const [, v] of subidas) assert.ok(v > 0.3 && v < 1);
  assert.equal(fontes.length, 1, 'uma fonte por rajada');
  assert.ok(Math.abs(fontes[0].fim - (1 + 0.495 + 0.01)) < 1e-9, 'a fonte para logo depois do último pulso');
  assert.deepEqual(r.ganho.gain.eventos[0], ['set', 0, 1]);
});

test('parar corta a buzina de ré no meio (rampa curta) e o motor corta todas as rajadas em voo', () => {
  const { ctx, fontes } = contexto();
  const motor = criarMotorBipe(som(ctx));
  motor.tocar(BIPE_RE.intervaloMs, BIPE_RE.som);
  ctx.currentTime = 0.2;
  motor.parar();
  assert.ok(fontes[0].fim <= 0.21, 'buzina de 500 ms não segue tocando depois do parar');
  motor.fechar();
});

test('troca de alerta no meio da cadência: o próximo pulso já sai no timbre novo, sem reiniciar o relógio', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { ctx, fontes } = contexto();
  const motor = criarMotorBipe(som(ctx));
  motor.tocar(200, 'zona');
  motor.tocar(200, 'proximidade');
  assert.equal(fontes.length, 1, 'troca não bipa na hora');
  t.mock.timers.tick(200);
  assert.equal(fontes.length, 2);
  assert.equal(fontes[1].frequency.eventos[0][1], T.ALARMES.proximidade.hz);
  motor.fechar();
});

test('sonolência igual na cabine e no circuito: mesmo padrão, repetido sem pausa enquanto dura', () => {
  assert.equal(BIPE_SONO.som, 'sono');
  assert.equal(BIPE_SONO.intervaloMs, T.ALARMES.sono.periodoMs);
  assert.deepEqual(rajadaCircuito('sonolencia', true), T.ALARMES.sono);
  const { ctx, fontes } = contexto();
  const audio = criarAudioCircuito(som(ctx));
  const e = { fase: 'dirigindo', sensor: { eco: false, alerta: false, distanciaCm: 400 }, maquina: { x: -999, z: -999, rumoGraus: 0, velocidadeKph: 0, re: false }, atitude: { rolagemGraus: 0, arfagemGraus: 0 } };
  for (let ms = 0; ms <= 2000; ms += 50) audio.atualizar(e, ms, false, true);
  assert.equal(fontes.length, 2000 / T.ALARMES.sono.periodoMs + 1);
  audio.parar();
});

test('circuito crítico dobra o pulso do sensor; atenção é um pulso só', () => {
  assert.equal(rajadaCircuito('feno', false).padrao.length, 1);
  assert.equal(rajadaCircuito('feno', true).padrao.length, 2);
  assert.equal(rajadaCircuito('feno', true).hz, T.ALARMES.proximidade.hz);
});

test('/sonolencia toca o mesmo alarme da cabine e silencia ao parar', async () => {
  const { ctx, fontes } = contexto();
  globalThis.AudioContext = class { constructor() { Object.assign(this, ctx); this.state = 'suspended'; } async resume() { this.state = 'running'; } async close() {} };
  const { DrowsinessAlarm } = await loadFrontendModule('../../src/sonolencia/alarm.ts');
  const alarme = new DrowsinessAlarm();
  await alarme.unlock();
  alarme.start();
  assert.equal(fontes.length, 1);
  assert.deepEqual(fontes[0].frequency.eventos.filter(([k]) => k === 'set').map(([, hz]) => hz), T.ALARMES.sono.padrao.map(([, , m]) => T.ALARMES.sono.hz * m));
  alarme.close();
  assert.ok(fontes[0].fim <= 0.01, 'parou na hora');
  delete globalThis.AudioContext;
});
