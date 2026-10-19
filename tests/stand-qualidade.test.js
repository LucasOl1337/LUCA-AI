import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

const {
  DEGRAUS, FPS_MINIMO, FPS_FOLGADO, SEGUNDOS_PARA_DESCER, SEGUNDOS_PARA_SUBIR, SEGUNDOS_DE_PROVA, VETO_MS,
  qualidadeInicial, regularQualidade, pixelRatioDoDegrau,
  PERFIL_PADRAO, PERFIL_GAMEPLAY, QUADRO_MAXIMO_GAMEPLAY_MS,
} = await loadFrontendModule('../../src/components/sompo/qualidadeAdaptativa.ts');

/** Aplica uma sequência de FPS, um por segundo, a partir de `desde`. */
const rodar = (estado, leituras, desde = 0) => {
  let e = estado;
  leituras.forEach((fps, i) => { e = regularQualidade(e, fps, desde + i * 1000); });
  return e;
};
const vezes = (fps, n) => Array(n).fill(fps);
/** Descida em prova: 1 s descartado (recompilação) + SEGUNDOS_DE_PROVA medidos. */
const prova = (fps) => vezes(fps, 1 + SEGUNDOS_DE_PROVA);

test('qualidade: FPS baixo por 3 s desce um degrau; um segundo bom zera a contagem', () => {
  const e0 = qualidadeInicial(0);
  assert.equal(rodar(e0, vezes(FPS_MINIMO - 1, SEGUNDOS_PARA_DESCER - 1)).degrau, 0);
  assert.equal(rodar(e0, [20, 20, 50, 20]).degrau, 0);
  assert.equal(rodar(e0, vezes(20, SEGUNDOS_PARA_DESCER)).degrau, 1);
});

test('qualidade: aparelho fraco de GPU desce enquanto cada degrau rende FPS', () => {
  // Cada degrau dobra o FPS até passar do mínimo.
  let e = rodar(qualidadeInicial(0), vezes(12, SEGUNDOS_PARA_DESCER));
  e = rodar(e, prova(25));
  assert.deepEqual([e.degrau, e.travado], [1, false]);
  e = rodar(e, vezes(25, SEGUNDOS_PARA_DESCER));
  e = rodar(e, prova(45));
  assert.deepEqual([e.degrau, e.travado], [2, false]);
  assert.equal(rodar(e, vezes(45, 30)).degrau, 2, 'na faixa boa fica parado');
});

test('qualidade: gargalo de CPU (descer não rende) desfaz a descida e trava', () => {
  let e = rodar(qualidadeInicial(1), vezes(37, SEGUNDOS_PARA_DESCER));
  assert.equal(e.degrau, 2, 'tentou descer');
  e = rodar(e, prova(38));
  assert.deepEqual([e.degrau, e.travado], [1, true], 'voltou e travou');
  assert.equal(rodar(e, vezes(30, 60)).degrau, 1, 'travado não desce mais');
});

test('qualidade: primeiro segundo do degrau novo (recompilação) não entra na prova', () => {
  let e = rodar(qualidadeInicial(0), vezes(20, SEGUNDOS_PARA_DESCER));
  e = rodar(e, [2, ...vezes(30, SEGUNDOS_DE_PROVA)]);
  assert.deepEqual([e.degrau, e.travado], [1, false]);
});

test('qualidade: sobe devagar e não volta a um degrau que falhou há menos de 60 s', () => {
  let e = rodar(qualidadeInicial(1), vezes(20, SEGUNDOS_PARA_DESCER));
  e = rodar(e, prova(50), 3000);
  assert.equal(e.degrau, 2);
  assert.equal(rodar(e, vezes(FPS_FOLGADO, SEGUNDOS_PARA_SUBIR * 2), 7000).degrau, 2, 'degrau 1 vetado');
  assert.equal(rodar(e, vezes(FPS_FOLGADO, SEGUNDOS_PARA_SUBIR), 3000 + VETO_MS).degrau, 1);
});

test('qualidade: último degrau é o piso; leitura inválida é ignorada', () => {
  const piso = qualidadeInicial(DEGRAUS.length - 1);
  assert.equal(rodar(piso, vezes(5, 20)).degrau, DEGRAUS.length - 1);
  assert.deepEqual(DEGRAUS.at(-1), { pixelRatio: 0.6, pos: false, sombras: false });
  assert.equal(regularQualidade(piso, Number.NaN, 0), piso);
});

test('qualidade: pixel ratio nunca passa do aparelho', () => {
  assert.equal(pixelRatioDoDegrau(DEGRAUS[0], 1), 1);
  assert.equal(pixelRatioDoDegrau(DEGRAUS[0], 1.5), 1.5);
  assert.equal(pixelRatioDoDegrau(DEGRAUS[3], 2), 0.75);
  assert.equal(pixelRatioDoDegrau(DEGRAUS[4], 0), 0.6);
});
const rodarPerfil = (estado, leituras, perfil, desde = 0) => {
  let e = estado;
  leituras.forEach((fps, i) => { e = regularQualidade(e, fps, desde + i * 1000, perfil); });
  return e;
};

test('qualidade: perfil padrão (totem clássico e /sompo) segue com os degraus e limiares de antes', () => {
  assert.equal(PERFIL_PADRAO.degraus, DEGRAUS);
  assert.deepEqual([PERFIL_PADRAO.fpsMinimo, PERFIL_PADRAO.fpsFolgado], [FPS_MINIMO, FPS_FOLGADO]);
  assert.deepEqual([FPS_MINIMO, FPS_FOLGADO], [40, 57]);
  // 45 fps não desce no padrão: só abaixo de 40.
  assert.equal(rodar(qualidadeInicial(1), vezes(45, 30)).degrau, 1);
});

test('qualidade gameplay: quadro acima de 20 ms por 3 s desce para o degrau sem pós nem sombra', () => {
  const g = PERFIL_GAMEPLAY;
  assert.equal(QUADRO_MAXIMO_GAMEPLAY_MS, 20);
  assert.equal(g.fpsMinimo, 50);
  assert.deepEqual(g.degraus[1], { pixelRatio: 1, pos: false, sombras: false });
  const e0 = qualidadeInicial(g.degrauInicial, g);
  assert.equal(e0.degrau, 0);
  // 45 fps = 22 ms: no padrão ficaria; no gameplay desce.
  assert.equal(rodarPerfil(e0, vezes(45, SEGUNDOS_PARA_DESCER - 1), g).degrau, 0);
  const desceu = rodarPerfil(e0, vezes(45, SEGUNDOS_PARA_DESCER), g);
  assert.equal(desceu.degrau, 1);
  // Bancada de hoje: 40 → 47 fps tirando pós+sombra (ganho > 15 %): fica no degrau 1.
  const ficou = rodarPerfil(rodarPerfil(e0, vezes(40, SEGUNDOS_PARA_DESCER), g), prova(47), g);
  assert.deepEqual([ficou.degrau, ficou.travado], [1, false]);
});

test('qualidade gameplay: descida que alcança 20 ms fica mesmo com ganho pequeno', () => {
  const g = PERFIL_GAMEPLAY;
  let e = rodarPerfil(qualidadeInicial(0, g), vezes(48, SEGUNDOS_PARA_DESCER), g);
  e = rodarPerfil(e, prova(51), g);
  assert.deepEqual([e.degrau, e.travado], [1, false]);
  // Sem alcançar e sem ganho: desfaz e trava, como no padrão.
  let f = rodarPerfil(qualidadeInicial(0, g), vezes(48, SEGUNDOS_PARA_DESCER), g);
  f = rodarPerfil(f, prova(49), g);
  assert.deepEqual([f.degrau, f.travado], [0, true]);
});

test('qualidade gameplay: com folga (≥ 57 fps por 10 s) volta ao degrau com pós e sombra, depois do veto', () => {
  const g = PERFIL_GAMEPLAY;
  let e = rodarPerfil(qualidadeInicial(0, g), vezes(40, SEGUNDOS_PARA_DESCER), g);
  e = rodarPerfil(e, prova(47), g, 3000);
  assert.equal(e.degrau, 1);
  assert.equal(rodarPerfil(e, vezes(60, SEGUNDOS_PARA_SUBIR * 2), g, 7000).degrau, 1, 'degrau 0 vetado');
  assert.equal(rodarPerfil(e, vezes(60, SEGUNDOS_PARA_SUBIR), g, 3000 + VETO_MS).degrau, 0);
  // Piso do gameplay: pixel ratio 0,5 sem pós nem sombra.
  assert.deepEqual(g.degraus.at(-1), { pixelRatio: 0.5, pos: false, sombras: false });
});
