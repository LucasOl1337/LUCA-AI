import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const json = (file) => JSON.parse(readFileSync(new URL(file, root), 'utf8'));

test('MAX TRATOR photo references match the manifest and published provenance', () => {
  const manifest = json('missoes/trator-referencias/manifest.json');
  const provenance = json('public/models/sompo/max-tractor.provenance.json');
  assert.equal(manifest.quantidade, 14);
  assert.equal(manifest.arquivos.length, manifest.quantidade);
  assert.equal(provenance.references.length, manifest.quantidade);
  assert.equal(new Set(manifest.arquivos.map((file) => file.arquivo)).size, manifest.quantidade);
  for (const file of manifest.arquivos) {
    const relative = `missoes/trator-referencias/${file.arquivo}`;
    const data = readFileSync(new URL(relative, root));
    assert.equal(data.length, file.bytes, relative);
    assert.equal(createHash('sha256').update(data).digest('hex'), file.sha256, relative);
    assert.deepEqual(provenance.references.find((reference) => reference.path === relative), {
      path: relative, sha256: file.sha256,
    });
  }
});

test('preserved tractor specification points to references and declares historical scope', () => {
  const document = readFileSync(new URL('docs/cadastro-veiculos-trator-especificacao.md', root), 'utf8');
  assert.match(document, /especificação histórica/);
  assert.match(document, /\.\.\/missoes\/trator-referencias\/README\.md/);
  assert.doesNotMatch(document, /Status:\*\* aguardando implementação/);
  assert.match(document, /Não altera cadastro, cena ou telemetria/);
});
