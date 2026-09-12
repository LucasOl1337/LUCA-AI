import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { SOMPO_AGRI_SCENARIOS, getSompoAgriFrame, getSompoAgriKeyframes } from '../shared/sompo-agri-scenarios.js';
import { SOMPO_SIMULATION_SCENARIOS, getSompoScenarioOutcomes, getSompoScenarioScript, getSompoRuralFrame } from '../shared/sompo-telemetry-simulator.js';
import { integrateSompoMotion, createSompoMotionPath, sompoSteeringAngle } from '../shared/sompo-motion.js';

const cases = [
 ...Object.values(SOMPO_AGRI_SCENARIOS).flatMap(s => Object.keys(s.outcomes).map(o => ({id:s.scenarioId,outcome:o,frames:getSompoAgriKeyframes(s.scenarioId,o),sample:t=>getSompoAgriFrame(s.scenarioId,t,o)}))),
 ...Object.keys(SOMPO_SIMULATION_SCENARIOS).flatMap(id => getSompoScenarioOutcomes(id).flatMap(o => {
  const script = getSompoScenarioScript(id,o.id);return script?[{id,outcome:o.id,frames:script.keyframes,sample:t=>getSompoRuralFrame(id,t,o.id)}]:[];
 })),
];
test('all authored gears remain discrete and signed wheel distance matches every interpolated speed', () => {
 for(const c of cases) for(let t=50;t<c.frames.at(-1).atMs;t+=73) {
  const f=c.sample(t);assert.ok([-1,1].includes(f.direction),`${c.id}/${c.outcome} fractional gear at ${t}`);
  // Numerical derivative of the phase actually consumed by the renderers.
  if(c.frames.some(k=>Math.abs(k.atMs-t)<1))continue;
  const speed=(integrateSompoMotion(c.frames,t+.1)-integrateSompoMotion(c.frames,t-.1))/.0002;
  assert.ok(Math.abs(speed-f.wheelSpeedKph*f.direction)<.0001,`${c.id}/${c.outcome} wheel speed mismatch at ${t}: ${speed} / ${f.wheelSpeedKph*f.direction}`);
 }
});
test('bogging spins stationary wheels, brakes before reverse, and stops completely at the end',()=>{
 const frames=getSompoAgriKeyframes('agri-field-bogging','assisted-recovery');
 const spin=t=>integrateSompoMotion(frames,t)/3.6;
 assert.equal(getSompoAgriFrame('agri-field-bogging',9500,'assisted-recovery').direction,1);
 assert.ok(spin(9500)>spin(9000));assert.ok(spin(12000)<spin(11000));assert.equal(spin(20000),spin(16000));
 const rural=getSompoScenarioScript('bogged-down','afunda-mais');assert.equal(getSompoRuralFrame('bogged-down',8000,'afunda-mais').speedKph,0);assert.ok(integrateSompoMotion(rural.keyframes,8100)>integrateSompoMotion(rural.keyframes,8000));
});
test('agricultural paths follow the heading in forward and reverse; replay does not accumulate drift',()=>{
 for(const c of cases.filter(x=>x.id.startsWith('agri-'))) {
  const path=createSompoMotionPath(c.sample,c.frames.at(-1).atMs);
  for(let t=500;t<c.frames.at(-1).atMs-500;t+=521) {
   const f=c.sample(t);if(f.speedKph<.1)continue;
   const a=path.sample(t-1,{x:0,z:0}),b=path.sample(t+1,{x:0,z:0});
   const vx=(b.x-a.x)/.002,vz=(b.z-a.z)/.002,yaw=f.yaw*Math.PI/180;
   assert.ok(Math.abs(vx-f.speedKph/3.6*f.direction*Math.cos(yaw))<.00002,`${c.id} longitudinal`);
   assert.ok(Math.abs(vz+f.speedKph/3.6*f.direction*Math.sin(yaw))<.00002,`${c.id} lateral`);
  }
  assert.deepEqual(path.sample(5000,{x:0,z:0}),path.sample(5000,{x:0,z:0}));
 }
});
test('steering responds to turn rate, reverse and rear steering, rather than a fixed vehicle heading',()=>{
 assert.equal(sompoSteeringAngle(10,1,0,2),0);
 assert.ok(sompoSteeringAngle(10,1,10,2)>0);
 const angle=sompoSteeringAngle(10,1,10,2),forwardSpeed=10/3.6,lateralSpeed=-10*Math.PI/180*2;
 assert.ok(Math.abs(forwardSpeed*Math.sin(angle)+lateralSpeed*Math.cos(angle))<1e-10,'front contact velocity follows the steered wheel plane');
 assert.equal(sompoSteeringAngle(10,-1,10,2),-sompoSteeringAngle(10,1,10,2));
 assert.equal(sompoSteeringAngle(10,1,10,2,true),-sompoSteeringAngle(10,1,10,2));
});
test('actual modular truck wheel poses are identical at 30/60/120 Hz, pause and direct seek',async()=>{
 const result=await build({stdin:{contents:"export {createSompoTruckModel} from './src/components/sompo/createSompoTruckModel'; export {refineSompoTruck} from './src/components/sompo/refineSompoTruck'; export {SOMPO_STUDIO_DEFAULT} from './src/components/sompo/sompoStudioConfig';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
 const {createSompoTruckModel,refineSompoTruck,SOMPO_STUDIO_DEFAULT}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
 const original=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>null})};
 try {
  const model=createSompoTruckModel({sensorLabel:'TEST'}),rig=refineSompoTruck(model),frames=getSompoScenarioScript('bogged-down','afunda-mais').keyframes;
  const update=t=>{const f=getSompoRuralFrame('bogged-down',t,'afunda-mais');rig.update(SOMPO_STUDIO_DEFAULT,t,integrateSompoMotion(frames,t)/3.6,0,f.roughness,0,false,f.speedKph);};
  const poses=()=>model.wheels.map(w=>w.quaternion.toArray());
  update(8500);const expected=poses();
  for(const hz of [30,60,120]) {for(let t=0;t<8500;t+=1000/hz)update(t);update(8500);assert.deepEqual(poses(),expected);}
  update(8500);assert.deepEqual(poses(),expected);update(8300);assert.notDeepEqual(poses(),expected);update(8500);assert.deepEqual(poses(),expected);
 } finally {if(original===undefined)delete globalThis.document;else globalThis.document=original;}
});
