import type { LabCase } from './lab-telemetry.js';

export const LAB_CONCLUSION_CATEGORIES: Record<'operational' | 'mechanical' | 'environmental' | 'combined' | 'inconclusive', string>;
export function renderLabReport(labCase: LabCase, record: {
  id: string;
  analyses: { version: number; status: string }[];
  conclusions: {
    version: number; category: string; observations: string; action: string;
    createdAt: string; hypothesisReviews: unknown[];
  }[];
} | null, author: string, exportedAt?: Date): string;
