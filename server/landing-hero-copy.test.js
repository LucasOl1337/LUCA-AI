import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(join(root, 'src/pages/LandingPage.tsx'), 'utf8');
const html = readFileSync(join(root, 'index.html'), 'utf8');

describe('landing hero copy residual', () => {
  it('hero lead chooses binary mode entry (not personas-only)', () => {
    assert.ok(page.includes('Como você quer chegar à resposta?'));
    assert.ok(page.includes('Usar modo individual'));
    assert.ok(page.includes('Usar modo equipe'));
    assert.ok(page.includes('data-landing-proof-item="runtime"'));
    assert.ok(page.includes('Runtime com status ao vivo'));
  });

  it('keeps commercial share description aligned (personas + missão + conversa)', () => {
    assert.ok(html.includes('Monte uma equipe de personas, envie uma missão e acompanhe a entrega em uma conversa única no LUCA-AI.'));
    assert.ok(html.includes('LUCA — Centro Operacional de Agentes de IA'));
  });
});
