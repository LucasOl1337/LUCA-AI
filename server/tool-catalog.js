import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_RELATED_CATALOGS = [
  {
    project: 'TARS',
    catalogPath: path.resolve(process.cwd(), '..', 'TARS', 'ferramentas'),
    source: 'tars-tool-catalog-pattern',
  },
  {
    project: 'Yume',
    catalogPath: path.resolve(process.cwd(), '..', 'Yume', 'ferramentas'),
    source: 'yume-tool-catalog-loader-pattern',
  },
];

function strList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

function normalizeToolSpec(raw = {}, fallbackId = '') {
  const toolId = String(raw?.id || fallbackId).trim();
  if (!toolId) {
    throw new Error('missing id');
  }

  const invoke = raw?.invoke && typeof raw.invoke === 'object' && !Array.isArray(raw.invoke)
    ? raw.invoke
    : {};
  const parameters = raw?.parameters && typeof raw.parameters === 'object' && !Array.isArray(raw.parameters)
    ? raw.parameters
    : { type: 'object', properties: {} };
  const availability = String(raw?.availability || 'both').trim() || 'both';
  if (!['both', 'local', 'cloud'].includes(availability)) {
    throw new Error(`invalid availability: ${availability}`);
  }

  return {
    id: toolId,
    name: String(raw?.name || toolId).trim(),
    description: String(raw?.description || '').trim(),
    category: String(raw?.category || 'geral').trim(),
    kind: String(raw?.kind || 'tool').trim(),
    provider: String(raw?.provider || 'local').trim(),
    capabilities: strList(raw?.capabilities),
    tags: strList(raw?.tags),
    prompt_instruction: String(raw?.prompt_instruction || '').trim(),
    parameters,
    invoke,
    executable: raw?.executable === false ? false : Boolean(raw?.executable),
    availability,
    source: String(raw?.source || '').trim(),
  };
}

export function loadToolCatalogFromDir(dirPath) {
  const tools = [];
  const errors = [];

  if (!dirPath || !fs.existsSync(dirPath)) {
    return { tools, errors: [{ file: path.basename(dirPath || 'tool-catalog'), error: 'catalog directory not found' }] };
  }

  for (const fileName of fs.readdirSync(dirPath).filter((entry) => entry.endsWith('.json')).sort()) {
    const fullPath = path.join(dirPath, fileName);
    try {
      const raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      tools.push(normalizeToolSpec(raw, path.basename(fileName, '.json')));
    } catch (error) {
      errors.push({
        file: fileName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  tools.sort((a, b) => (
    a.category.localeCompare(b.category)
    || a.name.localeCompare(b.name)
    || a.id.localeCompare(b.id)
  ));

  return { tools, errors };
}

function relatedCatalogEntry(tool, project, catalogPath) {
  return {
    ...tool,
    id: `${project.toLowerCase()}:${tool.id}`,
    canonicalId: tool.id,
    project,
    catalogPath,
    advisory: true,
    executable: false,
    availability: 'local',
  };
}

function loadRelatedCatalogs(relatedCatalogs = []) {
  return relatedCatalogs.map((entry) => {
    const catalogPath = entry?.catalogPath;
    const project = String(entry?.project || path.basename(path.dirname(catalogPath || '')) || 'related').trim();
    const source = String(entry?.source || '').trim();
    const { tools, errors } = loadToolCatalogFromDir(catalogPath);
    return {
      project,
      source: source || null,
      catalogPath,
      count: tools.length,
      tools: tools.map((tool) => relatedCatalogEntry(tool, project, catalogPath)),
      errors,
    };
  });
}

export function buildToolCatalog({ mode = 'backend', catalogDir, relatedCatalogs = DEFAULT_RELATED_CATALOGS } = {}) {
  const runtime = mode === 'cloud' ? 'cloud' : 'local';
  const manifestDir = catalogDir || path.resolve(process.cwd(), 'server', 'tool-catalog-manifests');
  const { tools, errors } = loadToolCatalogFromDir(manifestDir);
  const visibleTools = tools.filter((tool) => tool.availability === 'both' || tool.availability === runtime);
  const related = runtime === 'local' ? loadRelatedCatalogs(relatedCatalogs) : [];
  const advisoryTools = related.flatMap((catalog) => catalog.tools);

  return {
    generatedAt: new Date().toISOString(),
    mode,
    source: 'yume-tool-catalog-loader-pattern',
    catalogPath: manifestDir,
    provenance: ['yume-tool-catalog-loader-pattern', 'tars-tool-catalog-pattern'],
    tools: visibleTools,
    count: visibleTools.length,
    advisoryTools,
    advisoryCount: advisoryTools.length,
    relatedCatalogs: related,
    errors,
  };
}
