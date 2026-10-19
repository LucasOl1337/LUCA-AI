import test from 'node:test';
import assert from 'node:assert/strict';
import { ehEventoCerebro, ehEventoPagina, ehEventoStand } from '../../shared/stand/eventos.ts';

test('eventos do cérebro válidos passam', () => {
  assert.equal(ehEventoCerebro({ tipo: 'estado', valor: 'falando' }), true);
  assert.equal(ehEventoCerebro({ tipo: 'nivel_audio', valor: 0.42 }), true);
  assert.equal(ehEventoCerebro({ tipo: 'legenda', texto: 'O dado sai do sensor do trator.' }), true);
  assert.equal(ehEventoCerebro({ tipo: 'tocar_video', id: 'pipeline-completo' }), true);
  assert.equal(ehEventoCerebro({ tipo: 'acao_site', acao: 'abrir_pagina', args: { pagina: 'sensor' } }), true);
});

test('eventos do cérebro inválidos são recusados', () => {
  assert.equal(ehEventoCerebro({ tipo: 'estado', valor: 'dormindo' }), false);
  assert.equal(ehEventoCerebro({ tipo: 'nivel_audio', valor: 1.5 }), false);
  assert.equal(ehEventoCerebro({ tipo: 'tocar_video', id: '  ' }), false);
  assert.equal(ehEventoCerebro({ tipo: 'acao_site', acao: 'abrir_pagina', args: ['sensor'] }), false);
  assert.equal(ehEventoCerebro(null), false);
  assert.equal(ehEventoCerebro({ tipo: 'encerrar' }), false);
});

test('eventos da página: fim de vídeo, reiniciar e encerrar', () => {
  assert.equal(ehEventoPagina({ tipo: 'video_terminou', id: 'painel-sompo' }), true);
  assert.equal(ehEventoPagina({ tipo: 'reiniciar' }), true);
  assert.equal(ehEventoPagina({ tipo: 'encerrar' }), true);
  assert.equal(ehEventoPagina({ tipo: 'video_terminou' }), false);
  assert.equal(ehEventoStand({ tipo: 'legenda', texto: '' }), true);
  assert.equal(ehEventoStand({ tipo: 'qualquer' }), false);
});
