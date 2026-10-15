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

test('margem e variante não vazam para outras páginas', () => {
  assert.equal(formatAppUrl({ page: 'sompo', margem: '8', variante: 'robo' }), '/sompo');
});
