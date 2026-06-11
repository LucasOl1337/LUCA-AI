import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Trash2, Activity, ShieldCheck } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useLuca } from '@/hooks/useLucaState';
import { lucaApi } from '@/lib/api';
import { heartbeatFresh, heartbeatLineClass, stateTone, visibleHeartbeatLines } from '@/lib/format';
import type { GovernanceSummary } from '@/lib/types';

export default function HeartbeatPage() {
  const theme = useTheme();
  const [diagnostic, setDiagnostic] = useState<{ ok?: boolean; status?: string; checks?: { id: string; label: string; ok: boolean; detail?: string }[] } | null>(null);
  const [diagnosticBusy, setDiagnosticBusy] = useState(false);
  const {
    heartbeatMonitor,
    heartbeatLogs,
    backendReady,
    state,
    getAgentStatus,
    startHeartbeat,
    pauseHeartbeat,
    clearAgents,
    refresh,
  } = useLuca();

  const lines = visibleHeartbeatLines(heartbeatLogs);
  const fresh = heartbeatFresh(heartbeatMonitor?.updatedAt);
  const monitorStatus = fresh ? (heartbeatMonitor?.status ?? 'online') : 'stale';
  const streamRef = useRef<HTMLDivElement>(null);

  const rows = [
    { label: 'Supervisor', state: getAgentStatus('supervisor') },
    { label: 'Planejador', state: getAgentStatus('planejador') },
    { label: 'Pesquisador', state: getAgentStatus('pesquisador') },
    { label: 'Designer', state: getAgentStatus('designer') },
  ];
  const beats = typeof heartbeatMonitor?.beats === 'number' ? heartbeatMonitor.beats : 0;
  const lastAction = typeof heartbeatMonitor?.lastAction === 'string' ? heartbeatMonitor.lastAction : 'idle';
  const eventTypes = Array.isArray(heartbeatMonitor?.eventTypes) ? heartbeatMonitor.eventTypes.slice(0, 6) : [];
  const goalsSummary = (heartbeatMonitor?.goalsSummary ?? null) as {
    total?: number;
    openCount?: number;
    pending?: number;
    running?: number;
  } | null;
  const recentGoals = (state?.goals ?? []).slice(0, 4);
  const governance = (heartbeatMonitor?.governance ?? state?.governance ?? null) as GovernanceSummary | null;
  const governanceBudget = governance?.defaultBudget ?? null;
  const missionConcurrency = governance?.missionConcurrency ?? null;
  const governanceRules = Array.isArray(governance?.rules) ? governance.rules.slice(0, 4) : [];

  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [lines.length]);

  async function runDiagnostic() {
    setDiagnosticBusy(true);
    try {
      const result = await lucaApi.runHarnessSmoke() as typeof diagnostic;
      setDiagnostic(result);
      await refresh();
    } finally {
      setDiagnosticBusy(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <div className="max-w-[1100px] mx-auto">
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: theme.aliveSoft, border: `1px solid ${theme.border}` }}>
              <Activity className="w-5 h-5" style={{ color: theme.alive }} />
            </div>
            <div>
              <h1 className="void-title text-3xl">Heartbeat</h1>
              <p className="text-sm" style={{ color: theme.textMute }}>o pulso vital do sistema</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-fleet flex items-center gap-2" onClick={startHeartbeat}><Play className="w-4 h-4" /> play</button>
            <button className="btn-fleet flex items-center gap-2" onClick={pauseHeartbeat}><Pause className="w-4 h-4" /> pause</button>
            <button className="btn-fleet flex items-center gap-2" onClick={runDiagnostic} disabled={diagnosticBusy}>
              <ShieldCheck className="w-4 h-4" /> {diagnosticBusy ? 'checando' : 'diagnóstico'}
            </button>
            <button className="btn-fleet flex items-center gap-2" onClick={clearAgents}><Trash2 className="w-4 h-4" /> limpar</button>
          </div>
        </header>

        {/* status cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="void-panel rounded-2xl p-5">
            <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: theme.textMute }}>monitor</span>
            <div className="flex items-center gap-2 mt-2">
              <span className="w-2 h-2 rounded-full animate-pulse-void" style={{ background: stateTone(monitorStatus) }} />
              <strong className="text-lg font-display" style={{ color: theme.text }}>{monitorStatus}</strong>
            </div>
          </div>
          <div className="void-panel rounded-2xl p-5">
            <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: theme.textMute }}>último tick</span>
            <strong className="block text-xs font-mono mt-2 truncate" style={{ color: theme.textSoft }}>
              {heartbeatMonitor?.updatedAt ?? 'n/a'}
            </strong>
          </div>
          <div className="void-panel rounded-2xl p-5">
            <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: theme.textMute }}>eventos</span>
            <div className="flex items-center gap-2 mt-2">
              <span className="w-2 h-2 rounded-full" style={{ background: backendReady ? theme.alive : theme.error }} />
              <strong className="text-lg font-display" style={{ color: theme.text }}>{beats}</strong>
            </div>
            <p className="text-[11px] mt-1 truncate" style={{ color: theme.textMute }}>{lastAction}</p>
          </div>
          <div className="void-panel rounded-2xl p-5">
            <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: theme.textMute }}>goals</span>
            <div className="flex items-center gap-2 mt-2">
              <strong className="text-lg font-display" style={{ color: theme.text }}>{goalsSummary?.openCount ?? 0}</strong>
              <span className="text-xs" style={{ color: theme.textMute }}>abertos</span>
            </div>
            <p className="text-[11px] mt-1 truncate" style={{ color: theme.textMute }}>
              {goalsSummary?.pending ?? 0} pendentes • {goalsSummary?.running ?? 0} em execução
            </p>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4">
          {/* rows dos agentes */}
          <div className="col-span-12 md:col-span-4 void-panel rounded-2xl p-5">
            <strong className="text-[11px] uppercase tracking-[0.2em]" style={{ color: theme.textSoft }}>agentes</strong>
            <div className="mt-3 space-y-2">
              {rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: theme.input }}>
                  <span className="text-xs" style={{ color: theme.textSoft }}>{row.label}</span>
                  <span className="text-xs font-mono" style={{ color: stateTone(row.state) }}>{row.state}</span>
                </div>
              ))}
            </div>
            {eventTypes.length > 0 && (
              <div className="mt-5">
                <strong className="text-[11px] uppercase tracking-[0.2em]" style={{ color: theme.textSoft }}>event store</strong>
                <div className="mt-3 space-y-2">
                  {eventTypes.map((row, index) => {
                    const item = row as { type?: string; total?: number };
                    return (
                      <div key={`${item.type}-${index}`} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: theme.input }}>
                        <span className="text-xs truncate" style={{ color: theme.textSoft }}>{item.type}</span>
                        <span className="text-xs font-mono" style={{ color: theme.gold }}>{item.total ?? 0}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {governance && (
              <div className="mt-5">
                <strong className="text-[11px] uppercase tracking-[0.2em]" style={{ color: theme.textSoft }}>governança</strong>
                <div className="mt-3 space-y-2">
                  <div className="rounded-lg px-3 py-2" style={{ background: theme.input }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs" style={{ color: theme.textSoft }}>concorrência</span>
                      <span className="text-xs font-mono" style={{ color: missionConcurrency?.blocked ? theme.error : theme.gold }}>
                        {missionConcurrency?.blocked ? `${missionConcurrency.unmatchedCount ?? 0} aberta(s)` : 'clear'}
                      </span>
                    </div>
                    {missionConcurrency?.latestUnmatched?.title && (
                      <p className="text-[11px] mt-1 truncate" style={{ color: theme.textMute }}>
                        última: {missionConcurrency.latestUnmatched.title}
                      </p>
                    )}
                  </div>
                  <div className="rounded-lg px-3 py-2" style={{ background: theme.input }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs" style={{ color: theme.textSoft }}>ações irreversíveis</span>
                      <span className="text-xs font-mono" style={{ color: theme.gold }}>{(governance.irreversibleActionList ?? []).length}</span>
                    </div>
                    <p className="text-[11px] mt-1 truncate" style={{ color: theme.textMute }}>
                      {(governance.irreversibleActionList ?? []).join(', ') || governance.irreversibleActions || 'n/a'}
                    </p>
                  </div>
                  {governanceBudget && (
                    <div className="rounded-lg px-3 py-2" style={{ background: theme.input }}>
                      <span className="text-xs block" style={{ color: theme.textSoft }}>budget padrão</span>
                      <p className="text-[11px] mt-1" style={{ color: theme.textMute }}>
                        {governanceBudget.maxIterations ?? 0} iterações • {governanceBudget.maxSeconds ?? 0}s • {governanceBudget.maxToolCalls ?? 0} tools
                      </p>
                    </div>
                  )}
                  {governanceRules.map((line) => (
                    <div key={line} className="rounded-lg px-3 py-2" style={{ background: theme.input }}>
                      <span className="text-[11px]" style={{ color: theme.textMute }}>{line}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* log */}
          <div className="col-span-12 md:col-span-8">
            {diagnostic && (
              <div className="void-panel rounded-2xl p-4 mb-4">
                <div className="flex items-center justify-between">
                  <strong className="text-[11px] uppercase tracking-[0.2em]" style={{ color: theme.textSoft }}>diagnóstico</strong>
                  <span className={diagnostic.ok ? 'state-badge ok' : 'state-badge error'}>{diagnostic.status ?? (diagnostic.ok ? 'passed' : 'failed')}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                  {(diagnostic.checks ?? []).map((check) => (
                    <div key={check.id} className="rounded-lg px-3 py-2" style={{ background: theme.input, border: `1px solid ${theme.border}` }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold" style={{ color: theme.textSoft }}>{check.label}</span>
                        <span className={check.ok ? 'state-badge ok' : 'state-badge error'}>{check.ok ? 'ok' : 'falha'}</span>
                      </div>
                      {check.detail && <p className="text-[11px] mt-1 truncate" style={{ color: theme.textMute }}>{check.detail}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div ref={streamRef} className="term p-4 h-[420px] overflow-y-auto">
              <p style={{ color: theme.textMute }}>$ heartbeat monitor {monitorStatus}</p>
              {lines.length === 0 ? (
                <p style={{ color: theme.textGhost }}>sem eventos recentes...</p>
              ) : (
                lines.map((line, i) => (
                  <p key={`${line.raw}-${i}`} className={heartbeatLineClass(line.raw)}>{line.text}</p>
                ))
              )}
            </div>
            {recentGoals.length > 0 && (
              <div className="void-panel rounded-2xl p-4 mt-4">
                <div className="flex items-center justify-between">
                  <strong className="text-[11px] uppercase tracking-[0.2em]" style={{ color: theme.textSoft }}>goals recentes</strong>
                  <span className="state-badge dormant">{goalsSummary?.total ?? recentGoals.length} registrados</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                  {recentGoals.map((goal) => (
                    <div key={goal.id} className="rounded-lg px-3 py-2" style={{ background: theme.input, border: `1px solid ${theme.border}` }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold truncate" style={{ color: theme.textSoft }}>{goal.title}</span>
                        <span className="state-badge dormant">{goal.status}</span>
                      </div>
                      <p className="text-[11px] mt-1 line-clamp-2" style={{ color: theme.textMute }}>{goal.description || goal.definitionOfDone || 'sem detalhe adicional'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
