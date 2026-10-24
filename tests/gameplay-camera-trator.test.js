import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFrontendModule } from './support/load-frontend-module.js';
const { lerVistaTrator, alternarVistaTrator, criarVistaExterna } = await loadFrontendModule('../../src/components/gameplay/vistaTrator.ts');
const { COMANDOS_CABINE } = await loadFrontendModule('../../src/components/gameplay/comandosCabine.ts');
const THREE = await import('three');
test('vista alterna e persiste na sessão; contrato real expõe Cross/A/C', () => {
  assert.equal(COMANDOS_CABINE.camera.disponivel, true);
  assert.equal(COMANDOS_CABINE.camera.botao, 0);
  assert.deepEqual(COMANDOS_CABINE.camera.teclas, ['c']);
  const inicial = lerVistaTrator();
  assert.notEqual(alternarVistaTrator(), inicial);
  assert.notEqual(lerVistaTrator(), inicial);
  assert.equal(alternarVistaTrator(), inicial);
});
test('vista externa fica atrás/acima da máquina e olha para o caminho', () => {
  const camera = new THREE.PerspectiveCamera(), maquina = new THREE.Object3D();
  maquina.position.set(20, 1, 3); maquina.updateMatrixWorld(true);
  criarVistaExterna()(camera, maquina);
  assert.deepEqual(camera.position.toArray(), [10, 7, 3]);
  const frente = camera.getWorldDirection(new THREE.Vector3());
  assert.ok(frente.x > 0 && frente.y < 0);
});

const { VISTA_EXTERNA, amortecerRumo, rumoDaMaquina } = await loadFrontendModule('../../src/components/gameplay/vistaTrator.ts');
const { criarMotorGameplay } = await loadFrontendModule('../../src/components/gameplay/motorGameplay.ts');
const rumoDaCamera = (camera) => { const f = camera.getWorldDirection(new THREE.Vector3()); return Math.atan2(-f.z, f.x); };
const graus = (r) => r * 180 / Math.PI;
const dif = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** Pose do palco: posição e rumo do motor, ordem YZX como no createSompoAgriStage. */
function posar(maquina, t) { maquina.position.set(t.x, 0, t.z); maquina.rotation.set(0, t.rumo, 0, 'YZX'); maquina.updateMatrixWorld(true); }

test('vista externa (Lupa D5): em curva no batente a 12 km/h a câmera segue o rumo com atraso; antes girava colada', () => {
  const motor = criarMotorGameplay(() => 0);
  motor.reiniciar({ x: 0, z: 0, rumoGraus: 0, tetoKph: 12, obstaculos: [] });
  const camera = new THREE.PerspectiveCamera(), maquina = new THREE.Object3D(), vista = criarVistaExterna();
  const dt = 1 / 60;
  for (let i = 0; i < 60 * 4; i += 1) { motor.quadro(dt, { esterco: 0, acelerador: 1, freio: 0 }); posar(maquina, motor.trator()); vista(camera, maquina, dt); }
  assert.ok(Math.abs(dif(rumoDaCamera(camera), rumoDaMaquina(maquina))) < 1e-6, 'em reta a câmera fica atrás do trator');
  const amostras = [];
  for (let i = 1; i <= 60 * 3; i += 1) {
    motor.quadro(dt, { esterco: 1, acelerador: 1, freio: 0 }); posar(maquina, motor.trator()); vista(camera, maquina, dt);
    amostras.push({ t: i * dt, atraso: graus(dif(rumoDaMaquina(maquina), rumoDaCamera(camera))) });
  }
  const guinada = Math.abs(graus(motor.trator().guinada));
  const regime = Math.abs(amostras.at(-1).atraso);
  // Em regime o atraso = guinada × τ (34,6 °/s × 0,35 s ≈ 12°): o trator aparece virando na tela.
  assert.ok(Math.abs(regime - guinada * VISTA_EXTERNA.tauS) < 1, `regime ${regime} vs ${guinada * VISTA_EXTERNA.tauS}`);
  assert.ok(regime > 9 && regime < 15, `atraso ${regime}°`);
  // Soltar o volante (aro volta em 0,4 s, guinada τ 0,18 s): a câmera está atrás do trator em 1,5 s.
  for (let i = 0; i < 90; i += 1) { motor.quadro(dt, { esterco: 0, acelerador: 1, freio: 0 }); posar(maquina, motor.trator()); vista(camera, maquina, dt); }
  const apos = Math.abs(graus(dif(rumoDaMaquina(maquina), rumoDaCamera(camera))));
  assert.ok(apos < 1, `após 1,5 s: ${apos}°`);
});

test('vista externa (Lupa D5): atraso independe do FPS e não passa do rumo alvo', () => {
  const passo = (fps, s) => { let r = 0; for (let i = 0; i < Math.round(fps * s); i += 1) r = amortecerRumo(r, 1, 1 / fps); return r; };
  assert.ok(Math.abs(passo(30, 1) - passo(144, 1)) < 1e-9);
  assert.ok(Math.abs(passo(60, 0.35) - (1 - Math.exp(-1))) < 1e-9);
  assert.ok(passo(60, 5) <= 1);
  // Caminho curto pela costura ±π.
  const r = amortecerRumo(Math.PI - 0.1, -Math.PI + 0.1, 1 / 60);
  assert.ok(r > Math.PI - 0.1 && r < Math.PI, 'anda 0,2 rad pela costura, não 6 rad pelo outro lado');
});

test('vista externa (Lupa D5): reinício, aba que volta e troca de vista recolocam a câmera atrás sem varrer', () => {
  const camera = new THREE.PerspectiveCamera(), maquina = new THREE.Object3D(), vista = criarVistaExterna();
  posar(maquina, { x: 0, z: 0, rumo: 0 }); vista(camera, maquina, 1 / 60);
  posar(maquina, { x: 50, z: 50, rumo: 2 }); vista(camera, maquina, 1 / 60);
  assert.ok(Math.abs(dif(rumoDaCamera(camera), 2)) < 1e-6, 'teleporte do reinício');
  posar(maquina, { x: 50.1, z: 50, rumo: 2.5 }); vista(camera, maquina, 1);
  assert.ok(Math.abs(dif(rumoDaCamera(camera), 2.5)) < 1e-6, 'passo longo (aba oculta)');
  posar(maquina, { x: 50.2, z: 50, rumo: 2.8 }); vista.reiniciar(); vista(camera, maquina, 1 / 60);
  assert.ok(Math.abs(dif(rumoDaCamera(camera), 2.8)) < 1e-6, 'voltou da cabine');
});
