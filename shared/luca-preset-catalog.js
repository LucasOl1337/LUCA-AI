// Resolve slugs de preset contra o catálogo visível da bancada.
// Visual é opcional: persona oculta/ausente não bloqueia o restante da equipe.

import { VISUAL_PERSONA_SLUG } from './luca-preset-seed.js';
import { PERSONA_WORKFLOW_ROLES } from './persona-workflow.js';

function uniqueSlugs(values) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    const slug = String(value || '').trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    result.push(slug);
  }
  return result;
}

/** Slugs que só aparecem em papel opcional (hoje: visual) + o builtin visual. */
export function optionalSlugsForTeamPreset(assignments = {}) {
  const required = new Set();
  const optional = new Set([VISUAL_PERSONA_SLUG]);
  for (const role of PERSONA_WORKFLOW_ROLES) {
    const target = role.optional ? optional : required;
    for (const slug of uniqueSlugs(assignments[role.id])) target.add(slug);
  }
  return uniqueSlugs([...optional]).filter((slug) => !required.has(slug));
}

export function partitionPresetCatalogSlugs(
  wanted,
  catalogSlugs,
  optionalSlugs = [VISUAL_PERSONA_SLUG],
) {
  const catalog = new Set(uniqueSlugs(catalogSlugs));
  const optional = new Set(uniqueSlugs([...optionalSlugs, VISUAL_PERSONA_SLUG]));
  const present = [];
  const missingRequired = [];
  const missingOptional = [];
  for (const slug of uniqueSlugs(wanted)) {
    if (catalog.has(slug)) present.push(slug);
    else if (optional.has(slug)) missingOptional.push(slug);
    else missingRequired.push(slug);
  }
  return {
    present,
    missingRequired,
    missingOptional,
    blocked: present.length === 0,
  };
}

export function presetCatalogApplyMessage(label, partition, failed = []) {
  const name = String(label || 'equipe').trim() || 'equipe';
  const skipped = uniqueSlugs([...(partition?.missingRequired || []), ...failed]);
  if (partition?.blocked) {
    const missing = uniqueSlugs([
      ...(partition.missingRequired || []),
      ...(partition.missingOptional || []),
    ]);
    if (!missing.length) return `Preset "${name}" não tem personas para aplicar.`;
    return `Preset "${name}": persona${missing.length === 1 ? '' : 's'} fora do catálogo visível: ${missing.join(', ')}.`;
  }
  if (!skipped.length) return null;
  return `Preset "${name}" aplicado sem ${skipped.length} persona${skipped.length === 1 ? '' : 's'}: ${skipped.join(', ')}.`;
}
