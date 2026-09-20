import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

async function compiled(file) {
  const result = await build({entryPoints:[new URL(file, import.meta.url).pathname], bundle:true, write:false, platform:'node', format:'esm',
    plugins:[{name:'shared-three',setup(b){b.onResolve({filter:/^three(?:\/.*)?$/},args=>({path:import.meta.resolve(args.path),external:true}));}}]});
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
}
const assets=['ph-jacaranda-near','ph-jacaranda-far','ph-grass_bermuda_01-0','ph-shrub_02-0'];
const root=new URL('../public/models/sompo/',import.meta.url);
for(const name of assets)test(`${name}: bounded UV mesh and content-addressed external textures`,()=>{
  const bytes=readFileSync(new URL(`${name}.glb`,root));
  assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(8),bytes.length);
  const length=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+length));
  const manifest=JSON.parse(readFileSync(new URL(`${name}.textures.json`,root)));
  assert.deepEqual(doc.images.map(x=>x.uri),manifest.images);
  let triangles=0;
  for(const p of doc.meshes.flatMap(m=>m.primitives)){
    triangles+=doc.accessors[p.indices].count/3;
    assert.notEqual(p.attributes.TEXCOORD_0,undefined);
    assert.equal(p.attributes.COLOR_0,undefined,'no unintended double tint');
  }
  assert.ok(triangles>0 && triangles<(name.includes('near')?210000:name.includes('far')?115000:10000),`${triangles} triangles`);
  assert.ok(bytes.length<14000000,'images are not duplicated inside geometry payload');
  for(const filename of [...manifest.images,...Object.values(manifest.alphaMaps??{})]){
    assert.match(filename,/^ph-[a-f0-9]{16}\.(png|jpg)$/);
    const image=readFileSync(new URL(filename,root));
    assert.equal(filename.slice(3,19),createHash('sha256').update(image).digest('hex').slice(0,16));
  }
  if(name.includes('jacaranda'))assert.deepEqual(manifest.alphaMaps,{},'RGBA leaf coverage must not be multiplied twice');
  for(const view of doc.bufferViews)assert.ok((view.byteOffset??0)+view.byteLength<=doc.buffers[0].byteLength);
});

test('foliage distribution stays outside the paved highway and is deterministic',async()=>{
  const {highwayFoliageSlots}=await compiled('../src/components/sompo/createSompoLicensedFoliage.ts');
  for(const kind of ['trees','grass','shrubs','pasture']){
    const slots=highwayFoliageSlots(kind);assert.deepEqual(slots,highwayFoliageSlots(kind));
    assert.ok(slots.length<=32000);
    for(const slot of slots){assert.ok(slot.z>3.5||slot.z< -7.5);assert.ok(Number.isFinite(slot.x+slot.z+slot.scale+slot.yaw));}
  }
});

test('licensed material loader preserves single alpha coverage under the production CSP',async()=>{
  const {restoreSompoTextures,useSompoExternalTextures}=await compiled('../src/components/sompo/restoreSompoTextures.ts');
  const saved={document:globalThis.document,self:globalThis.self,fetch:globalThis.fetch};
  globalThis.self=globalThis;
  const requests=[];
  globalThis.document={createElementNS(_namespace,tag){
    assert.equal(tag,'img');const events=new Map();
    return {complete:true,naturalWidth:1024,naturalHeight:1024,
      addEventListener(type,fn){events.set(type,fn);},removeEventListener(type){events.delete(type);},
      set src(url){assert.match(url,/^\/models\/sompo\/ph-[a-f0-9]{16}\.(png|jpg)$/);requests.push(url);assert.ok(readFileSync(new URL('../public'+url,import.meta.url)).length>100);queueMicrotask(()=>events.get('load')?.call(this));}};
  }};
  globalThis.fetch=async url=>{
    assert.match(url,/^\/models\/sompo\/ph-[\w-]+\.textures\.json$/);
    return new Response(readFileSync(new URL('../public'+url,import.meta.url)));
  };
  try{
    for(const name of assets){
      const b=readFileSync(new URL(name+'.glb',root));
      const gltf=await useSompoExternalTextures(new GLTFLoader()).parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'/models/sompo/');
      await restoreSompoTextures(gltf,'/models/sompo/'+name+'.glb',new AbortController().signal);
      gltf.scene.traverse(node=>{if(node.isMesh){
        const mat=node.material;assert.ok(mat.map?.image.complete);assert.equal(mat.map.flipY,false);
        if(name.includes('jacaranda'))assert.equal(mat.alphaMap,null);
        if(name.includes('bermuda'))assert.ok(mat.alphaMap?.image.complete);
        const textures=new Set(Object.values(mat).filter(x=>x?.isTexture));for(const t of textures)t.dispose();mat.dispose();node.geometry.dispose();
      }});
    }
    assert.ok(requests.length>8);
  }finally{Object.assign(globalThis,saved);}
});

test('wheel openings are real, face is dished, and tyre radius preserves the axle envelope',async()=>{
  const {sompoRimGeometry,sompoTireGeometry}=await compiled('../src/components/sompo/sompoWheelGeometry.ts');
  const rim=sompoRimGeometry(),tyre=sompoTireGeometry(.4);
  tyre.computeBoundingBox();assert.ok(Math.abs(tyre.boundingBox.max.x-.58)<.001);
  rim.computeBoundingBox();assert.ok(rim.boundingBox.min.y<-.025,'recessed dish, not a flat disc');
  const mesh=new THREE.Mesh(rim,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.updateMatrixWorld();
  const hole=new THREE.Raycaster(new THREE.Vector3(0,1,.274),new THREE.Vector3(0,-1,0));
  assert.equal(hole.intersectObject(mesh).length,0,'vent aperture is empty');
  const metal=new THREE.Raycaster(new THREE.Vector3(0,1,.19),new THREE.Vector3(0,-1,0));
  assert.ok(metal.intersectObject(mesh).length>0);
  rim.dispose();tyre.dispose();mesh.material.dispose();
});
