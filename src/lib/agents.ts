// Definições visuais dos agentes. Os ids/roles espelham server/config.js (AGENTS).
// Imagens das corujas servidas em /v2-design/owl-*.png (Vite public dir).

export interface AgentDef {
  id: string;
  title: string;
  role: string;
  owl?: string;        // avatar de coruja
  icon?: string;       // ícone alternativo (png/mp4)
  accent: string;      // cor de acento (CSS var-like hex) por agente
  isHeartbeat?: boolean;
  isDatabase?: boolean;
  system?: boolean;    // agente sistêmico (maestro / transformador)
}

// Agentes operacionais clicáveis no trilho (sem o supervisor — controlado à parte,
// como em main.jsx:382).
export const AGENT_DEFS: AgentDef[] = [
  { id: 'heartbeat', title: 'heartbeat', role: 'system', icon: '/icons/heartbeat.mp4', accent: '#43d18a', isHeartbeat: true },
  { id: 'database', title: 'database', role: 'database', icon: '/icons/database.png', accent: '#7FB3D5', isDatabase: true },
  { id: 'maestro', title: 'maestro', role: 'router', owl: '/v2-design/owl-agent.png', accent: '#C9A227', system: true },
  { id: 'transformador-missao', title: 'transformador de missão', role: 'mission-transformer', owl: '/v2-design/owl-agent.png', accent: '#C9A227', system: true },
  { id: 'planejador', title: 'planejador', role: 'planner', owl: '/v2-design/owl-planner.png', accent: '#7FB3D5' },
  { id: 'pesquisador', title: 'pesquisador', role: 'researcher', owl: '/v2-design/owl-researcher.png', accent: '#1E4E8C' },
  { id: 'designer', title: 'designer', role: 'designer', owl: '/v2-design/owl-designer.png', accent: '#C9A227' },
];

// Inclui o supervisor — usado na página Agentes (visão completa).
export const SUPERVISOR_DEF: AgentDef = {
  id: 'supervisor', title: 'supervisor', role: 'supervisor', owl: '/v2-design/owl-supervisor.png', accent: '#C9A227',
};

export const ALL_AGENT_DEFS: AgentDef[] = [SUPERVISOR_DEF, ...AGENT_DEFS];

export function findAgentDef(id: string | null): AgentDef | undefined {
  if (!id) return undefined;
  return ALL_AGENT_DEFS.find((a) => a.id === id);
}

// Cor de acento estável por nome de agente (para bilhetes do chat).
const CHAT_ACCENTS = ['#C9A227', '#7FB3D5', '#1E4E8C', '#43d18a', '#b58cff', '#f0a35c'];
export function chatAccent(agentName: string): string {
  let hash = 0;
  for (let i = 0; i < agentName.length; i++) hash = (hash * 31 + agentName.charCodeAt(i)) >>> 0;
  return CHAT_ACCENTS[hash % CHAT_ACCENTS.length];
}
