import { missionLooksInsuranceLike } from '../shared/agent-playbooks.js';

const BLOCKED_REPO_ACCESS_PATTERN = /\b(n[aã]o vejo a [aá]rvore|n[aã]o tenho acesso|liberar `?tree|sem acesso (?:ao|a|à) (?:repo|reposit[oó]rio|[aá]rvore))\b/i;
const STRENGTH_PATTERN = /\b(ponto forte|pontos fortes|forte:|fortes:)\b/i;
const WEAKNESS_PATTERN = /\b(ponto fraco|pontos fracos|fraco:|fracos:)\b/i;
const RISK_PATTERN = /\b(risco|riscos|lacuna|lacunas|premissa|premissas|proxy|proxies|incerteza)\b/i;
const REPO_EVIDENCE_PATTERN = /\b(?:[\w.-]+\/)+(?:[\w.-]+\.[a-z0-9]+|[\w.-]+)\b|(?:^|[\s(])(package\.json|package-lock\.json|wrangler\.jsonc|vite\.config\.(?:js|ts)|tsconfig(?:\.[\w-]+)?\.json|index\.(?:js|ts|jsx|tsx)|state\.js|styles?\.css)(?:$|[\s),.:])/i;

export function containsConcreteRepoEvidence(text = '') {
  return REPO_EVIDENCE_PATTERN.test(String(text || ''));
}

export function reviewResearcherContribution({ mission = {}, output = '', messages = [] } = {}) {
  const visibleText = Array.isArray(messages) && messages.length
    ? messages.map((message) => String(message?.content || '')).join('\n')
    : String(output || '');
  const text = String(visibleText || '').trim();
  const gaps = [];

  if (!text) gaps.push('Pesquisador nao publicou contribuicao aproveitavel.');
  if (BLOCKED_REPO_ACCESS_PATTERN.test(text)) gaps.push('Pesquisador alegou falta de acesso apesar do RepoContext disponivel.');
  if (!STRENGTH_PATTERN.test(text)) gaps.push('Pesquisador nao separou ponto forte observavel.');
  if (!WEAKNESS_PATTERN.test(text)) gaps.push('Pesquisador nao separou ponto fraco observavel.');
  if (!containsConcreteRepoEvidence(text)) gaps.push('Pesquisador nao citou arquivo ou caminho concreto da repo.');
  if (!RISK_PATTERN.test(text) && missionLooksInsuranceLike(mission)) {
    gaps.push('Pesquisador nao explicitou risco, lacuna ou premissa relevante para a decisao.');
  }

  return {
    ok: gaps.length === 0,
    gaps,
    text,
  };
}
