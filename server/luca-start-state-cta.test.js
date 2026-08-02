// Source lock: LucaAiStartState error/empty expose differentiated recovery CTAs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(root, '../src/pages/LucaAiPage.tsx'), 'utf8');

test('luca start error state prioritizes retry CTA', () => {
  assert.ok(source.includes('data-luca-start-error'), 'error shell marker');
  assert.ok(source.includes("data-tone={error ? 'error' : undefined}"), 'error tone');
  assert.ok(source.includes("role={error ? 'alert' : undefined}"), 'alert role on error');
  assert.ok(source.includes('data-luca-start-retry'), 'retry marker');
  assert.ok(source.includes('Tentar novamente'), 'retry label');

  const errBranch = source.indexOf('{error ? (');
  assert.ok(errBranch >= 0, 'error branch present');
  const slice = source.slice(errBranch, errBranch + 700);
  assert.ok(slice.includes('data-luca-start-retry'), 'retry inside error branch');
  assert.ok(slice.includes('btn-primary'), 'retry is primary on error');
  assert.ok(slice.includes('Tentar novamente'), 'retry label inside error branch');
  // primary retry must appear before secondary open personas in error branch
  const retryAt = slice.indexOf('data-luca-start-retry');
  const openAt = slice.indexOf('data-luca-start-open-personas');
  assert.ok(retryAt >= 0 && openAt > retryAt, 'error: retry before open personas');
});

test('luca start empty state prioritizes open personas CTA', () => {
  assert.ok(source.includes('data-luca-start-empty'), 'empty shell marker');
  assert.ok(source.includes("data-luca-start-actions={error ? 'error' : 'empty'}"), 'actions tone marker');

  // empty branch is the else of {error ? ( ... ) : ( ... )}
  const errBranch = source.indexOf('{error ? (');
  assert.ok(errBranch >= 0);
  // find the else arm after first error ternary in start state actions
  const elseAt = source.indexOf(') : (', errBranch);
  assert.ok(elseAt > errBranch, 'empty else branch');
  const slice = source.slice(elseAt, elseAt + 700);
  assert.ok(slice.includes('data-luca-start-open-personas'), 'open personas in empty');
  assert.ok(slice.includes('Abrir Personas'), 'open label');
  assert.ok(slice.includes('Verificar novamente'), 'secondary reload label');
  assert.ok(slice.includes('data-luca-start-retry'), 'reload marker on empty');
  const openAt = slice.indexOf('data-luca-start-open-personas');
  const retryAt = slice.indexOf('data-luca-start-retry');
  assert.ok(openAt >= 0 && retryAt > openAt, 'empty: open personas before retry');
  assert.equal(slice.includes('Tentar novamente'), false, 'error retry label not on empty');
  assert.equal(slice.includes('data-luca-start-error'), false, 'error shell not inside empty actions');
});
