import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(join(root, 'src/pages/LandingPage.tsx'), 'utf8');
const html = readFileSync(join(root, 'index.html'), 'utf8');

const heroPromise =
  'Monte uma equipe de personas, envie uma missão e acompanhe a entrega em uma conversa única com status do runtime ao vivo.';

describe('landing hero copy residual', () => {
  it('hero lead mirrors chips + runtime proof (not personas-only)', () => {
    assert.ok(page.includes(heroPromise));
    assert.ok(page.includes('status do runtime ao vivo'));
    assert.ok(page.includes('data-landing-proof-item="runtime"'));
    // ban the pre-runtime residual lead that omitted live runtime
    assert.equal(
      page.includes(
        'Monte uma equipe de personas, envie uma missão e acompanhe a entrega em uma conversa única.'
      ),
      false,
    );
  });

  it('keeps commercial share description aligned (personas + missão + conversa)', () => {
    assert.ok(html.includes('Monte uma equipe de personas, envie uma missão e acompanhe a entrega em uma conversa única no LUCA-AI.'));
    // do not reopen social meta; only assert shell still commercial
    assert.ok(html.includes('LUCA — Centro Operacional de Agentes de IA'));
  });
});
