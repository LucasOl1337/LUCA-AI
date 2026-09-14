import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(join(root, 'src/pages/LandingPage.tsx'), 'utf8');

describe('landing hero conversion proof', () => {
  it('keeps mode CTAs with stable markers', () => {
    assert.ok(page.includes('data-landing-cta="individual"'));
    assert.ok(page.includes('data-landing-cta="team"'));
    assert.ok(page.includes('Usar modo individual'));
    assert.ok(page.includes('Usar modo equipe'));
  });
});
