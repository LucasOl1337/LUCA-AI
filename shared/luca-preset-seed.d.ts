export const VISUAL_PERSONA_SLUG: string;
export const VISUAL_PERSONA_MODEL: string;
export const MAX_PARTICIPANTS: number;
export const PRESET_ICON_IDS: readonly string[];

export interface LucaTeamPresetSeed {
  id: string;
  label: string;
  description: string;
  icon: string;
  assignments: {
    supervisor: string[];
    mission: string[];
    execution: string[];
    approval: string[];
    display: string[];
    visual: string[];
  };
  models?: Record<string, string>;
}

export interface LucaIndividualPresetSeed {
  id: string;
  label: string;
  description: string;
  icon: string;
  participants: string[];
  judge: string;
  models?: Record<string, string>;
}

export const LUCA_TEAM_PRESET_SEED: LucaTeamPresetSeed[];
export const LUCA_INDIVIDUAL_PRESET_SEED: LucaIndividualPresetSeed[];
