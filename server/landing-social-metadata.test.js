import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

const siteTitle = 'LUCA — Centro Operacional de Agentes de IA';
const siteDescription =
  'Monte uma equipe de personas, envie uma missão e acompanhe a entrega em uma conversa única no LUCA-AI.';
const siteUrl = 'https://app.luca-ai.com.br/';
const siteImage = 'https://app.luca-ai.com.br/icon-512.png';

describe('landing social metadata (index.html)', () => {
  it('keeps pt-BR shell and commercial title/description', () => {
    assert.ok(html.includes('lang="pt-BR"'));
    assert.ok(html.includes(`<title>${siteTitle}</title>`));
    assert.ok(html.includes(`content="${siteDescription}"`));
  });

  it('ships absolute Open Graph + Twitter share tags', () => {
    assert.ok(html.includes(`rel="canonical" href="${siteUrl}"`));
    assert.ok(html.includes('property="og:type" content="website"'));
    assert.ok(html.includes('property="og:locale" content="pt_BR"'));
    assert.ok(html.includes('property="og:site_name" content="LUCA-AI"'));
    assert.ok(html.includes(`property="og:url" content="${siteUrl}"`));
    assert.ok(html.includes(`property="og:title" content="${siteTitle}"`));
    assert.ok(html.includes(`property="og:description"`));
    assert.ok(html.includes(`property="og:image" content="${siteImage}"`));
    assert.ok(html.includes('name="twitter:card" content="summary"'));
    assert.ok(html.includes(`name="twitter:title" content="${siteTitle}"`));
    assert.ok(html.includes(`name="twitter:image" content="${siteImage}"`));
  });

  it('does not leave relative-only og:image without absolute twin', () => {
    // Relative og:image alone breaks many share previews off-origin.
    assert.equal(html.includes('property="og:image" content="/icon-512.png"'), false);
  });
});
