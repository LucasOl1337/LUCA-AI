export const DEFAULT_ENGINE_MODEL = 'glm-5.1';
export const DEFAULT_MODEL_SELECTOR_KEY = 'default';

function cleanString(value) {
  return String(value ?? '').trim();
}

export function normalizeModelSelectorKey(value, fallback = DEFAULT_MODEL_SELECTOR_KEY) {
  const key = cleanString(value).toLowerCase().replace(/\s+/g, '-');
  if (!key) return fallback;
  if (!/^[a-z0-9][a-z0-9_.:-]{0,63}$/.test(key)) return fallback;
  return key;
}

export function sanitizeEngineModel(value, fallback = DEFAULT_ENGINE_MODEL) {
  const model = cleanString(value);
  if (!model || model.length > 160) return fallback;
  return model;
}

function parseOptions(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function resolveModelSelector(env = {}) {
  const defaultModel = sanitizeEngineModel(env.GLM_MODEL, DEFAULT_ENGINE_MODEL);
  const options = {
    [DEFAULT_MODEL_SELECTOR_KEY]: defaultModel,
  };

  for (const [rawKey, rawModel] of Object.entries(parseOptions(env.GLM_MODEL_OPTIONS))) {
    const key = normalizeModelSelectorKey(rawKey, '');
    const model = sanitizeEngineModel(rawModel, '');
    if (key && model) options[key] = model;
  }

  const requestedKey = normalizeModelSelectorKey(
    env.MODEL_SELECTOR_KEY ?? env.GLM_MODEL_SELECTOR ?? env.LUCA_MODEL_SELECTOR,
  );
  const hasRequestedKey = Object.prototype.hasOwnProperty.call(options, requestedKey);
  const key = hasRequestedKey ? requestedKey : DEFAULT_MODEL_SELECTOR_KEY;
  const model = sanitizeEngineModel(options[key], defaultModel);

  return {
    key,
    requestedKey,
    model,
    fallback: !hasRequestedKey,
    options: Object.entries(options).map(([optionKey, optionModel]) => ({
      key: optionKey,
      model: optionModel,
      selected: optionKey === key,
    })),
    source: 'model-selector-key',
  };
}

export function modelSelectorSummary(selector = {}) {
  const key = selector.key || DEFAULT_MODEL_SELECTOR_KEY;
  const model = selector.model || DEFAULT_ENGINE_MODEL;
  return selector.fallback && selector.requestedKey
    ? `${selector.requestedKey} -> ${model} (fallback ${key})`
    : `${key} -> ${model}`;
}
