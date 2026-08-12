import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
  assert.ok(Object.keys(snapA.team[0].models).length >= 1);
  assert.ok(Object.keys(snapA.individual[0].models).length >= 1);

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
        visual: ['especialista-visual'],
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

test('modelos do template são sanitizados e formato legado continua válido', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-templates-models-'));
  const { workspace, templates } = await loadModule(dataDir);

  workspace.runWithWorkspaceUser('models', () => {
    const created = templates.createTeamTemplate('individual', {
      label: 'Motores seguros',
      participants: ['aurora', 'lucas'],
      judge: 'supervisor-agentes-ia',
      models: {
        aurora: 'gcli/grok-4.5-high',
        lucas: 'rota/inventada',
        'supervisor-agentes-ia': 'cx/gpt-5.6-sol-xhigh',
        intruso: 'cc/claude-fable-5',
      },
    });
    assert.deepEqual(created.models, {
      aurora: 'gcli/grok-4.5-high',
      'supervisor-agentes-ia': 'cx/gpt-5.6-sol-xhigh',
      'especialista-visual': 'gcli/grok-4.6-high',
    });

    const legacy = templates.createTeamTemplate('individual', {
      label: 'Legado sem motor',
      participants: ['medico'],
      judge: 'supervisor-agentes-ia',
    });
    assert.deepEqual(legacy.participants, ['medico']);
    assert.equal(legacy.judge, 'supervisor-agentes-ia');
    assert.deepEqual(legacy.models, { 'especialista-visual': 'gcli/grok-4.6-high' });
    templates._resetTeamTemplatesCacheForTests();
    const reloadedLegacy = templates.getTeamTemplatesSnapshot().individual.find((item) => item.id === legacy.id);
    assert.deepEqual(reloadedLegacy?.participants, ['medico']);
    assert.deepEqual(
      reloadedLegacy?.models,
      { 'especialista-visual': 'gcli/grok-4.6-high' },
      'template salvo sem models recebe apenas o default visual',
    );

    const seeded = templates.getTeamTemplatesSnapshot().individual[0];
    const updated = templates.updateTeamTemplate('individual', seeded.id, {
      ...seeded,
      models: undefined,
      label: `${seeded.label} editado`,
    });
    assert.deepEqual(updated.models, seeded.models, 'editor legado não apaga hints existentes');
  });
});

test('templates sempre incluem o especialista visual com Grok 4.6', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-templates-visual-default-'));
  const { workspace, templates } = await loadModule(dataDir);

  workspace.runWithWorkspaceUser('visual-default', () => {
    const team = templates.createTeamTemplate('team', {
      label: 'Equipe manual sem visual',
      assignments: {
        supervisor: ['aurora'],
        mission: ['lucas'],
        execution: ['tars'],
        approval: ['curador-personas'],
        display: ['relator-executivo-risco'],
      },
    });
    assert.deepEqual(team.assignments.visual, ['especialista-visual']);
    assert.equal(team.models['especialista-visual'], 'gcli/grok-4.6-high');

    const individual = templates.getTeamTemplatesSnapshot().individual[0];
    assert.equal(individual.models['especialista-visual'], 'gcli/grok-4.6-high');
  });
});

test('store legado migra o modelo visual de todos os templates para Grok 4.6', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-templates-visual-migration-'));
  const { workspace, templates } = await loadModule(dataDir);
  const userId = 'legacy-template-user';
  const safeUserDir = createHash('sha256').update(userId).digest('hex').slice(0, 32);
  const storePath = path.join(dataDir, 'workspaces', safeUserDir, 'team-templates.json');
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify({
    version: 1,
    team: [{
      id: 'equipe-legada',
      label: 'Equipe legada',
      assignments: {
        supervisor: ['aurora'], mission: ['lucas'], execution: ['tars'],
        approval: ['curador-personas'], display: ['relator-executivo-risco'],
        visual: ['especialista-visual'],
      },
      models: { 'especialista-visual': 'cx/gpt-5.6-sol-high' },
    }],
    individual: [{
      id: 'individual-legado',
      label: 'Individual legado',
      participants: ['aurora'],
      judge: 'supervisor-agentes-ia',
      models: { 'especialista-visual': 'kimi/k3' },
    }],
  }));

  workspace.runWithWorkspaceUser(userId, () => {
    const snapshot = templates.getTeamTemplatesSnapshot();
    assert.equal(snapshot.team[0].models['especialista-visual'], 'gcli/grok-4.6-high');
    assert.equal(snapshot.individual[0].models['especialista-visual'], 'gcli/grok-4.6-high');
  });

  const persisted = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  assert.equal(persisted.version, 4);
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
