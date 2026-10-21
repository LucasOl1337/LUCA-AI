import assert from 'node:assert/strict';
import test from 'node:test';
import { formatAppUrl, parseAppLocation } from '../shared/app-location.js';

test('/stand abre a página do stand', () => {
  assert.equal(parseAppLocation('/stand').page, 'stand');
  assert.equal(parseAppLocation('/stand/').page, 'stand');
  assert.equal(formatAppUrl({ page: 'stand' }), '/stand');
});

test('/stand guarda margem e variante válidas e descarta o resto', () => {
  const loc = parseAppLocation('/stand?margem=8&variante=robo&caso=x');
  assert.equal(loc.margem, '8');
  assert.equal(loc.variante, 'robo');
  assert.equal(formatAppUrl(loc), '/stand?margem=8&variante=robo');
  assert.equal(parseAppLocation('/stand?margem=35').margem, '');
  assert.equal(parseAppLocation('/stand?margem=-1').margem, '');
  assert.equal(parseAppLocation('/stand?variante=dragao').variante, '');
});

test('toda variante do avatar passa pela URL do /stand (coruja-3d chegava como coruja-a)', async () => {
  const { loadFrontendModule } = await import('./support/load-frontend-module.js');
  const { STAND_VARIANTES } = await import('../shared/app-location.js');
  const { VARIANTES_AVATAR } = await loadFrontendModule('../../src/components/stand/AvatarLuca.tsx');
  assert.deepEqual([...STAND_VARIANTES].sort(), [...VARIANTES_AVATAR].sort());
  assert.equal(parseAppLocation('/stand?variante=coruja-3d').variante, 'coruja-3d');
  assert.equal(formatAppUrl(parseAppLocation('/stand?variante=coruja-3d&stub=1')), '/stand?variante=coruja-3d&stub=1');
});

test('/stand?stub=1 liga o modo de teste e só aceita 1', () => {
  assert.equal(parseAppLocation('/stand?stub=1').stub, '1');
  assert.equal(parseAppLocation('/stand?stub=sim').stub, '');
  assert.equal(formatAppUrl({ page: 'stand', stub: '1', variante: 'coruja' }), '/stand?variante=coruja&stub=1');
  assert.equal(formatAppUrl({ page: 'sompo', stub: '1' }), '/sompo');
});

test('/stand?simulacao=gameplay sobrevive à URL canônica; outro valor ou outra página some', () => {
  assert.equal(formatAppUrl(parseAppLocation('/stand?simulacao=gameplay')), '/stand?simulacao=gameplay');
  assert.equal(formatAppUrl(parseAppLocation('/stand?simulacao=classica')), '/stand');
  assert.equal(formatAppUrl({ page: 'sompo', simulacao: 'gameplay' }), '/sompo');
});

test('URL canônica: só simulacao=gameplay passa a sobreviver; o resto segue apagado como antes', () => {
  const canonica = (href) => formatAppUrl(parseAppLocation(href));
  assert.equal(canonica('/stand'), '/stand');
  assert.equal(canonica('/stand?foo=1'), '/stand');
  assert.equal(canonica('/stand?simulacao=x'), '/stand');
  assert.equal(canonica('/stand?simulacao=gameplay&foo=1'), '/stand?simulacao=gameplay');
  assert.equal(canonica('/stand?variante=coruja&stub=1&simulacao=gameplay'), '/stand?variante=coruja&stub=1&simulacao=gameplay');
  assert.equal(canonica('/sompo'), '/sompo');
  assert.equal(canonica('/sompo?simulacao=gameplay'), '/sompo');
  assert.equal(canonica('/?simulacao=gameplay'), canonica('/'));
});

test('margem e variante não vazam para outras páginas', () => {
  assert.equal(formatAppUrl({ page: 'sompo', margem: '8', variante: 'robo' }), '/sompo');
});
