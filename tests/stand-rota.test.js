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

test('/stand?stub=1 liga o modo de teste e só aceita 1', () => {
  assert.equal(parseAppLocation('/stand?stub=1').stub, '1');
  assert.equal(parseAppLocation('/stand?stub=sim').stub, '');
  assert.equal(formatAppUrl({ page: 'stand', stub: '1', variante: 'coruja' }), '/stand?variante=coruja&stub=1');
  assert.equal(formatAppUrl({ page: 'sompo', stub: '1' }), '/sompo');
});

test('margem e variante não vazam para outras páginas', () => {
  assert.equal(formatAppUrl({ page: 'sompo', margem: '8', variante: 'robo' }), '/sompo');
});
