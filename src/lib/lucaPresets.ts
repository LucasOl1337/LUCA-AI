// PRESETS_BANCADA_V1 — equipes e seleções individuais prontas para aplicar com um clique.
// Os slugs apontam para personas reais do catálogo Yume (GET only). Aplicar um preset
// conecta as personas ao LUCA (importação local) e preenche a seleção da bancada.
import {
  Briefcase,
  Crown,
  HardHat,
  Sprout,
  Stethoscope,
  Swords,
  type LucideIcon,
} from 'lucide-react';

export type LucaTeamPresetRoleId = 'supervisor' | 'mission' | 'execution' | 'approval' | 'display';

export interface LucaTeamPreset {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  assignments: Record<LucaTeamPresetRoleId, string[]>;
}

export interface LucaIndividualPreset {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  participants: string[];
  judge: string;
}

export const LUCA_TEAM_PRESET_ROLE_ORDER: LucaTeamPresetRoleId[] = [
  'supervisor',
  'mission',
  'execution',
  'approval',
  'display',
];

export const LUCA_TEAM_PRESETS: LucaTeamPreset[] = [
  {
    id: 'risco-agro',
    label: 'Equipe Risco Agro',
    description: 'ZARC, campo e indenização da safrinha, com dossiê executivo na entrega.',
    icon: Sprout,
    assignments: {
      supervisor: ['supervisor-agentes-ia'],
      mission: ['planejador-missao'],
      execution: ['estrategista-risco-agro', 'especialista-zarc-seguro-rural', 'engenheiro-agricola'],
      approval: ['curador-personas'],
      display: ['relator-executivo-risco'],
    },
  },
  {
    id: 'engenharia-projetos',
    label: 'Equipe Engenharia & Projetos',
    description: 'Cálculo estrutural, arquitetura e revisão técnica de ponta a ponta.',
    icon: HardHat,
    assignments: {
      supervisor: ['supervisor-agentes-ia'],
      mission: ['roteador-missoes'],
      execution: ['engenheiro-civil', 'arquiteto', 'lucas'],
      approval: ['curador-personas'],
      display: ['relator-executivo-risco'],
    },
  },
  {
    id: 'conselho-estrategia',
    label: 'Conselho de Estratégia',
    description: 'Primeiros princípios e execução pragmática, com síntese para decisão.',
    icon: Briefcase,
    assignments: {
      supervisor: ['supervisor-agentes-ia'],
      mission: ['lucas'],
      execution: ['elon-musk', 'aurora', 'tars'],
      approval: ['curador-personas'],
      display: ['relator-executivo-risco'],
    },
  },
  {
    id: 'squad-summoners-rift',
    label: "Squad Summoner's Rift",
    description: 'Noxus, Demacia e Vazio executando a missão com estilo.',
    icon: Swords,
    assignments: {
      supervisor: ['darius'],
      mission: ['ezreal'],
      execution: ['jinx', 'zed', 'katarina', 'ahri'],
      approval: ['garen'],
      display: ['lux'],
    },
  },
];

export const LUCA_INDIVIDUAL_PRESETS: LucaIndividualPreset[] = [
  {
    id: 'comite-risco-agro',
    label: 'Comitê Risco Agro',
    description: 'Três especialistas da safra respondem; o relator executivo dá o veredito.',
    icon: Sprout,
    participants: ['estrategista-risco-agro', 'especialista-zarc-seguro-rural', 'engenheiro-agricola'],
    judge: 'relator-executivo-risco',
  },
  {
    id: 'conselho-de-ceos',
    label: 'Conselho de CEOs',
    description: 'Elon, Lucas e Aurora respondem isolados; o supervisor decide.',
    icon: Crown,
    participants: ['elon-musk', 'lucas', 'aurora'],
    judge: 'supervisor-agentes-ia',
  },
  {
    id: 'mesa-tecnica',
    label: 'Mesa Técnica',
    description: 'Engenheiro civil e arquiteto respondem; o curador audita o veredito.',
    icon: HardHat,
    participants: ['engenheiro-civil', 'arquiteto'],
    judge: 'curador-personas',
  },
  {
    id: 'plantao-de-saude',
    label: 'Plantão de Saúde',
    description: 'Pergunta clínica direta ao médico, com o supervisor validando a resposta.',
    icon: Stethoscope,
    participants: ['medico'],
    judge: 'supervisor-agentes-ia',
  },
  {
    id: 'duelo-noxus-demacia',
    label: 'Duelo Noxus × Demacia',
    description: 'Darius, Katarina, Garen e Lux se enfrentam; o supervisor declara o vencedor.',
    icon: Swords,
    participants: ['darius', 'katarina', 'garen', 'lux'],
    judge: 'supervisor-agentes-ia',
  },
];

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
