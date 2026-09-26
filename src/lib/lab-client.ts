import { LAB_CONCLUSION_CATEGORIES, renderLabReport } from '../../shared/lab-report.js';
import { parseLabSite, type LabCase } from '../../shared/lab-telemetry.js';

async function loadSiteFolder(folder: string) {
  const responses = await Promise.all(['manifest.json', 'mapa.geojson'].map(file => fetch(`/datasets/${folder}/${file}`)));
  // The public repository omits the county's restricted geographic data.
  if (responses.some(response => response.status === 404 || response.headers.get('content-type')?.includes('text/html'))) return null;
  if (responses.some(response => !response.ok)) throw new Error('Não foi possível carregar a fazenda. Recarregue a página ou escolha os arquivos da sua área.');
  const [manifest, map] = await Promise.all(responses.map(response => response.json()));
  return parseLabSite(manifest, map);
}

export async function loadDefaultLabSite() {
  return await loadSiteFolder('frying-pan-farm') ?? await loadSiteFolder('piracicaba-artemis');
}

export const exampleMetadata = {
  manifest: '/datasets/laboratorio-virtual-v1/manifest.json',
  map: '/datasets/laboratorio-virtual-v1/mapa.geojson',
  schema: '/datasets/laboratorio-virtual-v1/schema.json',
};
export interface LabExample { title: string; description: string; fileName: string; url: string; kind: string; metadata?: { manifest: string; map: string; schema?: string } }
export const LAB_EXAMPLES: LabExample[] = [
  { title: 'Operação normal', description: 'Um percurso de referência, sem alertas.', fileName: '01-operacao-normal.csv', url: '/datasets/laboratorio-virtual-v1/01-operacao-normal.csv', kind: 'normal' },
  { title: 'Cerca e proximidade da água', description: 'Explore os limites e as duas voltas do percurso.', fileName: '02-cerca-e-agua.csv', url: '/datasets/laboratorio-virtual-v1/02-cerca-e-agua.csv', kind: 'water' },
  { title: 'Aquecimento e falha de GPS', description: 'Uma tendência térmica e 3 segundos sem posição.', fileName: '03-aquecimento-e-falha-gps.csv', url: '/datasets/laboratorio-virtual-v1/03-aquecimento-e-falha-gps.csv', kind: 'heat' },
  { title: 'Piracicaba · colheita normal', description: 'Passadas de colheita junto ao rio Piracicaba; cruza as faixas de água.', fileName: '01-colheita-normal.csv', url: '/datasets/piracicaba-artemis/01-colheita-normal.csv', kind: 'piracicaba-normal', metadata: { manifest: '/datasets/piracicaba-artemis/manifest.json', map: '/datasets/piracicaba-artemis/mapa.geojson' } },
  { title: 'Piracicaba · declive e tombamento', description: 'Entrada no polígono de declive; inclinação sobe até o tombamento.', fileName: '02-declive-tombamento.csv', url: '/datasets/piracicaba-artemis/02-declive-tombamento.csv', kind: 'piracicaba-slope', metadata: { manifest: '/datasets/piracicaba-artemis/manifest.json', map: '/datasets/piracicaba-artemis/mapa.geojson' } },
];

export type Category = 'operational' | 'mechanical' | 'environmental' | 'combined' | 'inconclusive';
export const categories: Record<Category, string> = LAB_CONCLUSION_CATEGORIES;
export interface HypothesisReview { analysisId: string; hypothesisId: string; stance: 'agree' | 'disagree' | 'pending'; note: string }
export interface ConclusionDraft { observations: string; category: Category; action: string; hypothesisReviews: HypothesisReview[] }
export interface Conclusion extends ConclusionDraft { id: string; version: number; createdAt: string; [key: string]: unknown }
export interface Hypothesis { id: string; axis: string; title: string; explanation: string; evidence: { elapsedMs: number; description: string; values: Record<string, unknown> }[]; limitations: string[]; additionalInformation: string[] }
export interface LabAnalysis { id: string; version: number; status: string; createdAt: string; error?: string; focus?: string; hypotheses: Hypothesis[]; axes: { id: string; title: string; status: string; summary: string; limitations: string[]; additionalInformation: string[]; hypotheses: Hypothesis[]; error?: string }[] }
export interface SavedCase { id: string; name: string; sourceName: string; rawCsv: string; metadata: Record<string, unknown> | null; map: Record<string, unknown> | null; schema?: Record<string, unknown> | null; createdAt: string; updatedAt: string; analyses: LabAnalysis[]; conclusions: Conclusion[] }
export interface CaseSummary { id: string; name: string; sourceName: string; updatedAt: string; analysisCount: number; conclusionCount: number }

export async function labRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/lab/cases${path}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || (response.status === 401 ? 'Entre novamente para recuperar os casos da sua conta.' : 'Não foi possível acessar o laboratório. Tente novamente.'));
    Object.assign(error, { payload });
    throw error;
  }
  return payload as T;
}

export function downloadFile(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function exportLabReport(labCase: LabCase, record: SavedCase | null, author: string) {
  downloadFile(renderLabReport(labCase, record, author), `relatorio-${record?.id || labCase.id}.html`, 'text/html;charset=utf-8');
}
