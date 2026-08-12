import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyMissionDomain,
  formatDomainBriefing,
  normalizeMissionDomain,
  resolveMissionDomain,
} from '../shared/mission-triage.js';

test('classifyMissionDomain picks insurance, code, sports or general from the mission text', () => {
  assert.equal(
    classifyMissionDomain('Sinistro de granizo na lavoura Sompo: apolice, franquia e indenizacao'),
    'insurance',
  );
  assert.equal(
    classifyMissionDomain('Corrigir o bug no endpoint TypeScript e no teste unitario do pull request'),
    'code',
  );
  assert.equal(
    classifyMissionDomain('Quem ganha o campeonato e qual o placar do jogo de futebol'),
    'sports',
  );
  assert.equal(classifyMissionDomain('Explique fotossintese para um aluno'), 'general');
  assert.equal(classifyMissionDomain(''), 'general');
});

test('resolveMissionDomain honors manual override and ignores invalid override', () => {
  const mission = 'Sinistro rural Sompo com franquia';
  assert.deepEqual(resolveMissionDomain(mission), { domain: 'insurance', domainSource: 'auto' });
  assert.deepEqual(
    resolveMissionDomain(mission, { domain: 'code', domainOverride: true }),
    { domain: 'code', domainSource: 'override' },
  );
  assert.deepEqual(
    resolveMissionDomain(mission, { domain: 'music', domainOverride: true }),
    { domain: 'insurance', domainSource: 'auto' },
  );
  assert.equal(normalizeMissionDomain('SPORTS'), 'sports');
  assert.equal(normalizeMissionDomain('nope'), '');
});

test('formatDomainBriefing names the domain and forbids invented insurance numbers', () => {
  const insurance = formatDomainBriefing('insurance', 'auto');
  assert.match(insurance, /triagem automatica/i);
  assert.match(insurance, /Seguro/);
  assert.match(insurance, /Nao invente valores financeiros/i);

  const code = formatDomainBriefing('code', 'override');
  assert.match(code, /override manual/i);
  assert.match(code, /Codigo/);
  assert.match(code, /regressao/i);
});
