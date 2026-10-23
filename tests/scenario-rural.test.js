import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadFrontendModule } from './support/load-frontend-module.js';
const { PROPS_RURAIS, MODELOS_RURAIS, COLISORES_RURAIS } = await loadFrontendModule('../../src/components/gameplay/propsRurais.ts');
const { criarPropsRurais } = await loadFrontendModule('../../src/components/gameplay/criarPropsRurais.ts');
const { criarMotorGameplay } = await loadFrontendModule('../../src/components/gameplay/motorGameplay.ts');
const { ROTA_CIRCUITO } = await loadFrontendModule('../../src/components/gameplay/circuito.ts');
const { passoTrator } = await loadFrontendModule('../../src/components/gameplay/fisicaTrator.ts');
const { createSompoCropRows } = await loadFrontendModule('../../src/components/sompo/createSompoCropRows.ts');
const ACELERA = { esterco: 0, acelerador: 1, freio: 0 };

test('três modelos reais, SHA e material difuso 1K, orçamento <12MB', async () => {
  const provenance = JSON.parse(await fs.readFile('public/models/scenario/provenance.json'));
  let bytes = 0;
  for (const record of provenance) {
    assert.ok(record.triangles <= 5000);
    for (const file of record.files) {
      const data = await fs.readFile(`public/models/scenario/${file.file}`); bytes += data.length;
      assert.equal(crypto.createHash('sha256').update(data).digest('hex'), file.sha256);
    }
    const data = await fs.readFile(`public/models/scenario/${record.name}.glb`);
    const gltf = await new GLTFLoader().register(() => ({name:'test',loadTexture:async()=>new THREE.Texture()}))
      .parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
    const box = new THREE.Box3().setFromObject(gltf.scene);
    assert.ok(box.getSize(new THREE.Vector3()).length()>0);
    gltf.scene.traverse(n => { if(n.isMesh) { assert.equal(n.material.emissive.getHex(),0); assert.equal(n.material.color.getHex(),0xffffff); }});
    assert.ok(Math.max(...record.textureSize)<=1024);
  }
  assert.equal(provenance.length,3); assert.ok(bytes < 12*1024*1024);
});

test('cache por montagem, posição no chão, clones compartilham geometria e descarte', async () => {
  const calls=[]; const templates=[];
  const scene = new THREE.Group();
  const layer=criarPropsRurais(scene, (x,z)=>x*.01+z*.02, async modelo => {
    calls.push(modelo); const g=new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshStandardMaterial())); templates.push(g); return g;
  });
  assert.equal(layer.root.children.length,4);
  await layer.ready;
  assert.deepEqual(calls.sort(),Object.keys(MODELOS_RURAIS).sort());
  for (const [i,holder] of layer.root.children.entries()) {
    assert.equal(holder.userData.status,'loaded');
    const prop=PROPS_RURAIS[i];
    const box=new THREE.Box3().setFromObject(holder);
    assert.ok(Math.abs(box.min.y-(prop.x*.01+prop.z*.02))<1e-6);
  }
  const a=layer.root.children[0].children[0].children[0], b=layer.root.children[1].children[0].children[0];
  assert.equal(a.geometry,b.geometry);
  layer.dispose(); layer.dispose(); assert.equal(scene.children.length,0);
});

test('erro mantém fallback visível e chegada tardia após unmount é descartada', async () => {
  const layer=criarPropsRurais(new THREE.Group(),()=>0,async()=>{throw new Error('HTTP 404 caso concreto');});
  await layer.ready;
  assert.ok(layer.root.children.every(p=>p.userData.status==='fallback' && p.children.length===1)); layer.dispose();
  let resolve; const pending=new Promise(r=>resolve=r);
  const late=criarPropsRurais(new THREE.Group(),()=>0,()=>pending);
  late.dispose(); const g=new THREE.Group(); const geom=new THREE.BoxGeometry();let disposed=0;geom.addEventListener('dispose',()=>disposed++);
  g.add(new THREE.Mesh(geom,new THREE.MeshStandardMaterial())); resolve(g); await late.ready;
  // The injected loader returns one resource three times; actual loader owns distinct templates.
  assert.equal(disposed,3); assert.equal(late.root.children.length,0);
});

test('props fora do corredor, spawn e chegada; nenhum collider invisível sem fallback', () => {
  function distance(p,a,b) { const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz); }
  for (const [i,p] of PROPS_RURAIS.entries()) {
    const r=COLISORES_RURAIS[i].raioM;
    assert.ok(ROTA_CIRCUITO.slice(1).every((b,i)=>distance(p,ROTA_CIRCUITO[i],b)>r+2.5),p.id);
    assert.ok(Math.hypot(p.x+12,p.z)>r+4);
    assert.ok(Math.hypot(p.x-78,p.z-13)>r+4);
  }
});

test('clareiras locais removem só plantas que atravessariam os props', () => {
  const clearings=COLISORES_RURAIS.map(p=>({x:p.x,z:p.z,radius:p.raioM+1.7}));
  const field=createSompoCropRows(()=>0,false,.32,false,false,undefined,clearings);
  let count=0;const m=new THREE.Matrix4(), scale=new THREE.Vector3();
  for(const mesh of field.root.children) for(let i=0;i<mesh.count;i++) {
    mesh.getMatrixAt(i,m);const x=m.elements[12],z=m.elements[14];
    if(clearings.some(p=>Math.hypot(x-p.x,z-p.z)<p.radius)){scale.setFromMatrixScale(m);assert.equal(scale.length(),0);count++;}
  }
  assert.ok(count>0);field.dispose();
});

test('colisor rural impede aproximação em ré e permite afastar do contato', () => {
  const obstaculos=[{x:0,z:0,raioM:1,tipo:'cenario'}];
  const estado={x:2.08,z:0,rumo:0,velocidade:-2,guinada:0,percurso:0,contato:false};
  const bloqueado=passoTrator(estado,{esterco:0,acelerador:0,freio:1},.05,{obstaculos,tetoKph:12});
  assert.equal(bloqueado.contato,true);assert.equal(bloqueado.x,estado.x);
  const saindo=passoTrator({...estado,velocidade:2},ACELERA,.05,{obstaculos,tetoKph:12});
  assert.ok(saindo.x>estado.x);assert.equal(saindo.contato,false);
});

test('motor real para ao atingir barril, carroça e rocha; rota inicial inalterada', () => {
  for (const p of PROPS_RURAIS) {
    const motor=criarMotorGameplay(); motor.reiniciar({x:p.x-9,z:p.z});
    for(let i=0;i<600&&!motor.ler().contato;i++) motor.quadro(1/60,ACELERA);
    assert.equal(motor.ler().contato,true,p.id); assert.ok(motor.ler().maquina.x < p.x);
  }
  const motor=criarMotorGameplay();motor.reiniciar({x:-12,z:0});
  for(let i=0;i<300;i++) motor.quadro(1/60,ACELERA);
  assert.equal(motor.ler().contato,false);assert.equal(motor.ler().sensor.eco,false);
});
