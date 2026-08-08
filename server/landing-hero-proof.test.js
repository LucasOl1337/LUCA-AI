import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(join(root, 'src/pages/LandingPage.tsx'), 'utf8');
const css = readFileSync(join(root, 'src/home-page.css'), 'utf8');

describe('landing hero conversion proof', () => {
  it('ships secondary proof strip beyond the mode cards', () => {
    assert.ok(page.includes('data-landing-proof'));
    assert.ok(page.includes('data-landing-proof-item="personas"'));
    assert.ok(page.includes('data-landing-proof-item="missao"'));
    assert.ok(page.includes('data-landing-proof-item="runtime"'));
    assert.ok(page.includes('Equipe de personas'));
    assert.ok(page.includes('Missão em conversa única'));
    assert.ok(page.includes('Runtime com status ao vivo'));
    assert.ok(page.includes('aria-label="Personas especializadas do LUCA-AI"'));
  });

  it('keeps mode CTAs + personas catalog CTA with stable markers', () => {
    assert.ok(page.includes('data-landing-cta="individual"'));
    assert.ok(page.includes('data-landing-cta="team"'));
    assert.ok(page.includes('data-landing-cta="personas"'));
    assert.ok(page.includes('Usar modo individual'));
    assert.ok(page.includes('Usar modo equipe'));
    assert.ok(page.includes('Ver catálogo de personas'));
  });

  it('styles proof chips with product tokens (no ad-hoc hex palette)', () => {
    assert.ok(css.includes('.home-proof-strip'));
    assert.ok(css.includes('var(--l-text-soft)'));
    assert.ok(css.includes('var(--l-gold-bright)'));
    assert.ok(css.includes('var(--l-gold-soft)'));
    const chipBlock = css.slice(css.indexOf('.home-proof-strip'), css.indexOf('.home-proof-strip') + 900);
    assert.equal(/#[0-9a-fA-F]{3,8}/.test(chipBlock), false);
  });
});
