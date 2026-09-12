import { formatLabTime, parseLabSite, type LabCase } from '../../shared/lab-telemetry.js';

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
export const categories: Record<Category, string> = { operational: 'Operacional', mechanical: 'Mecânica', environmental: 'Ambiental', combined: 'Combinada', inconclusive: 'Inconclusiva' };
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
  const esc = (value: unknown) => String(value ?? 'Não informado').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
  const paragraphs = (value: unknown): string => {
    if (Array.isArray(value)) return `<ul>${value.map(item => `<li>${paragraphs(item)}</li>`).join('')}</ul>`;
    if (value && typeof value === 'object') return `<dl>${Object.entries(value).map(([key, item]) => `<dt>${esc(key)}</dt><dd>${paragraphs(item)}</dd>`).join('')}</dl>`;
    return esc(value);
  };
  const events = labCase.events.map(event => `<tr><td>${esc(formatLabTime(event.elapsedMs))}</td><td>${esc(event.title)}</td><td>${esc(event.description)}</td></tr>`).join('');
  const conclusions = record?.conclusions || [];
  const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Relatório · ${esc(labCase.title)}</title><style>body{max-width:960px;margin:48px auto;padding:0 24px;color:#20352f;font:15px/1.65 system-ui}h1{font-size:32px}h2{border-top:1px solid #ced8d3;padding-top:24px;margin-top:36px}small{color:#556b62}table{border-collapse:collapse;width:100%}td,th{text-align:left;border-bottom:1px solid #dce4de;padding:10px;vertical-align:top}dt{font-weight:600}dd{margin-left:18px;white-space:pre-wrap}article{padding:16px;border:1px solid #dce4de;margin:12px 0;break-inside:avoid}p{white-space:pre-wrap}@media print{body{margin:0}button{display:none}}</style><button onclick="window.print()">Imprimir / salvar PDF</button><small>LUCA-AI · LABORATÓRIO VIRTUAL · SOMPO</small><h1>${esc(labCase.title)}</h1><p>Caso ${esc(record?.id || labCase.id)}\nResponsável pela exportação: ${esc(author)}\nExportado em: ${esc(new Date().toLocaleString('pt-BR'))}</p><h2>Origem e cobertura</h2><p>Arquivo: ${esc(labCase.fileName)}\nMáquina: ${esc(labCase.machineId)}\nInício: ${esc(labCase.startedAt)} · Duração: ${esc(formatLabTime(labCase.durationMs))}\n${labCase.samples.length} amostras. Dados ${labCase.synthetic ? 'sintéticos' : 'importados'}.</p><p>Fontes: CAN/ECU, GNSS, IMU/INS e sensores externos conforme o dicionário associado. Ausências são preservadas. A reconstrução mantém a última amostra até a seguinte e não estima posição durante lacunas.</p><p>${esc(labCase.manifest?.map_warning || 'Geometrias associadas ao arquivo pelo analista. Sem imagem de satélite fornecida.')}</p>${paragraphs(labCase.warnings)}<h2>Área e imagem aérea</h2>${paragraphs({ area: labCase.manifest?.site || "Não identificada", imagem: labCase.manifest?.satellite || "Não fornecida", relevo: labCase.manifest?.elevation || "Não carregado", camadas: labCase.polygons.map(p => ({ id: p.id, papel: p.role })) })}<h2>Eventos calculados e evidências</h2><table><thead><tr><th>Tempo</th><th>Evento</th><th>Evidência</th></tr></thead><tbody>${events || '<tr><td colspan="3">Nenhum evento pelas regras aplicáveis.</td></tr>'}</tbody></table><h2>Análises e versões</h2>${record?.analyses.length ? record.analyses.map(a => `<article><h3>Análise v${esc(a.version)} · ${esc(a.status)}</h3>${paragraphs(a)}</article>`).join('') : '<p>Nenhuma análise de IA executada.</p>'}<h2>Conclusão humana e versões</h2>${conclusions.length ? conclusions.map(c => `<article><h3>Conclusão v${esc(c.version)} · ${esc(categories[c.category])}</h3><p>${esc(c.observations)}</p><p>Ação registrada: ${esc(c.action)}\nRegistro: ${esc(c.createdAt)}</p>${paragraphs(c.hypothesisReviews)}</article>`).join('') : '<p>Nenhuma conclusão registrada.</p>'}<h2>Limitações</h2><p>Eventos indicam condições observadas, não comprovam causa ou culpa. Limites do pacote sintético são didáticos. Ações registradas não enviam mensagens nem comandos à máquina.</p></html>`;
  downloadFile(html, `relatorio-${record?.id || labCase.id}.html`, 'text/html;charset=utf-8');
}
