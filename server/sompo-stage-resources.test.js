import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  full.update(0,new THREE.Vector3(),false);compact.update(0,new THREE.Vector3(),false);
  full.root.children.forEach((mesh,index)=>{
    assert.deepEqual(mesh.instanceMatrix.array,repeat.root.children[index].instanceMatrix.array);
    if(mesh.visible) total+=mesh.count*mesh.geometry.index.count/3;
    for(let i=0;i<mesh.count;i++) {mesh.getMatrixAt(i,pose);p.setFromMatrixPosition(pose);assert.ok(Math.abs(p.y-height(p.x,p.z))<1e-5);assert.ok(Math.abs(p.z)<12.2,'crop strip stays inside the field');}
  });
  compact.root.children.forEach(mesh=>{if(mesh.visible) reduced+=mesh.count*mesh.geometry.index.count/3;});
  // O teto agora mede o pior LOD visível: malha curva perto + impostor longe.
  assert.ok(total<=2300000);assert.ok(reduced<total*.65);
  const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <normal_fragment_begin>\n#include <normal_fragment_maps>\n#include <color_fragment>\n#include <lights_fragment_begin>'};full.root.children[0].material.onBeforeCompile(shader);
  assert.equal(full.root.children[0].material.alphaTest,0,'a silhueta vem da malha, sem costura de alpha-test');
  assert.ok(full.root.children[0].geometry.getAttribute('cropLayer'),'idade da folha alimenta a variação de cor');
  const leafPosition=full.root.children[0].geometry.getAttribute('position');let leafLength=0,leafWidth=0;
  let previousCenter=new THREE.Vector3().fromBufferAttribute(leafPosition,1);
  for(let segment=0;segment<=8;segment++) {
    const left=new THREE.Vector3().fromBufferAttribute(leafPosition,segment*3);
    const center=new THREE.Vector3().fromBufferAttribute(leafPosition,segment*3+1);
    const right=new THREE.Vector3().fromBufferAttribute(leafPosition,segment*3+2);
    if(segment) leafLength+=center.distanceTo(previousCenter);previousCenter=center;leafWidth=Math.max(leafWidth,left.distanceTo(right));
  }
  assert.ok(leafLength/leafWidth>=8&&leafLength/leafWidth<=12,'folha em fita fica entre 8 e 12 vezes mais longa que larga');
  assert.match(shader.vertexShader,/floor\(variantHash\*4\.0\)/,'quatro perfis paramétricos por pé');
  assert.match(shader.fragmentShader,/lowerDry/,'folhas inferiores amarelam');
  assert.match(shader.fragmentShader,/burnedTip/,'uma variante recebe ponta queimada');
  assert.match(shader.fragmentShader,/cropFaceDirection=gl_FrontFacing\?1\.0:-1\.0/,'a normal das duas faces vira explicitamente para o lado visivel');
  assert.match(shader.fragmentShader,/directionalLights\[i\]\.color\*cropBackLight/,'a translucidez segue a luz direcional real da cena');
  assert.match(shader.fragmentShader,/reflectedLight\.directDiffuse\+=cropTransmittedIrradiance/,'o contraluz percorre o BRDF difuso');
  assert.doesNotMatch(shader.fragmentShader,/outgoingLight=max|leafLightFloor/,'folhas nao criam piso emissivo independente da luz');
  const materialBuilder=readFileSync(new URL('../scripts/sompo/build-lavoura-materials.py',import.meta.url),'utf8');
  assert.match(materialBuilder,/MedianFilter\(5\)/,'o albedo remove pontos escuros isolados sem borrar a folha inteira');
  assert.match(materialBuilder,/lossless=True/,'a compressao nao recria blocos escuros na superficie limpa');
  full.root.children[0].getMatrixAt(0,pose);const first=p.setFromMatrixPosition(pose).clone();
  full.root.children[0].getMatrixAt(1,pose);const next=p.setFromMatrixPosition(pose).clone();
  full.root.children[0].getMatrixAt(27,pose);const nextPlant=p.setFromMatrixPosition(pose).clone();
  assert.ok(Math.abs(next.x-first.x)>.5&&Math.abs(next.x-first.x)<.65,'fileiras ficam perto de 60 cm');
  assert.ok(Math.abs(nextPlant.z-first.z)>.11&&Math.abs(nextPlant.z-first.z)<.29,'pés ficam perto de 20 cm na linha');
  const tractorCrop=createSompoCropRows(()=>0,false,.32);const tractorPose=new THREE.Matrix4();let tractorTop=0;
  const plantTop=Math.max(...Array.from(tractorCrop.root.children[0].geometry.getAttribute('position').array).filter((_,index)=>index%3===1));
  for(let index=0;index<tractorCrop.root.children[0].count;index++){tractorCrop.root.children[0].getMatrixAt(index,tractorPose);tractorTop=Math.max(tractorTop,plantTop*new THREE.Vector3().setFromMatrixScale(tractorPose).y);}
  assert.ok(tractorTop>=.6&&tractorTop<=1,'milho jovem permanece no estágio V6–V8 de 0,6–1,0 m');
  tractorCrop.dispose();
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
