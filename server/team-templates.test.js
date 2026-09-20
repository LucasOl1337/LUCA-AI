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

test('seed no primeiro toque, catálogo global e escrita só com admin', async () => {
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

  // Usuário comum lê o catálogo, mas não escreve.
  workspace.runWithWorkspaceUser('user-a', () => {
    assert.throws(() => templates.createTeamTemplate('team', {
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
    }), /administradores/);
  });

  // Admin escreve uma vez e todos os usuários veem o mesmo catálogo.
  workspace.runWithWorkspaceUser('admin-1', () => {
    templates.createTeamTemplate('team', {
      label: 'Global',
      description: 'catálogo da plataforma',
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
  }, 'admin');

  for (const user of ['user-a', 'user-b']) {
    workspace.runWithWorkspaceUser(user, () => {
      const snap = templates.getTeamTemplatesSnapshot();
      assert.equal(snap.team.some((item) => item.label === 'Global'), true);
    });
  }
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
        aurora: 'gcli/grok-4.5(high)',
        lucas: 'rota/inventada',
        'supervisor-agentes-ia': 'cx/gpt-5.6-sol(max)',
        intruso: 'cc/claude-fable-5(high)',
      },
    });
    assert.deepEqual(created.models, {
      aurora: 'gcli/grok-4.5(high)',
      'supervisor-agentes-ia': 'cx/gpt-5.6-sol(max)',
      'especialista-visual': 'cc/claude-fable-5(high)',
    });

    const legacy = templates.createTeamTemplate('individual', {
      label: 'Legado sem motor',
      participants: ['medico'],
      judge: 'supervisor-agentes-ia',
    });
    assert.deepEqual(legacy.participants, ['medico']);
    assert.equal(legacy.judge, 'supervisor-agentes-ia');
    assert.deepEqual(legacy.models, { 'especialista-visual': 'cc/claude-fable-5(high)' });
    templates._resetTeamTemplatesCacheForTests();
    const reloadedLegacy = templates.getTeamTemplatesSnapshot().individual.find((item) => item.id === legacy.id);
    assert.deepEqual(reloadedLegacy?.participants, ['medico']);
    assert.deepEqual(
      reloadedLegacy?.models,
      { 'especialista-visual': 'cc/claude-fable-5(high)' },
      'template salvo sem models recebe apenas o default visual',
    );

    const seeded = templates.getTeamTemplatesSnapshot().individual[0];
    const updated = templates.updateTeamTemplate('individual', seeded.id, {
      ...seeded,
      models: undefined,
      label: `${seeded.label} editado`,
    });
    assert.deepEqual(updated.models, seeded.models, 'editor legado não apaga hints existentes');
  }, 'admin');
});

test('templates sempre incluem o especialista visual com a rota visual default', async () => {
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
    assert.equal(team.models['especialista-visual'], 'cc/claude-fable-5(high)');

    const individual = templates.getTeamTemplatesSnapshot().individual[0];
    assert.equal(individual.models['especialista-visual'], 'cc/claude-fable-5(high)');
  }, 'admin');
});

test('store legado migra o modelo visual de todos os templates para a rota default', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-templates-visual-migration-'));
  const { workspace, templates } = await loadModule(dataDir);
  const userId = 'legacy-template-user';
  const storePath = path.join(dataDir, 'team-templates.json');
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
      models: { 'especialista-visual': 'cx/gpt-5.6-sol(medium)' },
    }],
    individual: [{
      id: 'individual-legado',
      label: 'Individual legado',
      participants: ['aurora'],
      judge: 'supervisor-agentes-ia',
      models: { 'especialista-visual': 'rota/inventada' },
    }],
  }));

  workspace.runWithWorkspaceUser(userId, () => {
    const snapshot = templates.getTeamTemplatesSnapshot();
    assert.equal(snapshot.team[0].models['especialista-visual'], 'cc/claude-fable-5(high)');
    assert.equal(snapshot.individual[0].models['especialista-visual'], 'cc/claude-fable-5(high)');
  });

  const persisted = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  assert.equal(persisted.version, 5);
});

test('versão 5 substitui presets da plataforma com slugs inexistentes e preserva templates custom', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-templates-platform-refresh-'));
  const { workspace, templates } = await loadModule(dataDir);
  const storePath = path.join(dataDir, 'team-templates.json');
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify({
    version: 4,
    team: [{
      id: 'risco-agro',
      label: 'Equipe Risco Agro',
      assignments: {
        supervisor: ['supervisor-agentes-ia'], mission: ['planejador-missao'],
        execution: ['estrategista-risco-agro'], approval: ['curador-personas'],
        display: ['relator-executivo-risco'], visual: ['especialista-visual'],
      },
    }, {
      id: 'equipe-cliente',
      label: 'Equipe do cliente',
      assignments: {
        supervisor: ['aurora'], mission: ['lucas'], execution: ['tars'],
        approval: ['maestro-2'], display: ['pure-gpt-5-6-sol'], visual: ['especialista-visual'],
      },
    }],
    individual: [{
      id: 'comite-risco-agro',
      label: 'Comitê Risco Agro',
      participants: ['estrategista-risco-agro'],
      judge: 'relator-executivo-risco',
    }],
  }));

  workspace.runWithWorkspaceUser('refresh', () => {
    const snapshot = templates.getTeamTemplatesSnapshot();
    assert.equal(snapshot.team.some((item) => item.id === 'risco-agro'), false);
    assert.equal(snapshot.individual.some((item) => item.id === 'comite-risco-agro'), false);
    assert.equal(snapshot.team.some((item) => item.id === 'conselho-estrategia'), true);
    assert.equal(snapshot.individual.some((item) => item.id === 'conselho-de-ceos'), true);
    assert.equal(snapshot.team.some((item) => item.id === 'equipe-cliente'), true);
    assert.deepEqual(snapshot.team.find((item) => item.id === 'conselho-estrategia')?.assignments.supervisor, ['lucas']);
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
  }, 'admin');
});
