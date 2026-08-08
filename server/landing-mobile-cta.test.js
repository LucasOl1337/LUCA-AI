import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(join(root, 'src/pages/LandingPage.tsx'), 'utf8');
const css = readFileSync(join(root, 'src/home-page.css'), 'utf8');
const indexCss = readFileSync(join(root, 'src/index.css'), 'utf8');

describe('landing mobile CTA conversion', () => {
  it('keeps hero CTA row + mode markers', () => {
    assert.ok(page.includes('data-landing-cta-row'));
    assert.ok(page.includes('data-landing-cta="individual"'));
    assert.ok(page.includes('data-landing-cta="team"'));
  });

  it('stacks full-width CTAs under 560px with touch min-height', () => {
    const m560 = css.indexOf('@media (max-width: 560px)');
    assert.ok(m560 >= 0);
    const block = css.slice(m560, m560 + 500);
    assert.ok(block.includes('.home-a-modes'));
    assert.ok(block.includes('grid-template-columns: 1fr'));
    assert.ok(block.includes('width: 100%'));
    assert.ok(block.includes('min-height: var(--l-touch)'));
  });

  it('keeps product touch token at 44px for CTA height', () => {
    assert.ok(indexCss.includes('--l-touch: 44px'));
  });
});
