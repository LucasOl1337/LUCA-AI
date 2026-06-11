import type { ChatMessage } from './types';
import { formatBrazilTime } from '../../shared/time.js';

export function timestamp(): string {
  return formatBrazilTime();
}

export function formatMissionRuntime(activatedAt?: string): string {
  if (!activatedAt) return 'Aguardando ativação.';
  const started = Date.parse(activatedAt);
  if (!Number.isFinite(started)) return 'Rodando agora.';
  const totalMinutes = Math.max(0, Math.floor((Date.now() - started) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `Rodando há ${hours}h ${minutes}min.`;
  if (minutes > 0) return `Rodando há ${minutes}min.`;
  return 'Rodando agora.';
}

export function heartbeatFresh(updatedAt?: string | null): boolean {
  if (!updatedAt) return false;
  const ms = Date.parse(updatedAt);
  if (!Number.isFinite(ms)) return false;
  return (Date.now() - ms) < 12000;
}

export function stateTone(state: string): string {
  if (state === 'running' || state === 'online' || state === 'ready') return '#43d18a';
  if (state === 'error' || state === 'offline') return '#f87171';
  return '#fbbf24';
}

export function heartbeatLineClass(line: string): string {
  if (/^\[agent:start\]/.test(line)) return 'term-line-start';
  if (/^\[agent:done\]/.test(line)) return 'term-line-done';
  if (/^\[agent:fail\]|^\[stderr\]/.test(line)) return 'term-line-fail';
  return '';
}

export function visibleHeartbeatLines(lines: string[]): { raw: string; text: string }[] {
  return lines
    .filter((line) => !/^\[heartbeat\] ok\b/.test(line))
    .map((line) => ({ raw: line, text: line.replace(/^\[agent:(?:start|done|fail)\]\s*/, '') }));
}

export function formatGlobalChatLog(messages: ChatMessage[]): string {
  if (!messages.length) return 'chat global sem mensagens.';
  return messages
    .map((m) => `[${m.timestamp}] ${m.agentName} (${m.type}): ${m.content}`)
    .join('\n');
}

export function formatAgentLog({ title, status, lines }: { title: string; status: string; lines: string[] }): string {
  return [`${title} (${status})`, ...lines].join('\n');
}

export function formatChatParagraphs(text: string): string[] {
  return String(text ?? '')
    .replace(/\s+(?=(?:Premissas|Problema priorizado|Ranking|Ações|Acoes|Ordem|Sucesso|Critério|Criterio|Missão|Missao):)/g, '\n')
    .replace(/\s+(?=\d+\)\s)/g, '\n')
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function friendlyStatus(value?: string): string {
  const labels: Record<string, string> = {
    ready: 'pronto',
    archived: 'arquivado',
    empty: 'vazio',
    offline: 'offline',
    running: 'rodando',
    standby: 'em espera',
    idle: 'ocioso',
    online: 'online',
    paused: 'pausado',
  };
  return labels[value ?? ''] ?? value ?? 'em revisão';
}
