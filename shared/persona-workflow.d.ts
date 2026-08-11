export type PersonaWorkflowRoleId = 'supervisor' | 'mission' | 'execution' | 'approval' | 'display' | 'visual';

export interface PersonaWorkflowRole {
  id: PersonaWorkflowRoleId;
  label: string;
  maxSlugs: number;
  optional: boolean;
  instruction: string;
}

export type PersonaWorkflowAssignments = Record<PersonaWorkflowRoleId, string[]>;

export interface PersonaWorkflowStep {
  roleId: PersonaWorkflowRoleId;
  roleLabel: string;
  instruction: string;
  slugs: string[];
}

export interface PersonaWorkflowResolution {
  configured: boolean;
  assignments: PersonaWorkflowAssignments;
  workflow: PersonaWorkflowStep[];
  slugs: string[];
  missingRoleIds: PersonaWorkflowRoleId[];
  ready: boolean;
}

export const PERSONA_WORKFLOW_ROLES: readonly PersonaWorkflowRole[];
export const PERSONA_WORKFLOW_ROLE_IDS: readonly PersonaWorkflowRoleId[];

export function normalizePersonaSlug(value: unknown): string;
export function resolvePersonaWorkflow(
  value: unknown,
  options?: { fallbackSlugs?: unknown[]; maxTeamSize?: number },
): PersonaWorkflowResolution;
export function getPersonaWorkflowRole(value: unknown): PersonaWorkflowRole | null;
export function samePersonaWorkflow(left: unknown, right: unknown): boolean;
