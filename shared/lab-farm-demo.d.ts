import type { LabCase, LabSite } from './lab-telemetry.js';
export function createFarmDemo(site: LabSite): LabCase;
export const FARM_DEMO_ROUTES: Record<string, { center: [number, number]; eastM: number; northM: number; provenance: string }>;
