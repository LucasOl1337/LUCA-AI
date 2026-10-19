import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { criarCabineMax, acharVolante, ENCAIXE_CABINE, NOME_FARDO_PALCO, PROPS_CABINE_URL, CABINE_MAX_URL } =
  await loadFrontendModule('../../src/components/gameplay/visual/cabineMax.ts');
const { anguloAroRad } = await loadFrontendModule('../../src/components/gameplay/volante.ts');

const root = new URL('../public/models/gameplay/', import.meta.url);
const provenance = JSON.parse(readFileSync(new URL('max-tractor-cabine.provenance.json', root), 'utf8'));
const rig = provenance.rig.steeringWheel;

/** Ponto no topo do aro (para a frente e para cima no plano do volante). */
function topoDoAro() {
  const n = new THREE.Vector3(...rig.axis).normalize();
  return new THREE.Vector3(0, 0, 1).cross(n).normalize().negate();
}

/** Palco como o rigSompoAgriAsset entrega a variante: agri-body com o corpo e o volante como superfícies próprias. */
function palcoFalso({ comVolante = true } = {}) {
  const mundo = new THREE.Group();
  const maquina = new THREE.Group(); mundo.add(maquina);
  const corpo = new THREE.Group(); corpo.name = 'agri-body'; maquina.add(corpo);
  const superficie = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 2), new THREE.MeshStandardMaterial()); superficie.name = 'agri-body-surface';
  corpo.add(superficie);
  let volante = null;
  if (comVolante) {
    const centro = new THREE.Vector3(...rig.center);
    const ponto = centro.clone().addScaledVector(topoDoAro(), rig.rimRadius);
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([...ponto.toArray(), ...centro.toArray(), ...centro.clone().addScaledVector(topoDoAro(), -rig.rimRadius).toArray()], 3));
    volante = new THREE.Mesh(g, superficie.material); volante.name = 'agri-body-surface';
    corpo.add(volante);
  }
  const fardo = new THREE.Group(); fardo.name = NOME_FARDO_PALCO;
  const procedural = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 1.25)); fardo.add(procedural);
  fardo.position.set(30, 0, 0); fardo.scale.setScalar(0.9);
  mundo.add(fardo);
  return { mundo, maquina, corpo, superficie, volante, fardo, procedural };
}

/** Props sintéticos do Tripo: base em y=0, +Y cima, frente +Z. */
function prop(nome, [x, y, z]) {
  const g = new THREE.BoxGeometry(x, y, z).translate(0, y / 2, 0);
  const cena = new THREE.Group(); cena.name = nome;
  cena.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial()));
  return cena;
}
const assetsFalsos = () => ({ rig, console: prop('console', [0.98, 0.9, 0.78]), banco: prop('banco', [0.73, 0.98, 0.73]), fardo: prop('fardo', [0.9, 0.88, 0.98]) });

const camera = new THREE.PerspectiveCamera();
const quadro = (angulo = 0) => ({ estado: { q: angulo }, anguloAroRad: angulo, dt: 1 / 60 });
const esperar = () => new Promise((r) => setImmediate(r));

test('cabine usa o volante do modelo carregado, põe console e banco do Tripo, e desmontar devolve tudo', async () => {
  const p = palcoFalso();
  const cabine = criarCabineMax({ carregar: async () => assetsFalsos() });
  cabine.montar(p.maquina, camera);
  await esperar();
  cabine.quadro(quadro());
  assert.equal(p.superficie.parent, p.corpo, 'corpo da variante fica onde o palco pôs (sem máscara)');
  const pivo = p.corpo.getObjectByName('cabine-volante-pivo');
  assert.ok(pivo, 'volante num pivô próprio');
  assert.deepEqual(pivo.position.toArray(), rig.center);
  assert.equal(p.volante.parent, pivo, 'superfície do rig-volante foi para o pivô');
  const consoleProp = p.corpo.getObjectByName('cabine-console');
  const banco = p.corpo.getObjectByName('cabine-banco');
  assert.ok(consoleProp && banco);
  p.maquina.updateMatrixWorld(true);
  const caixaBanco = new THREE.Box3().setFromObject(banco);
  assert.ok(Math.abs(caixaBanco.min.y - 1.38) < 0.01, `banco apoiado no piso da cabine (${caixaBanco.min.y})`);
  assert.ok(caixaBanco.min.x > -1.19 && caixaBanco.max.x < -0.45, `banco entre a parede de trás e o olho (${caixaBanco.min.x}..${caixaBanco.max.x})`);
  const caixaConsole = new THREE.Box3().setFromObject(consoleProp);
  assert.ok(Math.abs(caixaConsole.min.y - 1.38) < 0.01, `coluna do console apoiada no piso (${caixaConsole.min.y})`);
  assert.ok(caixaConsole.max.y > 2.1, 'tela alta o bastante para a vista de frente');
  assert.ok(caixaConsole.max.x < 0.2 && caixaConsole.max.z < 0.72, 'console dentro da cabine (frente x=0,20, lateral |z|=0,72)');
  assert.ok(caixaConsole.min.z > 0.2, 'console à direita do volante, sem cobri-lo');
  cabine.desmontar();
  assert.equal(p.volante.parent, p.corpo);
  assert.deepEqual(p.volante.position.toArray(), [0, 0, 0]);
  for (const nome of ['cabine-volante-pivo', 'cabine-console', 'cabine-banco']) assert.equal(p.corpo.getObjectByName(nome), undefined, nome);
});

test('quadro gira o aro por anguloAroRad no eixo da coluna, + horário visto do banco', async () => {
  const p = palcoFalso();
  const cabine = criarCabineMax({ carregar: async () => assetsFalsos() });
  cabine.montar(p.maquina, camera);
  await esperar();
  const topoNoMundo = (angulo) => {
    cabine.quadro(quadro(angulo));
    p.maquina.updateMatrixWorld(true);
    const v = new THREE.Vector3().fromBufferAttribute(p.volante.geometry.attributes.position, 0);
    return p.volante.localToWorld(v).sub(new THREE.Vector3(...rig.center));
  };
  const parado = topoNoMundo(0);
  assert.ok(parado.distanceTo(topoDoAro().multiplyScalar(rig.rimRadius)) < 1e-6, 'esterço 0: aro no lugar do GLB');
  // Operador olha +X com +Y em cima: a direita dele é +Z. Horário = topo do aro vai para a direita.
  assert.ok(topoNoMundo(Math.PI / 2).z > rig.rimRadius * 0.99);
  assert.ok(topoNoMundo(-Math.PI / 2).z < -rig.rimRadius * 0.99);
  assert.ok(topoNoMundo(anguloAroRad(1)).distanceTo(parado) < 1e-6, 'esterço máximo = uma volta');
  const n = new THREE.Vector3(...rig.axis).normalize();
  for (const a of [0.3, 1.2, -2.5]) {
    const v = topoNoMundo(a);
    assert.ok(Math.abs(v.dot(n)) < 1e-6);
    assert.ok(Math.abs(v.length() - rig.rimRadius) < 1e-6);
  }
  cabine.desmontar();
});

test('fardo do Tripo veste o fardo do palco no tamanho do procedural; desmontar devolve o procedural', async () => {
  const p = palcoFalso();
  const cabine = criarCabineMax({ carregar: async () => assetsFalsos() });
  cabine.montar(p.maquina, camera);
  await esperar();
  cabine.quadro(quadro());
  const roupa = p.fardo.getObjectByName('fardo-feno-tripo');
  assert.ok(roupa);
  assert.equal(p.procedural.visible, false);
  p.fardo.updateMatrixWorld(true);
  const caixa = new THREE.Box3().setFromObject(roupa);
  const tamanho = caixa.getSize(new THREE.Vector3());
  // O grupo do palco tem escala 0,9 (raio do obstáculo / 0,72): o Tripo herda.
  assert.ok(Math.abs(tamanho.x - 1.44 * 0.9) < 1e-6 && Math.abs(tamanho.y - 1.44 * 0.9) < 1e-6 && Math.abs(tamanho.z - 1.25 * 0.9) < 1e-6);
  assert.ok(Math.abs(caixa.min.y) < 1e-6, 'fardo apoiado no chão');
  cabine.quadro(quadro());
  assert.equal(p.fardo.children.filter((c) => c.name === 'fardo-feno-tripo').length, 1, 'veste uma vez só');
  cabine.desmontar();
  assert.equal(p.fardo.getObjectByName('fardo-feno-tripo'), undefined);
  assert.equal(p.procedural.visible, true);
});

test('tela-luca-ai: plano 16:10 sobre o console, redesenha pelo estado e descarta no fim', async () => {
  const p = palcoFalso();
  const desenhos = [];
  let descartada = false;
  const textura = new THREE.Texture();
  const cabine = criarCabineMax({
    carregar: async () => assetsFalsos(),
    criarTela: () => ({ textura, desenhar: (estado) => { desenhos.push(estado); return true; }, descartar: () => { descartada = true; } }),
  });
  cabine.montar(p.maquina, camera);
  await esperar();
  cabine.quadro(quadro(0.5));
  const plano = p.corpo.getObjectByName('tela-luca-ai');
  assert.ok(plano);
  assert.equal(plano.parent.name, 'cabine-console');
  assert.equal(plano.material.map, textura);
  assert.equal(plano.material.toneMapped, false);
  const { width, height } = plano.geometry.parameters;
  assert.ok(Math.abs(width / height - 1.6) < 1e-9);
  assert.deepEqual(desenhos, [{ q: 0.5 }]);
  cabine.desmontar();
  assert.ok(descartada);
});

test('sem a variante (catálogo ou fallback) a cabine não se monta; desmontar antes do asset não vaza', async () => {
  const p = palcoFalso({ comVolante: false });
  const avisos = [];
  const aviso = console.warn; console.warn = (...a) => avisos.push(a.join(' '));
  try {
    const cabine = criarCabineMax({ carregar: async () => assetsFalsos() });
    cabine.montar(p.maquina, camera);
    await esperar();
    cabine.quadro(quadro(1)); cabine.quadro(quadro(1));
    assert.equal(p.corpo.getObjectByName('cabine-console'), undefined);
    assert.equal(p.fardo.getObjectByName('fardo-feno-tripo'), undefined);
    assert.equal(avisos.length, 1, 'avisa uma vez só');
    cabine.desmontar();
  } finally { console.warn = aviso; }
  const tardia = criarCabineMax({ carregar: async () => assetsFalsos() });
  tardia.montar(palcoFalso().maquina, camera);
  tardia.desmontar();
  await esperar();
});

test('volante é achado só pela esfera do aro: corpo inteiro e peças longe não entram', () => {
  const p = palcoFalso();
  const longe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1).translate(1.5, 1, 0)); p.corpo.add(longe);
  assert.deepEqual(acharVolante(p.corpo, rig), [p.volante]);
});

test('encaixe e URLs: props do Tripo com manifesto, provenance e orçamento', () => {
  assert.equal(CABINE_MAX_URL, '/models/gameplay/max-tractor-cabine.glb');
  let tris = 0;
  for (const url of Object.values(PROPS_CABINE_URL)) {
    const nome = url.split('/').pop();
    const bytes = readFileSync(new URL(nome, root));
    assert.ok(bytes.length <= 1.5 * 1024 * 1024, `${nome} ≤ 1,5 MB`);
    const prov = JSON.parse(readFileSync(new URL(nome.replace('.glb', '.provenance.json'), root), 'utf8'));
    assert.match(prov.tripoProject, /^[0-9a-f-]{36}$/);
    const manifesto = JSON.parse(readFileSync(new URL(nome.replace('.glb', '.textures.json'), root), 'utf8'));
    for (const imagem of manifesto.images) readFileSync(new URL(imagem, root));
    tris += prov.triangles;
  }
  assert.ok(tris <= 40000, `+${tris} triângulos dentro do orçamento de 40k`);
  assert.ok(ENCAIXE_CABINE.banco.posicao[1] === 1.38 && ENCAIXE_CABINE.coluna.base === 1.38);
});
