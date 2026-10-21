import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

// Soak do item 5 (21/10): ao voltar do bfcache o quadro da webcam dizia "rodando"
// sem track nem worker, e o alerta de sono não voltava mais (só com F5).
const { ligarCicloDaCamera } = await loadFrontendModule('../../src/components/gameplay/cicloCamera.ts');

class Pagina extends EventTarget {}
const transicao = (tipo, persisted) => Object.assign(new Event(tipo), { persisted });

// Câmera falsa com o mesmo contrato do WebcamSonoCabine: pausar marca 'pausada'; retomar abre de novo.
function cenario() {
  const janela = new Pagina();
  const documento = Object.assign(new Pagina(), { hidden: false });
  const camera = { estado: 'rodando', aberturas: 0, paradas: 0 };
  const soltar = ligarCicloDaCamera(janela, documento, {
    ligada: () => camera.estado === 'rodando' || camera.estado === 'abrindo',
    pausada: () => camera.estado === 'pausada',
    pausar: () => { camera.estado = 'pausada'; camera.paradas++; },
    retomar: () => { camera.estado = 'rodando'; camera.aberturas++; },
  });
  return { janela, documento, camera, soltar };
}

test('pagehide para o bfcache solta a câmera e o pageshow persisted reabre uma vez', () => {
  const { janela, camera } = cenario();
  janela.dispatchEvent(transicao('pagehide', true));
  assert.equal(camera.estado, 'pausada');
  assert.equal(camera.paradas, 1);
  janela.dispatchEvent(transicao('pageshow', true));
  assert.equal(camera.estado, 'rodando');
  assert.equal(camera.aberturas, 1);
  janela.dispatchEvent(transicao('pageshow', true));
  assert.equal(camera.aberturas, 1, 'segundo pageshow sem pausa no meio não reabre');
});

test('pagehide de descarte (F5, fechar) também solta a câmera', () => {
  const { janela, camera } = cenario();
  janela.dispatchEvent(transicao('pagehide', false));
  assert.equal(camera.estado, 'pausada');
  assert.equal(camera.paradas, 1);
});

test('pageshow da primeira carga (persisted=false) não abre uma segunda câmera', () => {
  const { janela, camera } = cenario();
  janela.dispatchEvent(transicao('pageshow', false));
  assert.equal(camera.aberturas, 0);
});

test('aba oculta pausa e aba visível reabre; o pagehide depois da aba oculta não para duas vezes', () => {
  const { janela, documento, camera } = cenario();
  documento.hidden = true; documento.dispatchEvent(new Event('visibilitychange'));
  assert.equal(camera.estado, 'pausada');
  janela.dispatchEvent(transicao('pagehide', true));
  assert.equal(camera.paradas, 1);
  // Volta do bfcache com a aba ainda oculta: espera ficar visível.
  janela.dispatchEvent(transicao('pageshow', true));
  assert.equal(camera.aberturas, 0);
  documento.hidden = false; documento.dispatchEvent(new Event('visibilitychange'));
  assert.equal(camera.estado, 'rodando');
  assert.equal(camera.aberturas, 1);
});

test('câmera em erro não é reaberta pelo pageshow (o botão Tentar de novo segue sendo o caminho)', () => {
  const { janela, camera } = cenario();
  camera.estado = 'erro';
  janela.dispatchEvent(transicao('pagehide', true));
  janela.dispatchEvent(transicao('pageshow', true));
  assert.equal(camera.paradas, 0);
  assert.equal(camera.aberturas, 0);
});

test('soltar tira os três ouvintes', () => {
  const { janela, documento, camera, soltar } = cenario();
  soltar();
  janela.dispatchEvent(transicao('pagehide', true));
  documento.hidden = true; documento.dispatchEvent(new Event('visibilitychange'));
  assert.equal(camera.paradas, 0);
});
