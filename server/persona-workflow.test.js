import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PERSONA_WORKFLOW_ROLES,
  normalizePersonaSlug,
  resolvePersonaWorkflow,
  samePersonaWorkflow,
} from '../shared/persona-workflow.js';

test('workflow configuration normaliza aliases, duplicatas e limites uma vez', () => {
  const resolved = resolvePersonaWorkflow({
    coordenacao: 'yume:/maestro/',
    missao: ['planejador'],
    executors: ['a', 'b', 'a', 'c', 'd', 'excedente'],
    approvers: ['qa-1', 'qa-2', 'qa-3'],
    final_display: 'relator',
  });

  assert.equal(normalizePersonaSlug('yume:/maestro/'), 'maestro');
  assert.deepEqual(resolved.assignments.execution, ['a', 'b', 'c', 'd']);
  assert.deepEqual(resolved.assignments.approval, ['qa-1', 'qa-2']);
  assert.equal(resolved.ready, true);
  assert.deepEqual(resolved.missingRoleIds, []);
  assert.equal(resolved.workflow.find((role) => role.roleId === 'visual')?.slugs.length, 0);
});

test('workflow configuration aplica optionality e readiness pela mesma interface', () => {
  const incomplete = resolvePersonaWorkflow({ supervisor: 'maestro', execution: ['executor'] });
  assert.equal(incomplete.ready, false);
  assert.deepEqual(incomplete.missingRoleIds.sort(), ['approval', 'display', 'mission']);

  const visual = PERSONA_WORKFLOW_ROLES.find((role) => role.id === 'visual');
  assert.equal(visual?.optional, true);
  assert.match(visual?.instruction || '', /infograficos\/explained charts/);
  const display = PERSONA_WORKFLOW_ROLES.find((role) => role.id === 'display');
  assert.match(display?.instruction || '', /Veredito:/);
  assert.match(display?.instruction || '', /no maximo 3 bullets/);
  assert.equal(/cinematograficas/.test(visual?.instruction || ''), false);
  assert.equal(PERSONA_WORKFLOW_ROLES.find((role) => role.id === 'approval')?.maxSlugs, 2);
});

test('workflow configuration produz ordem canonica, fallback e igualdade', () => {
  const fallback = resolvePersonaWorkflow({}, { fallbackSlugs: ['a', 'b', 'c'] });
  assert.deepEqual(fallback.slugs, ['a', 'b', 'c']);
  assert.deepEqual(fallback.assignments, {
    supervisor: ['a'],
    mission: ['b'],
    execution: ['a', 'b', 'c'],
    approval: ['a'],
    display: ['c'],
    visual: [],
  });
  assert.equal(samePersonaWorkflow(fallback.assignments, fallback.workflow), true);
});
