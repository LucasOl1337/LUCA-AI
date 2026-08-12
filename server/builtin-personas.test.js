import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ESPECIALISTA_VISUAL_SYSTEM_PROMPT,
  getBuiltinPersona,
  getBuiltinSystemPrompt,
  isLucaBuiltinPersona,
} from './builtin-personas.js';
import { VISUAL_PERSONA_SLUG } from './config.js';

test('builtin especialista-visual expoe prompt de infografico explicado', () => {
  const persona = getBuiltinPersona(VISUAL_PERSONA_SLUG);
  assert.ok(persona);
  assert.equal(persona.is_official, true);
  assert.equal(persona.luca_builtin, true);
  assert.equal(persona.model, 'gcli/grok-4.6');
  assert.match(ESPECIALISTA_VISUAL_SYSTEM_PROMPT, /infogr[aá]fico|explained chart/i);
  assert.match(getBuiltinSystemPrompt(VISUAL_PERSONA_SLUG), /INFOGRÁFICOS|explained chart/i);
  assert.equal(isLucaBuiltinPersona(VISUAL_PERSONA_SLUG), true);
  assert.equal(isLucaBuiltinPersona('aurora'), false);
});
