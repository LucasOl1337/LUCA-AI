// VISUAL_STAGE_V1 — pós-etapa de artefatos no modo equipe (charts, relatório, imagens).
// A persona Yume `especialista-visual` planeja em JSON; o runtime materializa e guarda.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import {
  IMAGE_GENERATION_MODEL,
  sanitizeImageGenerationModel,
  VISUAL_PERSONA_SLUG,
} from './config.js';

export { VISUAL_PERSONA_SLUG };

export const MAX_VISUAL_CHARTS = 3;
export const MAX_VISUAL_IMAGES = 2;
export const MAX_VISUAL_REPORT_CHARS = 12_000;
export const MAX_IMAGE_PROMPT_CHARS = 2_000;
export const MAX_CHART_ITEMS = 8;

const ALLOWED_CHART_TYPES = new Set(['pie', 'tower', 'bar', 'line']);
const ALLOWED_ASPECT = new Set(['1:1', '16:9', '9:16', '4:3', '3:4']);

function workspacesRoot() {
  const rootStateDir = path.resolve(process.env.LUCA_DATA_DIR || path.resolve(process.cwd(), '.luca'));
  return path.join(rootStateDir, 'workspaces');
}

function safeDirSegment(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 32);
}

function clip(text, max) {
  const value = String(text || '').trim();
  if (!value) return '';
  return value.length > max ? value.slice(0, max).trimEnd() : value;
}

function uniqueId(prefix) {
  return `${prefix}_${randomBytes(4).toString('hex')}`;
}

function artifactsDir(userId, traceId) {
  return path.join(
    workspacesRoot(),
    safeDirSegment(userId),
    'visual-artifacts',
    safeDirSegment(traceId),
  );
}

function extractJsonObject(text = '') {
  const source = String(text || '').trim();
  if (!source) return null;
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = (fenced || source).trim();
  try {
    const parsed = JSON.parse(candidate);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    // fall through
  }
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    return null;
  }
  return null;
}

function normalizeChartItems(items = []) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => {
      if (item && typeof item === 'object') {
        const label = clip(item.label || item.name || item.title || `item ${index + 1}`, 80);
        const value = Number(item.value ?? item.count ?? 0);
        if (!label || !Number.isFinite(value)) return null;
        return { label, value };
      }
      const text = String(item || '').trim();
      if (!text) return null;
      const match = text.match(/^(.+?)[\s:=|-]+(\d+(?:\.\d+)?)$/);
      return {
        label: clip(match ? match[1] : text, 80),
        value: match ? Number(match[2]) : 1,
      };
    })
    .filter(Boolean)
    .slice(0, MAX_CHART_ITEMS);
}

function normalizeChart(raw = {}, index = 0) {
  const typeRaw = String(raw.type || 'tower').trim().toLowerCase();
  const type = ALLOWED_CHART_TYPES.has(typeRaw) ? (typeRaw === 'bar' ? 'tower' : typeRaw) : 'tower';
  const items = normalizeChartItems(raw.items);
  if (!items.length) return null;
  return {
    id: clip(raw.id, 48) || uniqueId(`chart${index + 1}`),
    title: clip(raw.title || raw.label || `Gráfico ${index + 1}`, 120),
    type,
    items,
    rationale: clip(raw.rationale || raw.reason || '', 280),
  };
}

function normalizeImageSpec(raw = {}, index = 0) {
  const prompt = clip(raw.prompt || raw.description || '', MAX_IMAGE_PROMPT_CHARS);
  if (!prompt) return null;
  const aspect = String(raw.aspect_ratio || raw.aspectRatio || '16:9').trim();
  return {
    id: clip(raw.id, 48) || uniqueId(`img${index + 1}`),
    title: clip(raw.title || `Imagem ${index + 1}`, 120),
    prompt,
    aspectRatio: ALLOWED_ASPECT.has(aspect) ? aspect : '16:9',
    style: clip(raw.style || 'infographic', 40) || 'infographic',
  };
}

function normalizeReport(raw = {}, fallbackTitle = 'Relatório visual') {
  if (!raw || typeof raw !== 'object') return null;
  const markdown = clip(raw.markdown || raw.body || raw.content || '', MAX_VISUAL_REPORT_CHARS);
  if (!markdown) return null;
  return {
    id: clip(raw.id, 48) || uniqueId('report'),
    title: clip(raw.title || fallbackTitle, 160) || fallbackTitle,
    markdown,
  };
}

export function parseVisualPlanOutput(output = '', { mission = '' } = {}) {
  const text = String(output || '').trim();
  const parsed = extractJsonObject(text);
  if (!parsed) {
    if (!text) return null;
    return {
      summary: clip(text, 400),
      report: {
        id: uniqueId('report'),
        title: 'Relatório da etapa visual',
        markdown: clip(text, MAX_VISUAL_REPORT_CHARS),
      },
      charts: [],
      images: [],
      imageEngine: null,
      source: 'text-fallback',
    };
  }

  const charts = (Array.isArray(parsed.charts) ? parsed.charts : [])
    .map((item, index) => normalizeChart(item, index))
    .filter(Boolean)
    .slice(0, MAX_VISUAL_CHARTS);

  const images = (Array.isArray(parsed.images) ? parsed.images : [])
    .map((item, index) => normalizeImageSpec(item, index))
    .filter(Boolean)
    .slice(0, MAX_VISUAL_IMAGES);

  const report = normalizeReport(parsed.report, clip(mission, 80) || 'Relatório visual')
    || (parsed.markdown ? normalizeReport({ title: parsed.title, markdown: parsed.markdown }) : null);

  return {
    summary: clip(parsed.summary || parsed.overview || '', 600),
    report,
    charts,
    images,
    imageEngine: parsed.imageEngine || parsed.image_model || parsed.engine || null,
    source: 'json',
  };
}

/**
 * Plano inutilizável para artefatos ricos (sem JSON ou fallback textual):
 * o runtime deve re-promptar a persona uma vez antes de aceitar degradação.
 */
export function visualPlanNeedsRetry(plan) {
  if (!plan) return true;
  if (plan.source === 'text-fallback') return true;
  return !plan.report && !plan.charts?.length && !plan.images?.length;
}

export function buildVisualRetryContext(previousOutput = '') {
  const excerpt = clip(previousOutput, 1_500);
  return [
    '## Correção obrigatória da etapa visual',
    'Sua resposta anterior NÃO seguiu o contrato: era texto/markdown em vez de JSON válido de artefatos.',
    'Responda novamente SOMENTE com o objeto JSON combinado (summary, report, charts, images, imageEngine), sem nenhum texto fora do JSON.',
    excerpt ? `Resposta anterior (para referência do conteúdo, não do formato):\n${excerpt}` : '',
  ].filter(Boolean).join('\n');
}

function writeBinaryArtifact(dir, artifactId, buffer, mimeType) {
  fs.mkdirSync(dir, { recursive: true });
  const ext = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png';
  const fileName = `${artifactId}.${ext}`;
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, buffer);
  const metaPath = path.join(dir, `${artifactId}.json`);
  const meta = {
    id: artifactId,
    fileName,
    mimeType,
    size: buffer.length,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  return meta;
}

export function readVisualArtifactFile(userId, traceId, artifactId) {
  const id = String(artifactId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!id) return null;
  const dir = artifactsDir(userId, traceId);
  const metaPath = path.join(dir, `${id}.json`);
  if (!fs.existsSync(metaPath)) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const filePath = path.join(dir, meta.fileName || `${id}.png`);
    if (!fs.existsSync(filePath)) return null;
    return {
      ...meta,
      buffer: fs.readFileSync(filePath),
    };
  } catch {
    return null;
  }
}

/**
 * Materializa o plano visual: charts/report em JSON + imagens via 9Router.
 * Falha de imagem vira partial; não derruba a rodada da equipe.
 */
export async function materializeVisualPack({
  mission = '',
  personaOutput = '',
  ownerId,
  traceId,
  imageModel = IMAGE_GENERATION_MODEL,
  callImage = null,
  generateImages = true,
  retried = false,
} = {}) {
  const plan = parseVisualPlanOutput(personaOutput, { mission });
  if (!plan) {
    return {
      status: 'skipped',
      reason: 'empty_visual_output',
      summary: '',
      report: null,
      charts: [],
      images: [],
      imageEngine: null,
      errors: [],
    };
  }

  const engine = sanitizeImageGenerationModel(plan.imageEngine || imageModel, IMAGE_GENERATION_MODEL);
  const errors = [];
  let images = [];

  if (generateImages && typeof callImage === 'function' && plan.images.length) {
    const dir = artifactsDir(ownerId, traceId);
    // Paralelo: cada imagem falha isolada; ordem do plano preservada no resultado.
    images = await Promise.all(plan.images.map(async (spec) => {
      const base = {
        id: spec.id,
        kind: 'image',
        title: spec.title,
        prompt: spec.prompt,
        aspectRatio: spec.aspectRatio,
        style: spec.style,
      };
      try {
        const result = await callImage({
          prompt: spec.prompt,
          model: engine,
          n: 1,
          responseFormat: 'b64_json',
          aspectRatio: spec.aspectRatio,
          resolution: '1k',
        });
        const first = result?.images?.[0];
        if (!first?.b64Json && !first?.url) {
          throw new Error('image_payload_missing');
        }
        if (first.b64Json) {
          const buffer = Buffer.from(first.b64Json, 'base64');
          if (buffer.length < 32) throw new Error('image_too_small');
          const meta = writeBinaryArtifact(dir, spec.id, buffer, 'image/png');
          return {
            ...base,
            mimeType: meta.mimeType,
            size: meta.size,
            url: `/api/luca-ai/visual-artifacts/${encodeURIComponent(traceId)}/${encodeURIComponent(spec.id)}`,
            model: result.model || engine,
            status: 'ok',
          };
        }
        return {
          ...base,
          mimeType: 'image/*',
          size: 0,
          url: first.url,
          model: result.model || engine,
          status: 'ok',
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ id: spec.id, error: message });
        return { ...base, status: 'failed', error: message };
      }
    }));
  } else if (plan.images.length && !generateImages) {
    for (const spec of plan.images) {
      images.push({
        id: spec.id,
        kind: 'image',
        title: spec.title,
        prompt: spec.prompt,
        aspectRatio: spec.aspectRatio,
        style: spec.style,
        status: 'skipped',
        error: 'image_generation_disabled',
      });
    }
  }

  const charts = plan.charts.map((chart) => ({
    id: chart.id,
    kind: 'chart',
    title: chart.title,
    type: chart.type,
    items: chart.items,
    rationale: chart.rationale,
    status: 'ok',
  }));

  const report = plan.report
    ? {
        id: plan.report.id,
        kind: 'report',
        title: plan.report.title,
        markdown: plan.report.markdown,
        status: 'ok',
      }
    : null;

  const hasOkImage = images.some((item) => item.status === 'ok');
  const hasFailedImage = images.some((item) => item.status === 'failed');
  const hasContent = Boolean(report || charts.length || hasOkImage);
  let status = 'skipped';
  if (hasContent && !hasFailedImage && !errors.length) status = 'complete';
  else if (hasContent) status = 'partial';
  else if (errors.length) status = 'failed';

  return {
    status,
    summary: plan.summary,
    report,
    charts,
    images,
    imageEngine: engine,
    planSource: plan.source,
    retried: Boolean(retried),
    errors,
    generatedAt: new Date().toISOString(),
  };
}
