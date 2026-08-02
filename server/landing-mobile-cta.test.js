import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(join(root, 'src/pages/LandingPage.tsx'), 'utf8');
const css = readFileSync(join(root, 'src/index.css'), 'utf8');

describe('landing mobile CTA conversion', () => {
  it('keeps hero CTA row + primary/secondary markers', () => {
    assert.ok(page.includes('data-landing-cta-row'));
    assert.ok(page.includes('data-landing-cta="open"'));
    assert.ok(page.includes('data-landing-cta="personas"'));
    assert.ok(page.includes('className="btn-primary"'));
    assert.ok(page.includes('className="btn-fleet"'));
  });

  it('stacks full-width CTAs under 560px with touch min-height', () => {
    const m560 = css.indexOf('@media (max-width: 560px)');
    assert.ok(m560 >= 0);
    const block = css.slice(m560, m560 + 900);
    assert.ok(block.includes('.luca-hero [data-landing-cta-row]'));
    assert.ok(block.includes('flex-direction: column'));
    assert.ok(block.includes('align-items: stretch'));
    assert.ok(block.includes('.luca-hero [data-landing-cta]'));
    assert.ok(block.includes('width: 100%'));
    assert.ok(block.includes('min-height: var(--l-touch)'));
    assert.ok(block.includes('justify-content: center'));
  });

  it('keeps product touch token at 44px for CTA height', () => {
    assert.ok(css.includes('--l-touch: 44px'));
    assert.match(css, /\.btn-primary[\s\S]{0,180}min-height:\s*var\(--l-touch\)/);
  });
});
