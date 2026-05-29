import { Clock, CalendarClock, X, Pause, Play } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useLuca } from '@/hooks/useLucaState';
import { lucaApi } from '@/lib/api';
import { friendlyStatus } from '@/lib/format';

export default function HistoricoPage() {
  const theme = useTheme();
  const { state, refresh } = useLuca();
  const history = state?.missionHistory ?? [];
  const scheduled = state?.scheduledMissions ?? [];

  async function act(fn: () => Promise<unknown>) {
    await fn();
    await refresh();
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <div className="max-w-[1100px] mx-auto space-y-8">
        <header>
          <h1 className="void-title text-3xl">Histórico</h1>
          <p className="text-sm mt-1" style={{ color: theme.textMute }}>missões passadas e agendadas</p>
        </header>

        {/* agendadas */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <CalendarClock className="w-4 h-4" style={{ color: theme.gold }} />
            <h2 className="text-[11px] font-semibold tracking-[0.2em] uppercase" style={{ color: theme.textSoft }}>
              Agendadas ({scheduled.length})
            </h2>
          </div>
          {scheduled.length === 0 ? (
            <div className="void-panel rounded-xl p-6 text-center">
              <p className="text-xs" style={{ color: theme.textMute }}>nenhuma missão agendada</p>
            </div>
          ) : (
            <div className="space-y-2">
              {scheduled.map((s) => (
                <div key={s.id} className="void-panel rounded-xl p-4 flex items-center gap-3">
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold" style={{ color: theme.text }}>{s.title ?? s.description ?? s.id}</h4>
                    <p className="text-xs mt-0.5" style={{ color: theme.textMute }}>
                      {[s.cron && `cron: ${s.cron}`, s.nextRun && `próx: ${s.nextRun}`, friendlyStatus(s.status)].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {s.status === 'paused' ? (
                    <button className="btn-fleet !p-2" title="retomar" onClick={() => act(() => lucaApi.resumeSchedule(s.id))}>
                      <Play className="w-4 h-4" />
                    </button>
                  ) : (
                    <button className="btn-fleet !p-2" title="pausar" onClick={() => act(() => lucaApi.pauseSchedule(s.id))}>
                      <Pause className="w-4 h-4" />
                    </button>
                  )}
                  <button className="btn-fleet !p-2" title="cancelar" onClick={() => act(() => lucaApi.cancelSchedule(s.id))}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* passadas */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4" style={{ color: theme.gold }} />
            <h2 className="text-[11px] font-semibold tracking-[0.2em] uppercase" style={{ color: theme.textSoft }}>
              Passadas ({history.length})
            </h2>
          </div>
          {history.length === 0 ? (
            <div className="void-panel rounded-xl p-6 text-center">
              <p className="text-xs" style={{ color: theme.textMute }}>nenhuma missão arquivada ainda</p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.id} className="void-panel rounded-xl p-4">
                  <div className="flex items-center gap-2">
                    <span className="state-badge dormant">{friendlyStatus(h.run?.status ?? h.reason)}</span>
                    <time className="text-[10px] font-mono ml-auto" style={{ color: theme.textGhost }}>{h.archivedAt}</time>
                  </div>
                  <h4 className="text-sm font-semibold mt-2" style={{ color: theme.text }}>
                    {h.mission?.title ?? 'missão sem título'}
                  </h4>
                  {h.mission?.description && (
                    <p className="text-xs mt-1 leading-relaxed line-clamp-2" style={{ color: theme.textMute }}>
                      {h.mission.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
