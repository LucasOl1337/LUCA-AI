import type { LabManifest, LabSchema } from './lab-telemetry.js';

export const SOMPO_EXPORT_MAX_SAMPLES: number;
export const SOMPO_EXPORT_MAX_JSON_BYTES: number;
export function convertSompoDataset(input: unknown): {
  csv: string;
  fileName: string;
  manifest: LabManifest;
  schema: LabSchema;
};
