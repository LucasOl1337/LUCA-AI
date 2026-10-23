import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import * as THREE from 'three';

const result = await build({entryPoints:[new URL('../src/components/sompo/createSompoPastureSurface.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'three-singleton',setup(b){b.onResolve({filter:/^three$/},a=>({path:import.meta.resolve(a.path),external:true}));}}]});
const {createSompoPastureSurface}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
function compile(field,farmland){
 const material=new THREE.MeshStandardMaterial();
 const surface=createSompoPastureSurface(material,field,farmland);
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
 material.onBeforeCompile(shader,{});
 return {shader,surface,material};
}

test('agricultural soil ties optical normals/AO and both color masks to the same metric edge',()=>{
 const {shader,surface,material}=compile(true,true);
 assert.match(shader.fragmentShader,/float fieldDistance = abs\(ruralWorld.z\) \+ edgeOffset/);
 assert.match(shader.fragmentShader,/float pasture = smoothstep\(10.5, 18.5, fieldDistance\)/);
 assert.match(shader.fragmentShader,/float fieldZone = 1.0 - smoothstep\(10.5, 18.5, fieldDistance\)/);
 assert.match(shader.fragmentShader,/mapN.xy \*= normalScale \* mix\(1.0, .7, groundBlend\)/);
 assert.match(shader.fragmentShader,/aoMapIntensity \* mix\(1.0, .65/);
 assert.ok(shader.fragmentShader.includes("float groundBlend = pasture * (1.0 - smoothstep(18.5, 28.0, fieldDistance))"));
 assert.ok(shader.fragmentShader.includes("aoMapIntensity * mix(1.0, .65, pasture * (1.0 - smoothstep(18.5, 28.0, fieldDistance)))"));
 assert.match(shader.fragmentShader,/rows = mix\(.5, rows, 1.0 - smoothstep\(45.0, 120.0, camDist\)\)/);
 assert.match(shader.fragmentShader,/vec3 soy = mix\(vec3\(.13, .21, .06\), vec3\(.22, .31, .09\), rows\)/);
 assert.match(shader.fragmentShader,/plot = mix\(plot, trackSoil, track\)/);
 assert.equal(shader.vertexShader,THREE.ShaderLib.standard.vertexShader,'surface never displaces ground vertices');
 assert.match(material.customProgramCacheKey(),/v14-local-edge-true-true/);
 surface.dispose();material.dispose();
});

test('highway path keeps legacy normal/AO and does not receive field plot/soil changes',()=>{
 const {shader,surface,material}=compile(false,false);
 assert.ok(shader.fragmentShader.includes('#include <normal_fragment_maps>'));
 assert.ok(shader.fragmentShader.includes('#include <aomap_fragment>'));
 for(const token of ['groundBlend','grassCross','rowFootprint','trackSoil','furrowsShift'])assert.ok(!shader.fragmentShader.includes(token),token);
 assert.equal(shader.vertexShader,THREE.ShaderLib.standard.vertexShader);
 surface.dispose();material.dispose();
});

test('operation excludes neighboring patchwork, owns textures and preserves clock/disposal',()=>{
 const {shader,surface,material}=compile(true,false);
 assert.ok(shader.fragmentShader.includes('vec3 furrows = texture2D(tilledMap, soilUv).rgb'));
 assert.equal((shader.fragmentShader.match(/texture2D\(tilledMap/g)??[]).length,1);
 assert.equal((shader.fragmentShader.match(/texture2D\(pastureMap/g)??[]).length,1);
 assert.ok(!shader.fragmentShader.includes('plotUv'));
 surface.update(12);assert.equal(shader.uniforms.cloudDrift.value,19.200000000000003);
 const textures=new Set(Object.values(shader.uniforms).map(u=>u.value).filter(t=>t?.isTexture));
 const disposed=new Set();for(const t of textures)t.addEventListener('dispose',()=>disposed.add(t));
 surface.dispose();assert.deepEqual(disposed,textures);material.dispose();
});
