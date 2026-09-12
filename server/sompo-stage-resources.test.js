import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import * as THREE from 'three';

async function importScene(path) {
  const result = await build({ entryPoints: [new URL(path, import.meta.url).pathname], bundle:true, write:false, format:'esm', platform:'node', plugins:[{ name:'three-singleton',setup(builder) {builder.onResolve({filter:/^three(?:\/.*)?$/},args=>({path:import.meta.resolve(args.path),external:true}));} }] });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
}

test('crop layout stays deterministic, grounded and within both geometry budgets', async () => {
  const { createSompoCropRows }=await importScene('../src/components/sompo/createSompoCropRows.ts');
  const height=(x,z)=>Math.sin(x)*.2+z*.025;
  const full=createSompoCropRows(height,false),repeat=createSompoCropRows(height,false),compact=createSompoCropRows(height,true);
  let total=0, reduced=0;
  const pose=new THREE.Matrix4(),p=new THREE.Vector3();
  full.root.children.forEach((mesh,index)=>{
    assert.deepEqual(mesh.instanceMatrix.array,repeat.root.children[index].instanceMatrix.array);
    total+=mesh.count*mesh.geometry.index.count/3;
    for(let i=0;i<mesh.count;i++) {mesh.getMatrixAt(i,pose);p.setFromMatrixPosition(pose);assert.ok(Math.abs(p.y-height(p.x,p.z))<1e-5);assert.ok(Math.abs(p.z)<12.2,'crop strip stays inside the field');}
  });
  compact.root.children.forEach(mesh=>reduced+=mesh.count*mesh.geometry.index.count/3);
  assert.ok(total<=120000);assert.ok(reduced<total*.65);
  const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <color_fragment>'};full.root.children[0].material.onBeforeCompile(shader);
  full.update(3000,new THREE.Vector3(),false,.4,new THREE.Vector3(6,0,1),1);
  assert.ok(Math.abs(shader.uniforms.cropCut.value.x - 10.28) < 1e-8, 'cut begins at the measured cutter bar, ahead of the wheels');
  assert.deepEqual(shader.uniforms.cropCut.value.toArray().slice(1),[1,1]);
  assert.equal(shader.uniforms.cropWind.value,.4);
  const before=full.root.children[0].instanceMatrix.array.slice();
  full.update(9000,new THREE.Vector3(),false);assert.equal(shader.uniforms.cropTime.value,9);
  full.update(1000,new THREE.Vector3(),false);assert.equal(shader.uniforms.cropTime.value,1);
  full.update(9000,new THREE.Vector3(),true);assert.equal(shader.uniforms.cropTime.value,0);
  assert.deepEqual(full.root.children[0].instanceMatrix.array,before,'wind never uploads new instance transforms');
});

test('stage disposal deduplicates shared resources and releases instance and shadow targets',async()=>{
  const { disposeSompoObject }=await importScene('../src/components/sompo/sompoStage.ts');
  const root=new THREE.Group(),geo=new THREE.BoxGeometry(),tex=new THREE.Texture(),mat=new THREE.MeshStandardMaterial({map:tex});
  const a=new THREE.InstancedMesh(geo,mat,2),b=new THREE.Mesh(geo,mat),sun=new THREE.DirectionalLight();root.add(a,b,sun);
  const counts={geometry:0,texture:0,material:0,instance:0,shadow:0};
  geo.addEventListener('dispose',()=>counts.geometry++);mat.addEventListener('dispose',()=>counts.material++);tex.addEventListener('dispose',()=>counts.texture++);a.addEventListener('dispose',()=>counts.instance++);
  sun.shadow.map=new THREE.WebGLRenderTarget(4,4);sun.shadow.map.addEventListener('dispose',()=>counts.shadow++);
  disposeSompoObject(root);assert.deepEqual(counts,{geometry:1,texture:1,material:1,instance:1,shadow:1});
});

test('mud conforms to relocated terrain and dust follows the machine, including reset',async()=>{
  const previous=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>null})};
  try {
    const {createSompoAgriScene}=await importScene('../src/components/sompo/createSompoAgriScene.ts');
    const {getSompoAgriFrame}=await import('../shared/sompo-agri-scenarios.js');
    const field=createSompoAgriScene(new THREE.Group(),'muddy-field');field.placeMud(31);
    const mud=field.root.getObjectByName('sompo-agri-mud'),positions=mud.geometry.attributes.position;
    for(let i=0;i<positions.count;i++) assert.ok(Math.abs(positions.getY(i)-field.groundHeight(31+positions.getX(i),positions.getZ(i))-.025)<1e-6);
    const pos=new THREE.Vector3(25,.4,2);
    field.update(getSompoAgriFrame('agri-harvest-dust',9000,'clean-pass'),pos,pos);
    const dust=field.root.getObjectByName('sompo-agri-dust');assert.deepEqual(dust.position.toArray(),pos.toArray());assert.ok(dust.visible);
    field.update(getSompoAgriFrame('agri-harvest-dust',0,'clean-pass'),new THREE.Vector3(),pos);
    assert.deepEqual(dust.position.toArray(),[0,0,0]);field.dispose();
  } finally {globalThis.document=previous;}
});
