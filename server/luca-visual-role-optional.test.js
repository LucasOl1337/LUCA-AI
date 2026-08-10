// Source lock: Especialista visual is optional — empty does not block team runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(root, '../src/pages/LucaAiPage.tsx'), 'utf8');
const personaTeam = readFileSync(join(root, '../server/persona-team.js'), 'utf8');
const index = readFileSync(join(root, '../server/index.js'), 'utf8');

test('frontend marks visual role optional and excludes it from workflowReady', () => {
  assert.match(page, /id:\s*'visual'[\s\S]*?optional:\s*true/);
  assert.ok(page.includes('REQUIRED_WORKFLOW_ROLES'), 'required roles list');
  const readyFn = page.slice(page.indexOf('function workflowReady'), page.indexOf('function workflowReady') + 280);
  assert.ok(readyFn.includes('REQUIRED_WORKFLOW_ROLES.every'), 'ready checks only required roles');
  // Avoid matching REQUIRED_WORKFLOW_ROLES.every — only bare WORKFLOW_ROLES.every is wrong.
  assert.equal(
    /(?<!REQUIRED_)WORKFLOW_ROLES\.every/.test(readyFn),
    false,
    'workflowReady must not require visual',
  );
});

test('server marks visual optional and skips empty optional steps', () => {
  assert.match(personaTeam, /id:\s*'visual'[\s\S]*?optional:\s*true/);
  assert.ok(personaTeam.includes('!def?.optional') || personaTeam.includes('!def.optional'), 'missingRoles ignores optional');
  assert.ok(index.includes('roleConfig.optional') && index.includes('continue'), 'runtime skips empty optional steps');
});
