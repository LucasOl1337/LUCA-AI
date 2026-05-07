export const PORT = Number(process.env.PORT ?? 4242);
export const ROUTER_API_KEY = process.env.ROUTER_API_KEY ?? process.env.NINE_ROUTER_API_KEY ?? '';
export const ROUTER_BASE_URL = process.env.ROUTER_BASE_URL ?? 'http://127.0.0.1:20128/v1';
export const ROUTER_MODEL = process.env.ROUTER_MODEL ?? 'cx/gpt-5.4-mini-xhigh';
export const ROUTER_TIMEOUT_MS = Number(process.env.ROUTER_TIMEOUT_MS ?? 120000);
export const MISSION_TRANSFORMER_MODEL = process.env.MISSION_TRANSFORMER_MODEL ?? 'cx/gpt-5.5';
export const DESIGNER_MODEL = process.env.DESIGNER_MODEL ?? 'cx/gpt-5.5';

export const AGENTS = [
  { id: 'transformador-missao', role: 'mission-transformer', name: 'Transformador de Missao', model: MISSION_TRANSFORMER_MODEL },
  { id: 'supervisor', role: 'supervisor', name: 'Supervisor' },
  { id: 'planejador', role: 'planner', name: 'Planejador' },
  { id: 'pesquisador', role: 'researcher', name: 'Pesquisador' },
  { id: 'designer', role: 'designer', name: 'Designer', model: DESIGNER_MODEL },
];

export const AGENT_ALIASES = {
  'riscos-campo': 'pesquisador',
};
