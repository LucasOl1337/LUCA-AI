import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ESPECIALISTA_VISUAL_SYSTEM_PROMPT,
  getBuiltinPersona,
  getBuiltinSystemPrompt,
  isLucaBuiltinPersona,
  listBuiltinPersonas,
  mergeBuiltinPersonas,
} from './builtin-personas.js';
import { VISUAL_PERSONA_SLUG } from './config.js';

test('builtin especialista-visual expoe prompt de infografico explicado', () => {
  const persona = getBuiltinPersona(VISUAL_PERSONA_SLUG);
  assert.ok(persona);
  assert.equal(persona.is_official, true);
  assert.equal(persona.luca_builtin, true);
  assert.equal(persona.model, 'gcli/grok-4.5-high');
  assert.match(ESPECIALISTA_VISUAL_SYSTEM_PROMPT, /infogr[aá]fico|explained chart/i);
  assert.match(getBuiltinSystemPrompt(VISUAL_PERSONA_SLUG), /INFOGRÁFICOS|explained chart/i);
  assert.equal(isLucaBuiltinPersona(VISUAL_PERSONA_SLUG), true);
  assert.equal(isLucaBuiltinPersona('aurora'), false);
});

test('mergeBuiltinPersonas injeta especialista-visual quando Yume nao tem a slug', () => {
  const merged = mergeBuiltinPersonas([
    { slug: 'aurora', name: 'Aurora', is_official: true },
  ]);
  assert.equal(merged.length, 2);
  const visual = merged.find((item) => item.slug === VISUAL_PERSONA_SLUG);
  assert.ok(visual);
  assert.equal(visual.luca_builtin, true);
  assert.equal(visual.is_official, true);
  assert.ok(listBuiltinPersonas().some((item) => item.slug === VISUAL_PERSONA_SLUG));
});

test('mergeBuiltinPersonas nao sobrescreve persona ja presente no Yume', () => {
  const merged = mergeBuiltinPersonas([
    {
      slug: VISUAL_PERSONA_SLUG,
      name: 'Especialista Visual Yume',
      is_official: true,
      model: 'cx/gpt-5.6-sol-high',
      purpose: 'do yume',
    },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].name, 'Especialista Visual Yume');
  assert.equal(merged[0].luca_builtin, undefined);
  assert.equal(merged[0].purpose, 'do yume');
});
