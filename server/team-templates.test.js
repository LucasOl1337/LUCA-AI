import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

async function loadModule(dataDir) {
  process.env.LUCA_DATA_DIR = dataDir;
  const workspaceUrl = pathToFileURL(path.resolve('server/workspace-context.js')).href;
  const templatesUrl = `${pathToFileURL(path.resolve('server/team-templates.js')).href}?t=${Date.now()}-${Math.random()}`;
  const workspace = await import(workspaceUrl);
  const templates = await import(templatesUrl);
  templates._resetTeamTemplatesCacheForTests();
  return { workspace, templates };
}

test('seed no primeiro toque e isolamento por conta', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-templates-'));
  const { workspace, templates } = await loadModule(dataDir);

  let snapA;
  workspace.runWithWorkspaceUser('user-a', () => {
    snapA = templates.getTeamTemplatesSnapshot();
  });
  assert.ok(snapA.team.length >= 1);
  assert.ok(snapA.individual.length >= 1);

  workspace.runWithWorkspaceUser('user-a', () => {
    templates.createTeamTemplate('team', {
      label: 'Só A',
      description: 'conta A',
      icon: 'users',
      assignments: {
        supervisor: ['aurora'],
        mission: ['lucas'],
        execution: ['tars'],
        approval: ['curador-personas'],
        display: ['relator-executivo-risco'],
      },
    });
  });

  workspace.runWithWorkspaceUser('user-b', () => {
    const snapB = templates.getTeamTemplatesSnapshot();
    assert.equal(snapB.team.some((item) => item.label === 'Só A'), false);
  });

  workspace.runWithWorkspaceUser('user-a', () => {
    const snap = templates.getTeamTemplatesSnapshot();
    assert.equal(snap.team.some((item) => item.label === 'Só A'), true);
  });
});

test('create update delete reorder', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-templates-crud-'));
  const { workspace, templates } = await loadModule(dataDir);

  workspace.runWithWorkspaceUser('ops', () => {
    const created = templates.createTeamTemplate('individual', {
      label: 'Mesa X',
      icon: 'hardhat',
      participants: ['engenheiro-civil', 'arquiteto'],
      judge: 'curador-personas',
    });
    assert.equal(created.label, 'Mesa X');

    const updated = templates.updateTeamTemplate('individual', created.id, {
      ...created,
      label: 'Mesa Y',
      participants: ['medico'],
      judge: 'supervisor-agentes-ia',
    });
    assert.equal(updated.label, 'Mesa Y');
    assert.deepEqual(updated.participants, ['medico']);

    const before = templates.getTeamTemplatesSnapshot().individual.map((item) => item.id);
    const reordered = [...before.slice(1), before[0]];
    templates.reorderTeamTemplates('individual', reordered);
    assert.deepEqual(
      templates.getTeamTemplatesSnapshot().individual.map((item) => item.id),
      reordered,
    );

    templates.deleteTeamTemplate('individual', created.id);
    assert.equal(
      templates.getTeamTemplatesSnapshot().individual.some((item) => item.id === created.id),
      false,
    );
  });
});
