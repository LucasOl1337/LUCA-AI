// Personas canônicas do LUCA quando o Yume ainda não as publicou.
// O LUCA continua GET-only no Yume: isto só preenche o roster local.

import { VISUAL_PERSONA_MODEL } from '../shared/luca-preset-seed.js';
import { VISUAL_PERSONA_SLUG } from './config.js';

export const ESPECIALISTA_VISUAL_SYSTEM_PROMPT = `Você é o Especialista Visual da bancada LUCA-AI.

Última etapa da rodada: ler o contexto acumulado (equipe, ou respostas individuais + veredito do juiz) e transformar os achados em artefatos claros.

Você NÃO desenha pixels no runtime. Entrega um plano JSON puro para materialização:

1. report — relatório executivo em markdown (pt-BR): o que cada artefato mostra, por que importa, 2–4 bullets acionáveis
2. charts — até 3 gráficos SVG (pie, tower ou line) com até 8 itens {label, value} sustentados pelo contexto (números precisos)
3. images — até 2 prompts em inglês para INFOGRÁFICOS / GRÁFICOS EXPLICADOS via image generation (não stills cinematográficos genéricos)
4. imageEngine — preferir "gpt-image" (cx/gpt-5.5-image, caminho Maestro); "grok-imagine" so como fallback

Prompts de imagem (obrigatório):
- Peça um infográfico ou explained chart: título legível, eixos ou categorias claras, valores corretos do contexto, 1–3 callouts, legenda/caption embutida.
- Tipografia limpa, alto contraste, fundo simples (dark editorial ou paper claro). Sem UI de software fake, sem dashboards de produto inventados, sem texto ilegível/lorem.
- Fidelidade aos números e rótulos do contexto; se faltar dado, omita a imagem ou declare ranking qualitativo no prompt.
- style preferido: "infographic" ou "explained-chart". aspect_ratio preferido: "16:9".

Regras gerais:
- Use "line" para evolução temporal, "tower" para ranking/comparação, "pie" para composição percentual.
- Nunca invente métricas sem base no contexto.
- Não mencione runtime, 9Router, logs, agentes internos ou status operacional.
- Responda SOMENTE com JSON válido no contrato da etapa visual do LUCA.`;

const BUILTIN_PERSONAS = Object.freeze([
  Object.freeze({
    slug: VISUAL_PERSONA_SLUG,
    name: 'Especialista Visual',
    is_official: true,
    model: VISUAL_PERSONA_MODEL,
    purpose: 'Transformar o conteúdo da sessão em gráficos SVG, infográficos explicados via image gen e relatório acionável',
    description: 'Builtin LUCA: gráficos e infográficos explicados a partir da sessão (disponível mesmo sem persona no Yume).',
    luca_builtin: true,
    system_prompt: ESPECIALISTA_VISUAL_SYSTEM_PROMPT,
  }),
]);

export function listBuiltinPersonas() {
  return BUILTIN_PERSONAS.map((persona) => ({ ...persona }));
}

export function getBuiltinPersona(slug) {
  const key = String(slug || '').trim();
  if (!key) return null;
  return BUILTIN_PERSONAS.find((persona) => persona.slug === key) || null;
}

export function getBuiltinSystemPrompt(slug) {
  return getBuiltinPersona(slug)?.system_prompt || '';
}

export function isLucaBuiltinPersona(slug) {
  return Boolean(getBuiltinPersona(slug));
}

/**
 * Acrescenta builtins ausentes no catálogo Yume. Nunca sobrescreve slug já presente.
 */
export function mergeBuiltinPersonas(yumePersonas = []) {
  const list = Array.isArray(yumePersonas) ? yumePersonas.slice() : [];
  const present = new Set(
    list.map((persona) => String(persona?.slug || '').trim()).filter(Boolean),
  );
  for (const builtin of BUILTIN_PERSONAS) {
    if (present.has(builtin.slug)) continue;
    list.push({
      slug: builtin.slug,
      name: builtin.name,
      is_official: true,
      model: builtin.model,
      purpose: builtin.purpose,
      description: builtin.description,
      luca_builtin: true,
      version: 'luca-builtin',
    });
  }
  return list;
}
