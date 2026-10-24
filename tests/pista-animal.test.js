import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFrontendModule } from './support/load-frontend-module.js';

const animal = await loadFrontendModule('../../src/components/pista/animalNaPista.ts');
const { criarCaminhao } = await loadFrontendModule('../../src/components/pista/fisicaCaminhao.ts');
const { PISTA_SERRA } = await loadFrontendModule('../../src/components/pista/pistaSerra.ts');
const caminhao = (x, z, rumo = 0) => ({ ...criarCaminhao(PISTA_SERRA), x, z, rumo, velocidade: 30 });
const vaca = (x = 0, z = 0, rumo = 0) => ({ ativo: true, atingido: false, andando: false, t: 8, lateral: z, x, z, rumo });

test('passagem pela direita: carroceria toca a ponta do animal mesmo fora do antigo raio de 75 cm', () => {
  assert.equal(animal.bateuNoAnimal(vaca(), caminhao(0, 2.3)), true);
  assert.equal(animal.bateuNoAnimal(vaca(), caminhao(0, -2.3)), true);
  assert.equal(animal.bateuNoAnimal(vaca(), caminhao(0, 2.8)), false, 'desvio com folga é seguro');
});

test('a 108 km/h registra o toque rasante entre quadros, com ambos os extremos livres', () => {
  const antes = caminhao(-5.3, 2.3), depois = caminhao(-3.2, 2.8);
  const a = vaca();
  assert.equal(animal.bateuNoAnimal(a, antes), false);
  assert.equal(animal.bateuNoAnimal(a, depois), false);
  const contato = animal.instanteDoContato(a, depois, { animal: a, caminhao: antes });
  assert.ok(contato > 0 && contato < 1, `primeiro contato no intervalo: ${contato}`);
});

test('travessia rápida não atravessa o caminhão; movimento relativo e rumo são considerados', () => {
  const c = caminhao(0, 0);
  const antes = vaca(0, -4), depois = vaca(0, 4);
  assert.equal(animal.bateuNoAnimal(antes, c), false);
  assert.equal(animal.bateuNoAnimal(depois, c), false);
  assert.ok(animal.instanteDoContato(depois, c, { animal: antes, caminhao: c }) < 1);
  assert.equal(animal.bateuNoAnimal(vaca(0, 0, Math.PI / 2), caminhao(-2.3, 0, Math.PI / 2)), true);
  assert.equal(animal.bateuNoAnimal({ ...depois, atingido: true }, c), false);
  assert.equal(animal.bateuNoAnimal({ ...depois, ativo: false }, c), false);
});

test('animação parte do contato, acompanha o caminhão e assenta mais cedo numa batida rápida', async () => {
  const { poseImpactoAnimal } = await loadFrontendModule('../../src/components/sompo/movimentoAnimal.ts');
  const movimento = { yaw: -Math.PI / 2, impacto: { velocidadeMs: 30, avancoX: 12, avancoZ: -2, avancoY: -.4, lado: 1 } };
  assert.deepEqual(poseImpactoAnimal(null, movimento), { queda: 0, rolagem: 0, x: 0, y: 0, z: 0 });
  const inicio = poseImpactoAnimal(0, { ...movimento, impacto: { ...movimento.impacto, avancoX: 0, avancoZ: 0 } });
  assert.equal(inicio.rolagem, 0); assert.equal(inicio.x, 0); assert.equal(inicio.z, 0);
  const forte = poseImpactoAnimal(900, movimento);
  const leve = poseImpactoAnimal(900, { impacto: { ...movimento.impacto, velocidadeMs: 2 } });
  assert.equal(forte.queda, 1); assert.ok(leve.queda < forte.queda);
  assert.equal(forte.x, 12); assert.equal(forte.z, -2, 'segue a direção do contato, não um deslocamento fixo');
  assert.equal(forte.y, -.4, 'acompanha a descida do asfalto');
  const parado = poseImpactoAnimal(5000, movimento);
  assert.ok(Math.abs(parado.rolagem - 1.45) < .001);
});

test('corrida a 80 km/h e 10 FPS: pela borda direita encerra no contato e emite um único fim', async () => {
  const { criarCorridaPista } = await loadFrontendModule('../../src/components/pista/corridaPista.ts');
  const { pontoLateral } = await loadFrontendModule('../../src/components/pista/pistaSerra.ts');
  const corrida = criarCorridaPista(); let r = corrida.ler();
  const comando = { esterco: 0, acelerador: 1, freio: 0 };
  for (let i = 0; i < 6000 && !r.fim; i += 1) {
    const c = r.caminhao, alvo = pontoLateral(PISTA_SERRA, c.s + 6 + c.velocidade * .6, 3.6);
    const erro = Math.atan2(-(alvo.z - c.z), alvo.x - c.x) - c.rumo;
    comando.esterco = Math.max(-1, Math.min(1, -Math.atan2(Math.sin(erro), Math.cos(erro)) * 4));
    r = corrida.quadro(.1, comando, false);
  }
  assert.equal(r.fim, 'colisao');
  assert.ok(r.caminhao.velocidade * 3.6 > 75);
  assert.ok(r.caminhao.lateral > 3.5, 'passa pela direita');
  assert.equal(r.animal.atingido, true);
  assert.equal(r.eventos.filter(e => e.tipo === 'fim').length, 1);
  assert.equal(corrida.quadro(.1, comando, false), r, 'a corrida permanece congelada no contato');
});
