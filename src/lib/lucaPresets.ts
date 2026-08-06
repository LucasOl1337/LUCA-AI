// PRESETS_BANCADA_V1 — helpers + ícones. Seed de dados em shared/luca-preset-seed.js.
import {
  Briefcase,
  Crown,
  HardHat,
  Sprout,
  Stethoscope,
  Swords,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  LUCA_INDIVIDUAL_PRESET_SEED,
  LUCA_TEAM_PRESET_SEED,
  TEAM_ROLE_ORDER,
} from '../../shared/luca-preset-seed.js';

export type LucaTeamPresetRoleId = 'supervisor' | 'mission' | 'execution' | 'approval' | 'display';
export type LucaPresetIconId = 'sprout' | 'hardhat' | 'briefcase' | 'swords' | 'crown' | 'stethoscope' | 'users';

export interface LucaTeamPreset {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  iconId?: LucaPresetIconId | string;
  assignments: Record<LucaTeamPresetRoleId, string[]>;
}

export interface LucaIndividualPreset {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  iconId?: LucaPresetIconId | string;
  participants: string[];
  judge: string;
}

export const PRESET_ICON_MAP: Record<string, LucideIcon> = {
  sprout: Sprout,
  hardhat: HardHat,
  briefcase: Briefcase,
  swords: Swords,
  crown: Crown,
  stethoscope: Stethoscope,
  users: Users,
};

export function resolvePresetIcon(iconId?: string | null): LucideIcon {
  return PRESET_ICON_MAP[String(iconId || '').trim()] || Users;
}

export const LUCA_TEAM_PRESET_ROLE_ORDER: LucaTeamPresetRoleId[] = [...TEAM_ROLE_ORDER] as LucaTeamPresetRoleId[];

function hydrateTeam(seed: (typeof LUCA_TEAM_PRESET_SEED)[number]): LucaTeamPreset {
  return {
    id: seed.id,
    label: seed.label,
    description: seed.description,
    iconId: seed.icon,
    icon: resolvePresetIcon(seed.icon),
    assignments: seed.assignments as Record<LucaTeamPresetRoleId, string[]>,
  };
}

function hydrateIndividual(seed: (typeof LUCA_INDIVIDUAL_PRESET_SEED)[number]): LucaIndividualPreset {
  return {
    id: seed.id,
    label: seed.label,
    description: seed.description,
    iconId: seed.icon,
    icon: resolvePresetIcon(seed.icon),
    participants: seed.participants,
    judge: seed.judge,
  };
}

/** Seed embutido — fallback offline; runtime prefer GET /api/luca-ai/team-templates. */
export const LUCA_TEAM_PRESETS: LucaTeamPreset[] = LUCA_TEAM_PRESET_SEED.map(hydrateTeam);
export const LUCA_INDIVIDUAL_PRESETS: LucaIndividualPreset[] = LUCA_INDIVIDUAL_PRESET_SEED.map(hydrateIndividual);

export function hydrateTeamTemplate(raw: {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  assignments: Partial<Record<LucaTeamPresetRoleId, string[]>> | Record<string, string[]>;
}): LucaTeamPreset {
  return {
    id: raw.id,
    label: raw.label,
    description: String(raw.description || ''),
    iconId: raw.icon,
    icon: resolvePresetIcon(raw.icon),
    assignments: {
      supervisor: raw.assignments?.supervisor ?? [],
      mission: raw.assignments?.mission ?? [],
      execution: raw.assignments?.execution ?? [],
      approval: raw.assignments?.approval ?? [],
      display: raw.assignments?.display ?? [],
    },
  };
}

export function hydrateIndividualTemplate(raw: {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  participants: string[];
  judge: string | null;
}): LucaIndividualPreset {
  return {
    id: raw.id,
    label: raw.label,
    description: String(raw.description || ''),
    iconId: raw.icon,
    icon: resolvePresetIcon(raw.icon),
    participants: Array.isArray(raw.participants) ? raw.participants : [],
    judge: String(raw.judge || ''),
  };
}

function dedupeSlugs(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const slug = String(value || '').trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    result.push(slug);
  }
  return result;
}

/** Todos os slugs do preset em ordem de papel, sem repetição. */
export function teamPresetSlugs(preset: LucaTeamPreset): string[] {
  return dedupeSlugs(LUCA_TEAM_PRESET_ROLE_ORDER.flatMap((roleId) => preset.assignments[roleId] ?? []));
}

/** Participantes primeiro, juiz por último, sem repetição. */
export function individualPresetSlugs(preset: LucaIndividualPreset): string[] {
  return dedupeSlugs([...preset.participants, preset.judge]);
}

function sameSlugList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((slug, index) => slug === right[index]);
}

/** Verdadeiro quando a seleção atual já reflete exatamente o preset. */
export function teamPresetMatches(
  assignments: Partial<Record<LucaTeamPresetRoleId, string[]>>,
  preset: LucaTeamPreset,
): boolean {
  return LUCA_TEAM_PRESET_ROLE_ORDER.every((roleId) => (
    sameSlugList(assignments[roleId] ?? [], preset.assignments[roleId] ?? [])
  ));
}

export function individualPresetMatches(
  assignments: { participants: string[]; judge: string | null },
  preset: LucaIndividualPreset,
): boolean {
  return sameSlugList(assignments.participants, preset.participants)
    && String(assignments.judge || '') === preset.judge;
}
