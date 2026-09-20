// Seed puro (sem React): templates de equipe/individual embutidos.
// Frontend mapeia `icon` → Lucide; server grava no workspace no primeiro GET.
// Slugs devem existir no catálogo visível (Yume oficial, secundária ou builtin).
// Visual é opcional: persona oculta/ausente não bloqueia o restante da equipe.

export const VISUAL_PERSONA_SLUG = 'especialista-visual';
export const VISUAL_PERSONA_MODEL = 'cc/claude-fable-5(high)';
export const MAX_PARTICIPANTS = 5;
export const PRESET_ICON_IDS = ['sprout', 'hardhat', 'briefcase', 'swords', 'crown', 'stethoscope', 'users'];

// Alterna famílias e rotas do catálogo fechado para reduzir erro correlacionado
// e falso consenso. A etapa visual usa um default fixo próprio. Não incluir
// STRONGEST_JUDGE_MODEL aqui: o juiz precisa ser uma rota distinta das demais.
const DIVERSE_MODELS = [
  'cc/claude-opus-5(max)',
  'gcli/grok-4.6(high)',
  'cx/gpt-5.6-luna(xhigh)',
  'cc/claude-fable-5(medium)',
  'cx/gpt-5.6-sol(medium)',
  'gcli/grok-4.5(high)',
  'cc/claude-fable-5(max)',
  'cx/gpt-5.6-luna(max)',
  'cc/claude-opus-5(high)',
  'gcli/grok-4.6',
];
// Sol (max) é a rota de maior esforço da família GPT 5.6 mais nova; o perfil
// Ultra aponta para o mesmo ID, portanto não oferece capacidade adicional.
const STRONGEST_JUDGE_MODEL = 'cx/gpt-5.6-sol(max)';

function modelsFor(slugs) {
  return Object.fromEntries(slugs.map((slug, index) => [
    slug,
    slug === VISUAL_PERSONA_SLUG
      ? VISUAL_PERSONA_MODEL
      : DIVERSE_MODELS[index % DIVERSE_MODELS.length],
  ]));
}

function individualModels(participants, judge) {
  return {
    ...modelsFor(participants),
    [judge]: STRONGEST_JUDGE_MODEL,
    [VISUAL_PERSONA_SLUG]: VISUAL_PERSONA_MODEL,
  };
}

export const LUCA_TEAM_PRESET_SEED = [
  {
    id: 'conselho-estrategia',
    label: 'Conselho de Estratégia',
    description: 'Primeiros princípios e execução pragmática, com síntese e visuais para decisão.',
    icon: 'briefcase',
    assignments: {
      supervisor: ['lucas'],
      mission: ['tars'],
      execution: ['elon-musk', 'aurora'],
      approval: ['maestro-2'],
      display: ['pure-gpt-5-6-sol'],
      visual: [VISUAL_PERSONA_SLUG],
    },
    models: modelsFor([
      'lucas',
      'tars',
      'elon-musk',
      'aurora',
      'maestro-2',
      'pure-gpt-5-6-sol',
      VISUAL_PERSONA_SLUG,
    ]),
  },
  {
    id: 'squad-summoners-rift',
    label: "Squad Summoner's Rift",
    description: 'Noxus, Demacia e Vazio executando a missão com estilo e stills cinematográficos.',
    icon: 'swords',
    assignments: {
      supervisor: ['darius'],
      mission: ['jinx'],
      execution: ['zed', 'katarina', 'ahri'],
      approval: ['garen'],
      display: ['lux'],
      visual: [VISUAL_PERSONA_SLUG],
    },
    models: modelsFor(['darius', 'jinx', 'zed', 'katarina', 'ahri', 'garen', 'lux', VISUAL_PERSONA_SLUG]),
  },
];

export const LUCA_INDIVIDUAL_PRESET_SEED = [
  {
    id: 'conselho-de-ceos',
    label: 'Conselho de CEOs',
    description: 'Elon, Lucas e Aurora respondem isolados; o supervisor decide.',
    icon: 'crown',
    participants: ['elon-musk', 'lucas', 'aurora'],
    judge: 'maestro-2',
    models: individualModels(['elon-musk', 'lucas', 'aurora'], 'maestro-2'),
  },
  {
    id: 'mesa-tecnica',
    label: 'Mesa Técnica',
    description: 'TARS e GPT 5.6 SOL respondem; o Maestro audita o veredito.',
    icon: 'hardhat',
    participants: ['tars', 'pure-gpt-5-6-sol'],
    judge: 'maestro-2',
    models: individualModels(['tars', 'pure-gpt-5-6-sol'], 'maestro-2'),
  },
  {
    id: 'duelo-noxus-demacia',
    label: 'Duelo Noxus × Demacia',
    description: 'Darius, Katarina, Garen e Lux se enfrentam; o Maestro declara o vencedor.',
    icon: 'swords',
    participants: ['darius', 'katarina', 'garen', 'lux'],
    judge: 'maestro-2',
    models: individualModels(['darius', 'katarina', 'garen', 'lux'], 'maestro-2'),
  },
];
