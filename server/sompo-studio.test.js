import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
async function moduleAt(path){const output=await build({entryPoints:[new URL(path,import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node'});return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString('base64')}`);}
test('studio presets accept portable values and reject unversioned input',async()=>{
  const {parseSompoStudioConfig,SOMPO_STUDIO_DEFAULT}=await moduleAt('../src/components/sompo/sompoStudioConfig.ts');
  assert.throws(()=>parseSompoStudioConfig({paint:'#ffffff'}),/versão 1/);
  const preset=parseSompoStudioConfig({version:1,paint:'#cc4411',roughness:99,exposure:-1,wind:NaN,exploded:Infinity,assetUrl:'https://example.com/a.glb',script:'x',wireframe:'true'});
  assert.equal(preset.paint,'#cc4411');assert.equal(preset.roughness,1);assert.equal(preset.exposure,.65);assert.equal(preset.wind,SOMPO_STUDIO_DEFAULT.wind);assert.equal(preset.exploded,0);assert.equal(preset.wireframe,false);assert.equal('script' in preset,false);assert.equal('assetUrl' in preset,false);
});
test('playback keeps pause, speed, seek and scenario restart on one logical clock',async()=>{
 const {createSompoPlayback}=await moduleAt('../src/components/sompo/sompoPlayback.ts');const clock=createSompoPlayback();
 assert.equal(clock.read(1500,1000),500);clock.setPlaying(false,1500,1000);assert.equal(clock.read(6000,1000),500);
 clock.seek(2000,6000,1000);assert.equal(clock.read(9000,1000),2000);clock.setRate(2,9000,1000);clock.setPlaying(true,9000,1000);assert.equal(clock.read(9500,1000),3000);
 assert.equal(clock.read(11000,10000),2000);clock.setRate(.5,11000,10000);assert.equal(clock.read(12000,10000),2500);
});
