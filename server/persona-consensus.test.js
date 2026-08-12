import test from 'node:test';
import assert from 'node:assert/strict';
import {
  boardReachedConsensus,
  buildConsensusTurnPrompt,
  CONSENSUS_MAX_CYCLES,
  parseConsensusTurn,
  runConsensusRounds,
} from './persona-consensus.js';

test('parseConsensusTurn reads labeled vote and defaults to hold', () => {
  assert.equal(parseConsensusTurn('voto: converge\nposicao: vistoria').vote, 'converge');
  assert.equal(parseConsensusTurn('vote: dissent\nmotivo do dissenso: falta laudo').vote, 'dissent');
  assert.equal(parseConsensusTurn('voto: hold\nposicao: ainda cedo').vote, 'hold');
  assert.equal(parseConsensusTurn('texto livre sem marcador').vote, 'hold');
  assert.equal(parseConsensusTurn('Registro dissenso porque a franquia nao fechou.').vote, 'dissent');
});

test('boardReachedConsensus requires every seat to converge', () => {
  assert.equal(boardReachedConsensus([]), false);
  assert.equal(boardReachedConsensus([
    { vote: 'converge' },
    { vote: 'converge' },
  ]), true);
  assert.equal(boardReachedConsensus([
    { vote: 'converge' },
    { vote: 'hold' },
  ]), false);
});

test('buildConsensusTurnPrompt asks for labeled vote and turns on pressure copy', () => {
  const calm = buildConsensusTurnPrompt({
    mission: 'Decidir vistoria',
    personaName: 'Aurora',
    originalReply: { ok: true, content: 'Vistoria' },
    contributions: [{ label: 'Contribuicao B', ok: true, content: 'Indenizar' }],
    board: { seats: [{ label: 'B', vote: 'hold', stance: 'Indenizar' }] },
    cycle: 1,
    pressure: false,
  });
  assert.match(calm.user, /Ciclo 1/);
  assert.match(calm.system, /voto: converge\|dissent\|hold/);
  assert.doesNotMatch(calm.system, /DEVE convergir/);

  const pressure = buildConsensusTurnPrompt({
    mission: 'Decidir vistoria',
    originalReply: { ok: true, content: 'Vistoria' },
    cycle: 3,
    pressure: true,
  });
  assert.match(pressure.system, /DEVE convergir/);
  assert.match(pressure.system, /registrar dissenso/);
});

test('runConsensusRounds stops early when every seat converges', async () => {
  const turns = [];
  const result = await runConsensusRounds({
    participantSlugs: ['aurora', 'maestro'],
    blindReplies: [
      { ok: true, slug: 'aurora', name: 'Aurora', content: 'Vistoria' },
      { ok: true, slug: 'maestro', name: 'Maestro', content: 'Indenizar' },
    ],
    runTurn: async (input) => {
      turns.push(input);
      return {
        ok: true,
        slug: input.slug,
        content: `voto: converge\nposicao: vistoria no talhao norte`,
      };
    },
  });

  assert.equal(result.outcome, 'consensus');
  assert.equal(result.cycleCount, 1);
  assert.equal(turns.length, 2);
  assert.equal(turns[0].cycle, 1);
  assert.equal(turns[0].pressure, false);
  assert.equal(result.replies[0].phase, 'consensus');
});

test('runConsensusRounds is round-robin: later seats see earlier updates in the same cycle', async () => {
  const seen = [];
  await runConsensusRounds({
    participantSlugs: ['aurora', 'maestro'],
    blindReplies: [
      { ok: true, slug: 'aurora', name: 'Aurora', content: 'cega A' },
      { ok: true, slug: 'maestro', name: 'Maestro', content: 'cega B' },
    ],
    maxCycles: 1,
    runTurn: async (input) => {
      seen.push(input.board.seats.map((seat) => seat.stance));
      return {
        ok: true,
        slug: input.slug,
        content: `voto: hold\nposicao: nova de ${input.slug}`,
      };
    },
  });

  assert.match(seen[0][0], /cega A/);
  assert.match(seen[1][0], /nova de aurora/);
});

test('runConsensusRounds hits the cap and records dissent when seats never converge', async () => {
  const result = await runConsensusRounds({
    participantSlugs: ['aurora', 'maestro'],
    blindReplies: [
      { ok: true, slug: 'aurora', content: 'A' },
      { ok: true, slug: 'maestro', content: 'B' },
    ],
    runTurn: async ({ slug, cycle, pressure }) => ({
      ok: true,
      slug,
      content: cycle >= 3 && slug === 'maestro'
        ? `voto: dissent\nposicao: indenizar\nmotivo do dissenso: franquia aberta (ciclo ${cycle}, pressure=${pressure})`
        : `voto: hold\nposicao: ainda cedo ciclo ${cycle}`,
    }),
  });

  assert.equal(result.outcome, 'dissent');
  assert.equal(result.cycleCount, CONSENSUS_MAX_CYCLES);
  assert.equal(result.cycles[2].pressure, true);
  assert.equal(result.board.seats[1].vote, 'dissent');
  assert.match(result.board.seats[1].dissentReason, /franquia aberta/);
});
