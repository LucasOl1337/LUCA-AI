export const TEAM_ROLE_ORDER: readonly ['supervisor', 'mission', 'execution', 'approval', 'display'];
export const MAX_EXECUTORS: number;
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
  };
}

export interface LucaIndividualPresetSeed {
  id: string;
  label: string;
  description: string;
  icon: string;
  participants: string[];
  judge: string;
}

export const LUCA_TEAM_PRESET_SEED: LucaTeamPresetSeed[];
export const LUCA_INDIVIDUAL_PRESET_SEED: LucaIndividualPresetSeed[];
