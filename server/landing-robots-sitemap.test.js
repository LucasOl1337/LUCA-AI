import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const robotsPath = join(root, 'public/robots.txt');
const sitemapPath = join(root, 'public/sitemap.xml');
const siteUrl = 'https://app.luca-ai.com.br/';
const sitemapUrl = 'https://app.luca-ai.com.br/sitemap.xml';

describe('landing robots + sitemap discovery', () => {
  it('ships public robots.txt that allows crawl and points to sitemap', () => {
    assert.ok(existsSync(robotsPath), 'public/robots.txt missing');
    const robots = readFileSync(robotsPath, 'utf8');
    assert.ok(robots.includes('User-agent: *'));
    assert.ok(robots.includes('Allow: /'));
    assert.ok(robots.includes(`Sitemap: ${sitemapUrl}`));
    assert.equal(robots.includes('Disallow: /'), false);
  });

  it('ships public sitemap.xml with absolute product home', () => {
    assert.ok(existsSync(sitemapPath), 'public/sitemap.xml missing');
    const sitemap = readFileSync(sitemapPath, 'utf8');
    assert.ok(sitemap.includes('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(sitemap.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'));
    assert.ok(sitemap.includes(`<loc>${siteUrl}</loc>`));
    assert.equal(sitemap.includes('<loc>/'), false);
  });

  it('keeps commercial share shell untouched (no reopen of social meta)', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert.ok(html.includes('LUCA — Centro Operacional de Agentes de IA'));
    assert.ok(html.includes(`property="og:url" content="${siteUrl}"`));
  });
});
