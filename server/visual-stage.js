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
  const prompt = clip(
    raw.prompt || raw.description || raw.image_prompt || raw.imagePrompt || '',
    MAX_IMAGE_PROMPT_CHARS,
  );
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

/**
 * Quando a persona omite images[] (comum), o runtime ainda precisa gerar
 * pelo menos um infográfico a partir do restante do plano / missão.
 */
export function synthesizeVisualImageSpecs(plan = {}, { mission = '' } = {}) {
  if (Array.isArray(plan.images) && plan.images.length) return plan.images;
  const chartBits = (Array.isArray(plan.charts) ? plan.charts : [])
    .slice(0, 3)
    .map((chart) => {
      const items = (Array.isArray(chart.items) ? chart.items : [])
        .slice(0, 6)
        .map((item) => `${item.label}: ${item.value}`)
        .join(', ');
      return items ? `${chart.title} (${chart.type || 'chart'}) — ${items}` : chart.title;
    })
    .filter(Boolean);
  const topic = clip(
    plan.summary
      || plan.report?.title
      || plan.report?.markdown
      || mission
      || 'Key findings from the session',
    420,
  );
  const dataLine = chartBits.length
    ? `Include these exact data points as a clean explained chart: ${chartBits.join('; ')}.`
    : 'Turn the findings into one clear explained chart or ranked comparison with readable labels.';
  const prompt = clip([
    'Editorial infographic / explained chart, not a photo.',
    `Topic: ${topic}`,
    dataLine,
    'Readable title, clear category labels, accurate values, 1-3 short callouts, embedded legend/caption,',
    'high contrast, clean sans typography, dark editorial or paper background,',
    'no fake software UI, no dashboard chrome, no illegible text, no watermark.',
  ].join(' '), MAX_IMAGE_PROMPT_CHARS);

  return [{
    id: uniqueId('img'),
    title: clip(plan.report?.title || plan.summary || 'Infográfico da sessão', 120) || 'Infográfico da sessão',
    prompt,
    aspectRatio: '16:9',
    style: 'infographic',
    synthesized: true,
  }];
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

  const rawImages = Array.isArray(parsed.images)
    ? parsed.images
    : Array.isArray(parsed.stills)
      ? parsed.stills
      : (parsed.image ? [parsed.image] : []);
  const images = rawImages
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
 * Também re-tenta quando o JSON veio sem images — a etapa visual precisa gerar imagem.
 */
export function visualPlanNeedsRetry(plan) {
  if (!plan) return true;
  if (plan.source === 'text-fallback') return true;
  if (!plan.report && !plan.charts?.length && !plan.images?.length) return true;
  return !plan.images?.length;
}

export function buildVisualRetryContext(previousOutput = '') {
  const excerpt = clip(previousOutput, 1_500);
  return [
    '## Correção obrigatória da etapa visual',
    'Sua resposta anterior NÃO seguiu o contrato de artefatos.',
    'Responda novamente SOMENTE com o objeto JSON combinado (summary, report, charts, images, imageEngine), sem nenhum texto fora do JSON.',
    'OBRIGATÓRIO: inclua pelo menos 1 item em images[] com prompt em inglês de infográfico/explained-chart (título legível, labels, callouts, legenda). Não diga que não há imagens — invente um gráfico fiel ao contexto.',
    excerpt ? `Resposta anterior (para referência do conteúdo, não do formato):\n${excerpt}` : '',
  ].filter(Boolean).join('\n');
}

function writeBinaryArtifact(dir, artifactId, buffer, mimeType) {
  fs.mkdirSync(dir, { recursive: true });
  const ext = mimeType === 'image/jpeg'
    ? 'jpg'
    : mimeType === 'image/webp'
      ? 'webp'
      : mimeType === 'image/svg+xml'
        ? 'svg'
        : 'png';
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

function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapSvgText(value = '', maxChars = 54) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
    if (lines.length >= 4) break;
  }
  if (current && lines.length < 4) lines.push(current);
  return lines;
}

/**
 * Infográfico SVG local quando o 9Router não tem provider de imagem.
 * Garante que a etapa visual sempre poste um artefato visual no chat.
 */
export function renderLocalInfographicSvg({
  title = 'Infográfico da sessão',
  summary = '',
  charts = [],
  prompt = '',
} = {}) {
  const chart = (Array.isArray(charts) ? charts : []).find((item) => Array.isArray(item?.items) && item.items.length)
    || null;
  const items = (chart?.items || [])
    .slice(0, 6)
    .map((item) => ({
      label: clip(item.label || 'Item', 28) || 'Item',
      value: Number(item.value) || 0,
    }));
  const maxValue = Math.max(1, ...items.map((item) => item.value));
  const heading = clip(title || chart?.title || 'Infográfico da sessão', 72) || 'Infográfico da sessão';
  const subtitle = clip(summary || chart?.rationale || prompt || 'Achados da rodada', 180);
  const barWidth = 920;
  const barRows = items.map((item, index) => {
    const y = 210 + index * 58;
    const width = Math.max(24, Math.round((item.value / maxValue) * 620));
    return `
      <text x="80" y="${y + 18}" fill="#9fb4c8" font-size="18" font-family="Segoe UI, Arial, sans-serif">${escapeXml(item.label)}</text>
      <rect x="280" y="${y}" width="${barWidth - 280}" height="28" rx="8" fill="rgba(255,255,255,0.06)"/>
      <rect x="280" y="${y}" width="${width}" height="28" rx="8" fill="url(#barGrad)"/>
      <text x="${290 + width}" y="${y + 20}" fill="#e8f2ff" font-size="18" font-family="Segoe UI, Arial, sans-serif">${escapeXml(String(item.value))}</text>
    `;
  }).join('\n');

  const fallbackBlocks = items.length
    ? barRows
    : wrapSvgText(subtitle || 'Sem série numérica — resumo visual da sessão.', 48)
      .map((line, index) => `<text x="80" y="${240 + index * 34}" fill="#d7e6f5" font-size="22" font-family="Segoe UI, Arial, sans-serif">${escapeXml(line)}</text>`)
      .join('\n');

  const captionLines = wrapSvgText(subtitle, 70);
  const caption = captionLines
    .map((line, index) => `<text x="80" y="${620 + index * 26}" fill="#8fa3b7" font-size="16" font-family="Segoe UI, Arial, sans-serif">${escapeXml(line)}</text>`)
    .join('\n');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720" role="img" aria-label="${escapeXml(heading)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1220"/>
      <stop offset="100%" stop-color="#152238"/>
    </linearGradient>
    <linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#0a84ff"/>
      <stop offset="100%" stop-color="#64d2ff"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)"/>
  <circle cx="1180" cy="80" r="120" fill="rgba(10,132,255,0.12)"/>
  <circle cx="80" cy="660" r="160" fill="rgba(100,210,255,0.08)"/>
  <text x="80" y="78" fill="#64d2ff" font-size="16" letter-spacing="3" font-family="Segoe UI, Arial, sans-serif">LUCA AI · ARTEFATO VISUAL</text>
  <text x="80" y="130" fill="#f4f8ff" font-size="40" font-weight="700" font-family="Segoe UI, Arial, sans-serif">${escapeXml(heading)}</text>
  <text x="80" y="168" fill="#9fb4c8" font-size="18" font-family="Segoe UI, Arial, sans-serif">${escapeXml(clip(chart?.title ? `Gráfico: ${chart.title}` : 'Infográfico gerado a partir da sessão', 90))}</text>
  ${fallbackBlocks}
  ${caption}
  <text x="80" y="700" fill="#607588" font-size="14" font-family="Segoe UI, Arial, sans-serif">fallback local · image gen indisponível no roteador</text>
</svg>`;
  return Buffer.from(svg, 'utf8');
}

export async function generateVisualImageWithFallback({
  callImage,
  engines = [],
  prompt,
  aspectRatio = '16:9',
  resolution = '1k',
  localTitle = 'Infográfico da sessão',
  localSummary = '',
  localCharts = [],
} = {}) {
  const uniqueEngines = [...new Set((Array.isArray(engines) ? engines : []).filter(Boolean))];
  const attempts = [];
  for (const engine of uniqueEngines) {
    if (typeof callImage !== 'function') break;
    try {
      const result = await callImage({
        prompt,
        model: engine,
        n: 1,
        responseFormat: 'b64_json',
        aspectRatio,
        resolution,
      });
      const first = result?.images?.[0];
      if (!first?.b64Json && !first?.url) throw new Error('image_payload_missing');
      return {
        source: 'router',
        model: result.model || engine,
        b64Json: first.b64Json || null,
        url: first.url || null,
        attempts,
      };
    } catch (error) {
      attempts.push({
        engine,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    source: 'local-infographic',
    model: 'local-infographic',
    svgBuffer: renderLocalInfographicSvg({
      title: localTitle,
      summary: localSummary,
      charts: localCharts,
      prompt,
    }),
    attempts,
  };
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
 * Serve a stored visual artifact. Meta is flattened onto the file object
 * (`file.mimeType`), not nested as `file.meta`. With X-Content-Type-Options:
 * nosniff, a fallback of application/octet-stream makes the browser refuse
 * to render the image on public share pages.
 */
export function sendVisualArtifact(res, file) {
  if (!file?.buffer) return false;
  res.setHeader('Content-Type', file.mimeType || 'image/png');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('Content-Length', String(file.buffer.length));
  res.send(file.buffer);
  return true;
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

  // Persona frequentemente devolve só summary/report sem images — sintetiza 1 prompt.
  const imageSpecs = synthesizeVisualImageSpecs(plan, { mission });
  const synthesizedImages = imageSpecs.some((item) => item.synthesized);

  const engine = sanitizeImageGenerationModel(plan.imageEngine || imageModel, IMAGE_GENERATION_MODEL);
  const errors = [];
  let images = [];

  if (generateImages && imageSpecs.length) {
    const dir = artifactsDir(ownerId, traceId);
    // Ordem igual ao Maestro: gpt-5.5-image → gpt-5.4-image → grok-imagine.
    const engines = [
      engine,
      IMAGE_GENERATION_MODEL,
      'cx/gpt-5.5-image',
      'cx/gpt-5.4-image',
      'cx/gpt-image-1',
      'xai/grok-imagine-image',
    ];
    // Paralelo: cada imagem falha isolada; ordem do plano preservada no resultado.
    // Se o 9Router não tiver provider de imagem, cai no infográfico SVG local.
    images = await Promise.all(imageSpecs.map(async (spec) => {
      const base = {
        id: spec.id,
        kind: 'image',
        title: spec.title,
        prompt: spec.prompt,
        aspectRatio: spec.aspectRatio,
        style: spec.style,
        ...(spec.synthesized ? { synthesized: true } : {}),
      };
      try {
        const result = await generateVisualImageWithFallback({
          callImage: typeof callImage === 'function' ? callImage : null,
          engines,
          prompt: spec.prompt,
          aspectRatio: spec.aspectRatio,
          resolution: '1k',
          localTitle: spec.title || plan.report?.title || plan.summary || 'Infográfico da sessão',
          localSummary: plan.summary || plan.report?.markdown || mission,
          localCharts: plan.charts,
        });
        if (result.source === 'local-infographic' && result.svgBuffer) {
          const meta = writeBinaryArtifact(dir, spec.id, result.svgBuffer, 'image/svg+xml');
          return {
            ...base,
            mimeType: meta.mimeType,
            size: meta.size,
            url: `/api/luca-ai/visual-artifacts/${encodeURIComponent(traceId)}/${encodeURIComponent(spec.id)}`,
            model: result.model,
            status: 'ok',
            fallback: 'local-infographic',
            routerAttempts: result.attempts || [],
          };
        }
        if (result.b64Json) {
          const buffer = Buffer.from(result.b64Json, 'base64');
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
        if (result.url) {
          return {
            ...base,
            mimeType: 'image/*',
            size: 0,
            url: result.url,
            model: result.model || engine,
            status: 'ok',
          };
        }
        throw new Error('image_payload_missing');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ id: spec.id, error: message });
        return { ...base, status: 'failed', error: message };
      }
    }));
  } else if (imageSpecs.length && !generateImages) {
    for (const spec of imageSpecs) {
      images.push({
        id: spec.id,
        kind: 'image',
        title: spec.title,
        prompt: spec.prompt,
        aspectRatio: spec.aspectRatio,
        style: spec.style,
        ...(spec.synthesized ? { synthesized: true } : {}),
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
  const usedLocalFallback = images.some((item) => item.fallback === 'local-infographic');
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
    imageEngine: usedLocalFallback ? 'local-infographic' : engine,
    planSource: plan.source,
    synthesizedImages: Boolean(synthesizedImages),
    localImageFallback: Boolean(usedLocalFallback),
    retried: Boolean(retried),
    errors,
    generatedAt: new Date().toISOString(),
  };
}
