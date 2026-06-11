import { useState } from 'react';
import { Clock, CalendarClock, X, Pause, Play, FileText, ClipboardCheck } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useLuca } from '@/hooks/useLucaState';
import { lucaApi } from '@/lib/api';
import { buildReportText, isOperationalCanvas } from '@/lib/canvas';
import type { ArchivedMission } from '@/lib/types';
import { friendlyStatus } from '@/lib/format';

export default function HistoricoPage() {
  const theme = useTheme();
  const { state, refresh } = useLuca();
  const history = state?.missionHistory ?? [];
  const scheduled = state?.scheduledMissions ?? [];
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [openReportFor, setOpenReportFor] = useState<string | null>(null);

  async function act(fn: () => Promise<unknown>) {
    await fn();
    await refresh();
  }

  const hasDashboard = (item: ArchivedMission) => Boolean(item.dashboard && !isOperationalCanvas(item.dashboard));

  function reportFrom(item: ArchivedMission) {
    if (!item.dashboard) return '';
    return buildReportText(item.dashboard, item.mission ?? null, {
      finalReport: item.run?.finalReport ?? null,
      chatMessages: item.chatMessages ?? [],
      runStatus: item.run?.status ?? item.status ?? null,
      archivedAt: item.archivedAt ?? null,
      statusReason: item.reason ?? null,
    });
  }

  async function copyArchivedReport(item: ArchivedMission) {
    const text = reportFrom(item);
    if (!text) return;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      setCopiedId(item.id);
      window.setTimeout(() => setCopiedId((current) => (current === item.id ? null : current)), 1400);
    }
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
                  {hasDashboard(h) && (
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setOpenReportFor(h.id)}
                        className="btn-fleet !px-3 !py-1.5 text-[10px] inline-flex items-center gap-1.5"
                        title="ver relatório executivo"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Ver relatório
                      </button>
                      <button
                        type="button"
                        onClick={() => copyArchivedReport(h)}
                        className="btn-fleet !px-3 !py-1.5 text-[10px] inline-flex items-center gap-1.5"
                        title="copiar relatório executivo"
                      >
                        <ClipboardCheck className="w-3.5 h-3.5" />
                        {copiedId === h.id ? 'Copiado' : 'Copiar'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {openReportFor && (
          <div
            className="fixed inset-0 z-40 bg-black/65 flex items-center justify-center p-4"
            onClick={() => setOpenReportFor(null)}
          >
            {(() => {
              const selected = history.find((item) => item.id === openReportFor);
              if (!selected) return null;
              const reportText = reportFrom(selected);
              return (
                <div
                  className="w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl border p-4"
                  style={{ background: theme.void, borderColor: theme.border }}
                  onClick={(event) => event.stopPropagation()}
                  role="dialog"
                  aria-modal="true"
                  aria-label="Relatório executivo"
                >
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h4 className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: theme.textSoft }}>
                      Relatório executivo
                    </h4>
                    <button
                      type="button"
                      onClick={() => setOpenReportFor(null)}
                      className="btn-fleet !px-2 !py-1 text-[10px] inline-flex items-center gap-1.5"
                      title="fechar relatório"
                    >
                      <X className="w-3.5 h-3.5" />
                      Fechar
                    </button>
                  </div>
                  <pre
                    className="report-markdown p-3 rounded-xl border text-[10px] leading-relaxed overflow-auto max-h-[72vh]"
                    style={{ color: theme.text, background: theme.surface, borderColor: theme.border, whiteSpace: 'pre-wrap' }}
                  >
                    {reportText}
                  </pre>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
