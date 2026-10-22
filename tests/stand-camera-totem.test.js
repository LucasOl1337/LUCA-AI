import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

// Lucas, 21/10: webcam sempre ligada no Totem, num stream só (no Linux a câmera
// aceita um leitor por vez), a coruja sabendo se há alguém na frente e o
// alarme de sonolência na cabine da Simulação.

const { criarCameraStand, ligarCicloCameraStand } = await loadFrontendModule('../../src/components/stand/cameraStand.ts');
const { criarVisaoTotem, INTERVALO_FORA_DA_SIMULACAO_MS, RETENTATIVA_MS } = await loadFrontendModule('../../src/components/stand/visaoTotem.ts');
const { criarDetectorPresenca, linhaCamera, ROSTO_MS, AUSENCIA_MS } = await loadFrontendModule('../../src/stand-voz/visao.ts');
const { cameraDoTotem } = await loadFrontendModule('../../src/sonolencia/cameraDoTotem.ts');
const { criarSonoCabine } = await loadFrontendModule('../../src/components/gameplay/sonoCabine.ts');
const { alertaCabine, BIPE_SONO } = await loadFrontendModule('../../src/components/gameplay/alertaCabine.ts');

class Track extends EventTarget {
  constructor(dispositivo) { super(); this.dispositivo = dispositivo; this.readyState = 'live'; }
  stop() { this.readyState = 'ended'; }
}
class Stream {
  constructor(dispositivo) { this.dispositivo = dispositivo; this.tracks = [new Track(dispositivo)]; }
  getTracks() { return this.tracks; }
  getVideoTracks() { return this.tracks; }
  clone() { return new Stream(this.dispositivo); }
}
/** Webcam do Linux: um leitor por vez; abrir com outro aberto falha. */
function webcam() {
  const w = { aberturas: 0, abertos: [] };
  w.abrir = async () => {
    if (w.abertos.some((s) => s.tracks[0].readyState === 'live')) throw Object.assign(new Error('ocupada'), { name: 'NotReadableError' });
    w.aberturas += 1;
    const s = new Stream('emeet');
    w.abertos.push(s);
    return s;
  };
  return w;
}
const tique = () => new Promise((ok) => setImmediate(ok));

test('stream único: vários consumidores ao mesmo tempo abrem a câmera uma vez só', async () => {
  const w = webcam();
  const camera = criarCameraStand({ abrir: w.abrir });
  const [olho, quadro, sonolencia] = await Promise.all([camera.emprestar(), camera.emprestar(), camera.emprestar()]);
  assert.equal(w.aberturas, 1);
  assert.equal(camera.ler().fase, 'ligada');
  assert.notEqual(olho, quadro);
  assert.notEqual(quadro, sonolencia);
  // O iframe da /sonolencia devolve o clone dele: a câmera e os outros seguem vivos.
  sonolencia.getTracks().forEach((t) => t.stop());
  assert.equal(w.abertos[0].tracks[0].readyState, 'live');
  assert.equal(olho.tracks[0].readyState, 'live');
  await camera.emprestar();
  assert.equal(w.aberturas, 1, 'emprestar de novo não reabre');
});

test('aba oculta pausa a câmera e todos os clones; visível de novo reabre uma vez', async () => {
  const w = webcam();
  const camera = criarCameraStand({ abrir: w.abrir });
  const janela = new EventTarget();
  const documento = Object.assign(new EventTarget(), { hidden: false });
  ligarCicloCameraStand(camera, janela, documento);
  const clone = await camera.emprestar();
  documento.hidden = true; documento.dispatchEvent(new Event('visibilitychange'));
  assert.equal(camera.ler().fase, 'pausada');
  assert.equal(w.abertos[0].tracks[0].readyState, 'ended', 'a luz da câmera apaga');
  assert.equal(clone.tracks[0].readyState, 'ended');
  documento.hidden = false; documento.dispatchEvent(new Event('visibilitychange'));
  documento.dispatchEvent(new Event('visibilitychange'));
  await tique();
  assert.equal(w.aberturas, 2);
  assert.equal(camera.ler().fase, 'ligada');
});

test('abertura que chega depois da pausa é descartada (não fica câmera órfã ligada)', async () => {
  let soltar;
  const pendente = new Stream('emeet');
  const camera = criarCameraStand({ abrir: () => new Promise((ok) => { soltar = () => ok(pendente); }) });
  const ligando = camera.ligar();
  camera.pausar();
  soltar();
  assert.equal(await ligando, null);
  assert.equal(pendente.tracks[0].readyState, 'ended');
  assert.equal(camera.ler().fase, 'pausada');
});

test('câmera bloqueada vira erro legível, sem quebrar o Totem', async () => {
  const camera = criarCameraStand({ abrir: async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); }, mensagemErro: () => 'A câmera foi bloqueada.' });
  await assert.rejects(camera.emprestar(), /bloqueada/);
  assert.deepEqual(camera.ler(), { fase: 'erro', erro: 'A câmera foi bloqueada.' });
});

test('/sonolencia no iframe do Totem pega o clone da câmera do pai; solta ou de outra origem abre a própria', async () => {
  const w = webcam();
  const camera = criarCameraStand({ abrir: w.abrir });
  const pai = { __lucaCameraStand: camera };
  const abrir = cameraDoTotem({ parent: pai });
  assert.equal(typeof abrir, 'function');
  await camera.ligar();
  const s = await abrir();
  assert.equal(s.dispositivo, 'emeet');
  assert.equal(w.aberturas, 1, 'o iframe não abre a webcam de novo');
  const solta = {}; solta.parent = solta;
  assert.equal(cameraDoTotem(solta), undefined);
  const outraOrigem = { get parent() { return new Proxy({}, { get() { throw new DOMException('cross-origin', 'SecurityError'); } }); } };
  assert.equal(cameraDoTotem(outraOrigem), undefined);
});

test('presença com histerese: rosto conta depois de 1 s e só some depois de 3 s sem rosto', () => {
  const p = criarDetectorPresenca();
  assert.equal(p.observar(true, 0), 'desconhecida');
  assert.equal(p.observar(true, ROSTO_MS - 1), 'desconhecida');
  assert.equal(p.observar(true, ROSTO_MS), 'rosto');
  assert.equal(p.observar(false, 2000), 'rosto', 'virou a cabeça um instante');
  assert.equal(p.observar(true, 2500), 'rosto');
  assert.equal(p.observar(false, 3000), 'rosto');
  assert.equal(p.observar(false, 3000 + AUSENCIA_MS), 'ninguem');
  assert.match(linhaCamera('ligada', 'rosto'), /há uma pessoa de frente/);
  assert.match(linhaCamera('ligada', 'ninguem'), /nenhum rosto/);
  assert.match(linhaCamera('pausada', 'rosto'), /desligada/);
});

/** Monitor falso: o teste manda as leituras do detector. */
function monitores() {
  const lista = [];
  const criar = (op) => {
    const m = { op, parado: false, aberto: null };
    m.iniciar = async () => { m.aberto = await op.abrirCamera(); return { width: 1920, height: 1080 }; };
    m.parar = () => { m.parado = true; m.aberto?.getTracks().forEach((t) => t.stop()); };
    m.ler = (status, rosto, closedMs = 0) => op.aoLer({ status, closedMs, alarm: status === 'alarm' }, rosto ? { left: 0.1, right: 0.1 } : null);
    lista.push(m);
    return m;
  };
  return { lista, criar };
}
const estadoDirigindo = {
  versao: 1, fase: 'dirigindo', tempoMs: 1000,
  maquina: { x: 0, z: 0, rumoGraus: 0, velocidadeKph: 6, re: false },
  comandos: { esterco: 0, acelerador: 0, freio: 0 },
  sensor: { distanciaCm: 400, eco: false, alerta: false },
  atitude: { rolagemGraus: 0, arfagemGraus: 0 },
  contato: false, tetoKph: 6,
};

test('alarme de sonolência na Simulação: olhos fechados 1 s acendem o bipe da cabine; fora dela o sono some', async () => {
  const w = webcam();
  const camera = criarCameraStand({ abrir: w.abrir });
  const sono = criarSonoCabine();
  const { lista, criar } = monitores();
  let modo = 'simulacao';
  let relogio = 0;
  const linhas = [];
  const visao = criarVisaoTotem({ camera, criarMonitor: criar, modo: () => modo, sono, agora: () => relogio, aoMudar: ({ linha }) => linhas.push(linha) });
  visao.iniciar();
  await tique(); await tique();
  assert.equal(lista.length, 1, 'um detector só');
  assert.equal(w.aberturas, 1);
  const m = lista[0];
  assert.equal(m.op.intervaloMs(), 0, 'na Simulação, 10 leituras/s');
  m.ler('open', true);
  assert.deepEqual(sono.ler(), { status: 'open', closedMs: 0 });
  assert.equal(alertaCabine(estadoDirigindo, sono.ler()).bipe.intervaloMs, null, 'olhos abertos: mudo');
  relogio = 1200;
  m.ler('alarm', true, 1200);
  assert.deepEqual(sono.ler(), { status: 'alarm', closedMs: 1200 });
  assert.deepEqual(alertaCabine(estadoDirigindo, sono.ler()).bipe, BIPE_SONO, 'motorista dormindo = bipe na cabine');
  // Vai para a Vitrine: nada de alarme lá, e o detector olha mais devagar.
  modo = 'vitrine';
  visao.aoMudarModo();
  assert.equal(sono.ler(), null);
  assert.equal(m.op.intervaloMs(), INTERVALO_FORA_DA_SIMULACAO_MS);
  m.ler('alarm', true, 1500);
  assert.equal(sono.ler(), null);
  assert.ok(linhas.at(-1).includes('há uma pessoa de frente'), linhas.join(' | '));
  visao.parar();
  assert.equal(m.parado, true);
});

test('detector que cai tenta de novo sem abrir outra câmera; câmera pausada solta o detector', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = webcam();
  const camera = criarCameraStand({ abrir: w.abrir });
  const { lista, criar } = monitores();
  const visao = criarVisaoTotem({ camera, criarMonitor: criar, modo: () => 'coruja', sono: criarSonoCabine(), esperar: (fn, ms) => setTimeout(fn, ms), cancelar: (id) => clearTimeout(id) });
  visao.iniciar();
  await tique(); await tique();
  lista[0].op.aoFalhar('A análise da câmera parou de responder.');
  assert.equal(lista.length, 1);
  t.mock.timers.tick(RETENTATIVA_MS);
  await tique(); await tique();
  assert.equal(lista.length, 2, 'novo detector');
  assert.equal(w.aberturas, 1, 'mesma câmera');
  camera.pausar();
  assert.equal(lista[1].parado, true);
  assert.equal(visao.linha().includes('desligada'), true);
  visao.parar();
});
