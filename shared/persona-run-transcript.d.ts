export interface PersonaRunTranscriptEntry {
  id: string;
  role: 'persona';
  name: string;
  slug?: string;
  model?: string;
  stage?: string;
  phase?: string;
  content: string;
  status: 'ok' | 'error';
  timestamp: string;
}

export function personaRunTraceId(run?: Record<string, any>): string;
export function personaRunOperatorEntryId(run?: Record<string, any>): string;
export function transcriptEntriesFromPersonaRun(run?: Record<string, any>): PersonaRunTranscriptEntry[];
export function finalEntryFromPersonaRun(run?: Record<string, any>): PersonaRunTranscriptEntry | null;