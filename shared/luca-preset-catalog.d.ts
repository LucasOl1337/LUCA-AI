export interface PresetCatalogPartition {
  present: string[];
  missingRequired: string[];
  missingOptional: string[];
  blocked: boolean;
}

export function optionalSlugsForTeamPreset(
  assignments?: Record<string, string[] | null | undefined>,
): string[];

export function partitionPresetCatalogSlugs(
  wanted: unknown,
  catalogSlugs: unknown,
  optionalSlugs?: unknown,
): PresetCatalogPartition;

export function presetCatalogApplyMessage(
  label: string,
  partition: PresetCatalogPartition,
  failed?: unknown,
): string | null;
