import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('runtime propaga toolsEnabled por todos os modos da bancada', () => {
  const source = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function executeLucaAiPersonaTeamRun');
  const end = source.indexOf("app.post('/api/luca-ai/persona-team/run'", start);
  const engine = source.slice(start, end);

  assert.match(source, /runLucaAiPersonaTeamMember\([^)]*toolsEnabled = true/s);
  assert.match(source, /runLucaAiIndividualJudge\([^)]*toolsEnabled = true/s);
  assert.match(source, /runLucaAiPersonaWorkflow\([^)]*toolsEnabled = true/s);
  assert.match(engine, /runLucaAiPersonaWorkflow\(\{[\s\S]*?toolsEnabled,/);
  assert.match(engine, /independent: true,[\s\S]*?toolsEnabled,/);
  assert.match(engine, /runLucaAiIndividualJudge\(\{[\s\S]*?toolsEnabled,/);
  assert.match(engine, /runLucaAiPersonaTeamMember\(\{[\s\S]*?toolsEnabled,/);
});
