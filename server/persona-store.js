import fs from 'node:fs';
import path from 'node:path';

function normalizeRecord(entry = {}, previous = {}) {
  const slug = String(entry.slug || previous.slug || '').trim();
  if (!slug) return null;
  return {
    id: `yume:${slug}`,
    slug,
    source: 'yume',
    name: String(entry.name || previous.name || slug).trim(),
    model: String(entry.model ?? previous.model ?? '').trim(),
    enabled: entry.enabled !== undefined ? Boolean(entry.enabled) : previous.enabled !== false,
    cachedVersion: entry.cachedVersion ?? previous.cachedVersion ?? null,
    cachedSystemPrompt: entry.cachedSystemPrompt ?? previous.cachedSystemPrompt ?? null,
    cachedAt: entry.cachedAt ?? previous.cachedAt ?? null,
    addedAt: previous.addedAt || entry.addedAt || new Date().toISOString(),
  };
}

function readPersonaList(fileSystem, filePath) {
  try {
    const parsed = JSON.parse(fileSystem.readFileSync(filePath, 'utf8'));
    const records = Array.isArray(parsed) ? parsed : parsed?.personaAgents;
    return Array.isArray(records) ? records.map((entry) => normalizeRecord(entry)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function createPersonaStore({
  stateDir = path.resolve(process.cwd(), '.luca'),
  fileSystem = fs,
} = {}) {
  const statePath = path.join(stateDir, 'personas.json');
  const legacyPath = path.join(stateDir, 'system-state.json');
  const hasPersonaFile = fileSystem.existsSync(statePath);
  let records = readPersonaList(fileSystem, statePath);
  if (!hasPersonaFile) records = readPersonaList(fileSystem, legacyPath);

  function persist() {
    fileSystem.mkdirSync(stateDir, { recursive: true });
    const tempPath = `${statePath}.${process.pid}.tmp`;
    fileSystem.writeFileSync(tempPath, `${JSON.stringify({ version: 1, personaAgents: records }, null, 2)}\n`, 'utf8');
    fileSystem.renameSync(tempPath, statePath);
  }

  if (!hasPersonaFile && records.length) persist();

  return {
    list() {
      return records.map((entry) => ({ ...entry }));
    },
    upsert(entry = {}) {
      const slug = String(entry.slug || '').trim();
      const previous = records.find((record) => record.slug === slug) || {};
      const record = normalizeRecord(entry, previous);
      if (!record) return null;
      records = [record, ...records.filter((item) => item.slug !== record.slug)].slice(0, 50);
      persist();
      return { ...record };
    },
    remove(slugValue) {
      const slug = String(slugValue || '').trim();
      const before = records.length;
      records = records.filter((record) => record.slug !== slug);
      if (records.length === before) return false;
      persist();
      return true;
    },
  };
}
