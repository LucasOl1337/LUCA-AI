import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as THREE from 'three';
import { SOMPO_SCENARIO_EFFECTS, getSompoScenarioEffects, getSompoAnimalPose } from '../shared/sompo-scenario-effects.js';
import { SOMPO_SIMULATION_SCENARIOS, SOMPO_COLLISION_SCRIPT, getSompoRuralFrame } from '../shared/sompo-telemetry-simulator.js';

const cue = (id, time, effect) => getSompoScenarioEffects(id, time).cues.find((item) => item.effect === effect);

test('Nelore tem escala de animal adulto, sai completamente da pista e encerra fora da câmera', () => {
  const initial = getSompoAnimalPose(-6, 0);
  assert.ok(initial.length <= 2.4 && initial.height <= 1.7 && initial.width <= 1);
  assert.equal(initial.yaw, -Math.PI / 2);
  let previousX = 7;
  for (const time of [5000, 7000, 8000, 10000, 12999]) {
    const pose = getSompoAnimalPose(getSompoRuralFrame('animal-crossing', time).animalZ, time);
    assert.ok(pose.visible); assert.ok(pose.x >= previousX); previousX = pose.x;
    assert.deepEqual(pose, getSompoAnimalPose(getSompoRuralFrame('animal-crossing', time).animalZ, time));
    if (time >= 8000) assert.ok(pose.z - pose.length / 2 > 2.05, 'Entire body has cleared the paved road');
  }
  const end = getSompoAnimalPose(7, 13000);
  assert.equal(end.visible, false); assert.ok(end.x >= 24);
  assert.equal(cue('animal-crossing', 13000, 'animal'), undefined);
  assert.equal(getSompoScenarioEffects('animal-crossing', 13000).focusX, 0);
  assert.deepEqual(getSompoAnimalPose(NaN, Infinity), initial);
});

test('cada preset e colisão tem coreografia explícita, congelada e determinística', () => {
  assert.deepEqual(Object.keys(SOMPO_SCENARIO_EFFECTS).sort(), [...Object.keys(SOMPO_SIMULATION_SCENARIOS), SOMPO_COLLISION_SCRIPT.scenarioId].sort());
  for (const [id, definition] of Object.entries(SOMPO_SCENARIO_EFFECTS)) {
    assert.ok(Object.isFrozen(definition) && Object.isFrozen(definition.tracks));
    assert.ok(definition.tracks.length >= 2);
    for (const track of definition.tracks) {
      assert.ok(Object.isFrozen(track)); assert.ok(track.startMs >= 0);
      assert.ok(track.endMs === null || track.endMs > track.startMs);
    }
    for (const time of [-100, 0, 2900, 5500, 9000, 16000, 1000000, NaN, Infinity]) {
      const frame = getSompoScenarioEffects(id, time);
      assert.deepEqual(frame, getSompoScenarioEffects(id, time));
      assert.ok(frame.cues.every((item) => Number.isFinite(item.intensity) && item.intensity >= 0 && item.intensity <= 1));
    }
  }
  assert.deepEqual(getSompoScenarioEffects('__proto__'), getSompoScenarioEffects('normal'));
});

test('estouro, tombamento e colisão disparam na fase correta e deixam dano/detritos', () => {
  assert.equal(cue('tire-blowout', 2799, 'tire-damage'), undefined);
  assert.equal(cue('tire-blowout', 3000, 'tire-damage').intensity, 1);
  assert.equal(cue('tire-blowout', 20000, 'tire-damage').intensity, 1);
  assert.ok(cue('tire-blowout', 20000, 'rubber-shards'));
  assert.equal(cue('tire-blowout', 6000, 'blowout-dust'), undefined);
  assert.ok(cue('rollover', 8000, 'impact-dust'));
  assert.ok(cue('rollover', 18000, 'debris'));
  const impact = SOMPO_COLLISION_SCRIPT.phases.find((phase) => phase.id === 'impacto').startMs;
  assert.equal(cue('colisao-roteirizada', impact - 1, 'debris'), undefined);
  assert.ok(cue('colisao-roteirizada', impact, 'debris'));
  assert.ok(cue('colisao-roteirizada', impact + 750, 'impact-dust'));
});

test('frenagem deixa marcas; freio falho fuma sem reduzir velocidade; lama encerra spray', () => {
  assert.equal(cue('hard-braking', 2999, 'tire-smoke'), undefined);
  assert.ok(cue('hard-braking', 4000, 'tire-smoke'));
  assert.equal(cue('hard-braking', 12000, 'tire-smoke'), undefined);
  assert.ok(cue('hard-braking', 12000, 'skid-marks'));
  assert.ok(cue('brake-failure', 12000, 'brake-smoke'));
  assert.ok(getSompoRuralFrame('brake-failure', 16000).speedKph > getSompoRuralFrame('brake-failure', 5000).speedKph);
  assert.ok(cue('bogged-down', 8000, 'mud-spray'));
  assert.equal(cue('bogged-down', 13000, 'mud-spray'), undefined);
  assert.ok(cue('bogged-down', 13000, 'mud-ruts'));
});

const effectSource = readFileSync(new URL('../src/components/sompo/createSompoScenarioEffects.ts', import.meta.url), 'utf8').replace("'three'", JSON.stringify(import.meta.resolve('three')));
const effectModule = `data:text/javascript;base64,${Buffer.from(ts.transpileModule(effectSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`;

test('pools visuais são finitos; dano persiste, reinício restaura o pneu e troca tardia de GLB funciona', async () => {
  const saved = globalThis.document;
  const gradient = { addColorStop() {} };
  const context = new Proxy({}, { get: (_, key) => key === 'createRadialGradient' || key === 'createLinearGradient' ? () => gradient : () => {} });
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  try {
    const { createSompoScenarioEffects } = await import(effectModule);
    const root = new THREE.Group();
    const wheels = [];
    for (const x of [3.28, -1.2, -2.12]) for (const z of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.3, 32), new THREE.MeshStandardMaterial());
      wheel.position.set(x, 0.46, z); wheel.rotation.x = Math.PI / 2; wheel.userData.radius = 0.46; root.add(wheel); wheels.push(wheel);
    }
    const model = { root, wheels };
    const scene = new THREE.Scene(); scene.add(root); const camera = new THREE.PerspectiveCamera();
    const effects = createSompoScenarioEffects(scene, model, camera);
    const target = wheels[1]; const intact = new Float32Array(target.geometry.attributes.position.array);
    effects.update(getSompoScenarioEffects('tire-blowout', 3300), 3300, 'tire-blowout', 25, false, 0);
    assert.equal(target.userData.destroyed, true);
    assert.notDeepEqual(target.geometry.attributes.position.array, intact);
    effects.update(getSompoScenarioEffects('tire-blowout', 20000), 20000, 'tire-blowout', 0, false, 0);
    assert.equal(target.userData.destroyed, true);
    effects.update(getSompoScenarioEffects('tire-blowout', 0), 0, 'tire-blowout', 28, false, 0);
    assert.deepEqual(target.geometry.attributes.position.array, intact);
    assert.equal(target.userData.destroyed, false);
    // The shared wheel array is replaced by the async GLB loader after animation has started.
    const replacement = target.clone(); replacement.geometry = target.geometry.clone(); replacement.userData.blowoutTarget = true;
    root.add(replacement); model.wheels.splice(0, model.wheels.length, replacement); root.userData.asset = 'GeneratedRuralTruck';
    effects.update(getSompoScenarioEffects('tire-blowout', 9000), 9000, 'tire-blowout', 0, false, 0);
    assert.equal(replacement.userData.destroyed, true);
    const counts = [];
    for (const id of Object.keys(SOMPO_SCENARIO_EFFECTS)) {
      for (const time of [0, 3100, 7000, 15000, 30000]) {
        effects.update(getSompoScenarioEffects(id, time), time, id, 20, false, id === 'brake-failure' ? -0.2 : 0);
        let instances = 0;
        scene.traverse((node) => {
          if (node.isInstancedMesh) {
            instances += node.count;
            assert.ok([...node.instanceMatrix.array].every(Number.isFinite), `${id}: finite matrices`);
          }
        }); counts.push(instances);
      }
    }
    assert.ok(Math.max(...counts) < 1100, 'Particle/debris budget stays bounded across case switches');
    effects.dispose(); assert.equal(scene.getObjectByName('sompo-scenario-effects'), undefined);
    assert.equal(target.userData.destroyed, false);
  } finally { if (saved === undefined) delete globalThis.document; else globalThis.document = saved; }
});
