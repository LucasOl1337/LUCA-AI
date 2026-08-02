import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'public/manifest.webmanifest'), 'utf8'));
const html = readFileSync(join(root, 'index.html'), 'utf8');

const siteTitle = 'LUCA — Centro Operacional de Agentes de IA';
const siteDescription =
  'Monte uma equipe de personas, envie uma missão e acompanhe a entrega em uma conversa única no LUCA-AI.';

describe('landing webmanifest commercial metadata', () => {
  it('aligns name/description with index.html commercial share copy', () => {
    assert.equal(manifest.name, siteTitle);
    assert.equal(manifest.description, siteDescription);
    assert.ok(html.includes(`<title>${siteTitle}</title>`));
    assert.ok(html.includes(`content="${siteDescription}"`));
  });

  it('keeps installable shell fields', () => {
    assert.equal(manifest.short_name, 'LUCA');
    assert.equal(manifest.start_url, '/');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.theme_color, '#07101b');
    assert.equal(manifest.background_color, '#07101b');
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);
    assert.ok(manifest.icons.some((icon) => icon.src === '/icon-512.png'));
  });

  it('bans short internal-only name/description drift', () => {
    assert.notEqual(manifest.name, 'LUCA — Centro Operacional');
    assert.notEqual(manifest.description, 'Centro operacional de agentes de IA.');
  });
});
