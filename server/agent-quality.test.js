import test from 'node:test';
import assert from 'node:assert/strict';

import {
  containsConcreteRepoEvidence,
  reviewResearcherContribution,
} from './agent-quality.js';

test('containsConcreteRepoEvidence reconhece caminhos e arquivos reais', () => {
  assert.equal(containsConcreteRepoEvidence('evidencia em server/index.js e src/components/GlobalChat.tsx'), true);
  assert.equal(containsConcreteRepoEvidence('package.json define os scripts principais'), true);
  assert.equal(containsConcreteRepoEvidence('apenas uma observacao generica sem arquivo'), false);
});

test('reviewResearcherContribution aprova saida rastreavel de repo', () => {
  const review = reviewResearcherContribution({
    mission: { description: 'analise a arquitetura do repositorio LUCA-AI para a Sompo' },
    messages: [
      { content: 'Ponto forte: server/index.js concentra o fluxo de missao e reduz dispersao do orquestrador.' },
      { content: 'Ponto fraco: shared/agent-playbooks.js existia, mas o servidor nao o aplicava nas execucoes reais do pesquisador.' },
      { content: 'Risco: sem esse acoplamento, o agente tende a responder de forma generica mesmo com RepoContext.' },
    ],
  });
  assert.equal(review.ok, true);
  assert.deepEqual(review.gaps, []);
});

test('reviewResearcherContribution bloqueia resposta generica ou sem acesso', () => {
  const generic = reviewResearcherContribution({
    mission: { description: 'analise o repositorio' },
    messages: [{ content: 'Nao tenho acesso a arvore, mas parece organizado e com alguns riscos.' }],
  });
  assert.equal(generic.ok, false);
  assert.ok(generic.gaps.some((gap) => /falta de acesso/i.test(gap)));
  assert.ok(generic.gaps.some((gap) => /ponto forte/i.test(gap)));
  assert.ok(generic.gaps.some((gap) => /ponto fraco/i.test(gap)));
  assert.ok(generic.gaps.some((gap) => /arquivo ou caminho/i.test(gap)));
});
