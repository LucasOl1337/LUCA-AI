import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import * as THREE from 'three';

const compiled=await build({entryPoints:[new URL('../src/components/sompo/createSompoLicensedFoliage.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'three',setup(b){b.onResolve({filter:/^three(?:\/.*)?$/},args=>({path:import.meta.resolve(args.path),external:true}));}}]});
const {createSompoLicensedFoliage,highwayFoliageSlots}=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);

test('tree instance buffers are disposed once even when loading is aborted and teardown repeats',async()=>{
 const originalLoad=THREE.TextureLoader.prototype.load,originalFetch=globalThis.fetch;
 const textures=[],signals=[];
 THREE.TextureLoader.prototype.load=function(){const t=new THREE.Texture();t.image={width:640,height:640};textures.push(t);return t;};
 globalThis.fetch=(_url,{signal})=>{signals.push(signal);return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));};
 try{
  const parent=new THREE.Group(),camera=new THREE.PerspectiveCamera(60,1,.1,500);camera.position.set(0,10,20);camera.lookAt(0,0,-60);camera.updateMatrixWorld();
  const foliage=createSompoLicensedFoliage(parent,camera),root=parent.getObjectByName('licensed-highway-foliage');
  const trees=root.children.filter(m=>m.name.startsWith('highway-tree-billboard-'));
  assert.equal(trees.length,3);
  assert.equal(trees.reduce((sum,m)=>sum+m.instanceMatrix.count,0),highwayFoliageSlots('trees').length);
  assert.equal(trees[0].geometry.index.count/3,6);
  assert.equal(new Set(trees.map(m=>m.geometry)).size,1);
  let releases=0,geometryReleases=0,textureReleases=0,materialReleases=0;
  for(const mesh of trees){mesh.addEventListener('dispose',()=>releases++);mesh.material.addEventListener('dispose',()=>materialReleases++);}
  trees[0].geometry.addEventListener('dispose',()=>geometryReleases++);
  textures.forEach(t=>t.addEventListener('dispose',()=>textureReleases++));
  foliage.update(false);
  const versions=trees.map(m=>m.instanceMatrix.version);
  foliage.dispose();foliage.dispose();foliage.update(false);await foliage.ready;
  assert.equal(parent.children.length,0);assert.ok(signals.every(s=>s.aborted));
  assert.equal(releases,3);assert.equal(geometryReleases,1);assert.equal(textureReleases,3);assert.equal(materialReleases,3);
  assert.deepEqual(trees.map(m=>m.instanceMatrix.version),versions,'disposed instance buffers must not be dirtied again');
 }finally{THREE.TextureLoader.prototype.load=originalLoad;globalThis.fetch=originalFetch;}
});
