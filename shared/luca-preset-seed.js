// Seed puro (sem React) — templates de equipe/individual embutidos.
// Frontend mapeia `icon` → Lucide; server grava no workspace no primeiro GET.

export const TEAM_ROLE_ORDER = ['supervisor', 'mission', 'execution', 'approval', 'display'];
export const MAX_EXECUTORS = 4;
export const MAX_PARTICIPANTS = 5;
export const PRESET_ICON_IDS = ['sprout', 'hardhat', 'briefcase', 'swords', 'crown', 'stethoscope', 'users'];

// Alterna famílias e rotas do catálogo fechado; até oito participantes recebem
// motores distintos para reduzir erro correlacionado e falso consenso.
const DIVERSE_MODELS = [
  'cc/claude-opus-4-8(max)',
  'gcli/grok-4.5-high',
  'kimi/k3',
  'cx/gpt-5.6-luna-xhigh',
  'cc/claude-fable-5',
  'cx/gpt-5.5-xhigh',
  'kimi/kimi-k3',
  'cx/gpt-5.6-sol-xhigh',
];
// Sol xhigh é a rota de maior esforço da família GPT 5.6 mais nova; o perfil
// Ultra aponta para o mesmo ID, portanto não oferece capacidade adicional.
const STRONGEST_JUDGE_MODEL = 'cx/gpt-5.6-sol-xhigh';

function modelsFor(slugs) {
  return Object.fromEntries(slugs.map((slug, index) => [slug, DIVERSE_MODELS[index % DIVERSE_MODELS.length]]));
}

function individualModels(participants, judge) {
  return { ...modelsFor(participants), [judge]: STRONGEST_JUDGE_MODEL };
}

export const LUCA_TEAM_PRESET_SEED = [
  {
    id: 'risco-agro',
    label: 'Equipe Risco Agro',
    description: 'ZARC, campo e indenização da safrinha, com dossiê executivo na entrega.',
    icon: 'sprout',
    assignments: {
      supervisor: ['supervisor-agentes-ia'],
      mission: ['planejador-missao'],
      execution: ['estrategista-risco-agro', 'especialista-zarc-seguro-rural', 'engenheiro-agricola'],
      approval: ['curador-personas'],
      display: ['relator-executivo-risco'],
    },
    models: modelsFor([
      'supervisor-agentes-ia',
      'planejador-missao',
      'estrategista-risco-agro',
      'especialista-zarc-seguro-rural',
      'engenheiro-agricola',
      'curador-personas',
      'relator-executivo-risco',
    ]),
  },
  {
    id: 'engenharia-projetos',
    label: 'Equipe Engenharia & Projetos',
    description: 'Cálculo estrutural, arquitetura e revisão técnica de ponta a ponta.',
    icon: 'hardhat',
    assignments: {
      supervisor: ['supervisor-agentes-ia'],
      mission: ['roteador-missoes'],
      execution: ['engenheiro-civil', 'arquiteto', 'lucas'],
      approval: ['curador-personas'],
      display: ['relator-executivo-risco'],
    },
    models: modelsFor([
      'supervisor-agentes-ia',
      'roteador-missoes',
      'engenheiro-civil',
      'arquiteto',
      'lucas',
      'curador-personas',
      'relator-executivo-risco',
    ]),
  },
  {
    id: 'conselho-estrategia',
    label: 'Conselho de Estratégia',
    description: 'Primeiros princípios e execução pragmática, com síntese para decisão.',
    icon: 'briefcase',
    assignments: {
      supervisor: ['supervisor-agentes-ia'],
      mission: ['lucas'],
      execution: ['elon-musk', 'aurora', 'tars'],
      approval: ['curador-personas'],
      display: ['relator-executivo-risco'],
    },
    models: modelsFor([
      'supervisor-agentes-ia',
      'lucas',
      'elon-musk',
      'aurora',
      'tars',
      'curador-personas',
      'relator-executivo-risco',
    ]),
  },
  {
    id: 'squad-summoners-rift',
    label: "Squad Summoner's Rift",
    description: 'Noxus, Demacia e Vazio executando a missão com estilo.',
    icon: 'swords',
    assignments: {
      supervisor: ['darius'],
      mission: ['ezreal'],
      execution: ['jinx', 'zed', 'katarina', 'ahri'],
      approval: ['garen'],
      display: ['lux'],
    },
    models: modelsFor(['darius', 'ezreal', 'jinx', 'zed', 'katarina', 'ahri', 'garen', 'lux']),
  },
];

export const LUCA_INDIVIDUAL_PRESET_SEED = [
  {
    id: 'comite-risco-agro',
    label: 'Comitê Risco Agro',
    description: 'Três especialistas da safra respondem; o relator executivo dá o veredito.',
    icon: 'sprout',
    participants: ['estrategista-risco-agro', 'especialista-zarc-seguro-rural', 'engenheiro-agricola'],
    judge: 'relator-executivo-risco',
    models: individualModels(
      ['estrategista-risco-agro', 'especialista-zarc-seguro-rural', 'engenheiro-agricola'],
      'relator-executivo-risco',
    ),
  },
  {
    id: 'conselho-de-ceos',
    label: 'Conselho de CEOs',
    description: 'Elon, Lucas e Aurora respondem isolados; o supervisor decide.',
    icon: 'crown',
    participants: ['elon-musk', 'lucas', 'aurora'],
    judge: 'supervisor-agentes-ia',
    models: individualModels(['elon-musk', 'lucas', 'aurora'], 'supervisor-agentes-ia'),
  },
  {
    id: 'mesa-tecnica',
    label: 'Mesa Técnica',
    description: 'Engenheiro civil e arquiteto respondem; o curador audita o veredito.',
    icon: 'hardhat',
    participants: ['engenheiro-civil', 'arquiteto'],
    judge: 'curador-personas',
    models: individualModels(['engenheiro-civil', 'arquiteto'], 'curador-personas'),
  },
  {
    id: 'plantao-de-saude',
    label: 'Plantão de Saúde',
    description: 'Pergunta clínica direta ao médico, com o supervisor validando a resposta.',
    icon: 'stethoscope',
    participants: ['medico'],
    judge: 'supervisor-agentes-ia',
    models: individualModels(['medico'], 'supervisor-agentes-ia'),
  },
  {
    id: 'duelo-noxus-demacia',
    label: 'Duelo Noxus × Demacia',
    description: 'Darius, Katarina, Garen e Lux se enfrentam; o supervisor declara o vencedor.',
    icon: 'swords',
    participants: ['darius', 'katarina', 'garen', 'lux'],
    judge: 'supervisor-agentes-ia',
    models: individualModels(['darius', 'katarina', 'garen', 'lux'], 'supervisor-agentes-ia'),
  },
];
