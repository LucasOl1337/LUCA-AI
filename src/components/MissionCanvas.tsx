import { motion } from 'framer-motion';
import { useTheme } from '@/hooks/useTheme';
import { useLuca } from '@/hooks/useLucaState';
import { isOperationalCanvas, resolveBlocks } from '@/lib/canvas';
import LucaOwl from './LucaOwl';
import DashboardBlock from './DashboardBlock';
import ReportModal from './ReportModal';

export default function MissionCanvas() {
  const theme = useTheme();
  const { temporaryDashboard, activeMission, backendReady, state } = useLuca();
  const run = state?.activeRun as { status?: string; verifier?: { approved?: boolean; reason?: string } } | null;
  const rejected = run?.status === 'needs_revision' || run?.status === 'failed' || run?.verifier?.approved === false;
  const chatOnly = run?.status === 'chat_completed';

  // Mantém o relatório visível mesmo quando há necessidade de revisão.
  const dashboardCandidate = temporaryDashboard ?? state?.temporaryDashboard ?? null;
  const reportDashboard = dashboardCandidate && !isOperationalCanvas(dashboardCandidate) ? dashboardCandidate : null;
  const display = reportDashboard;
  const headerStatus = activeMission
    ? (activeMission.title ?? 'missão ativa')
    : display
      ? 'missão concluída'
      : 'aguardando missão';

  return (
    <div className="void-panel rounded-2xl flex flex-col h-full overflow-hidden">
      <header className="flex items-center gap-2 px-5 h-12 border-b shrink-0 min-w-0" style={{ borderColor: theme.border }}>
        <h3 className="text-[11px] font-semibold tracking-[0.2em] uppercase flex-1 min-w-0 luca-wrap" style={{ color: theme.textSoft }}>
          Canvas da Missão
        </h3>
        <span className="text-[10px] max-w-[42%] shrink-0 text-right luca-wrap" style={{ color: theme.textMute }}>
          {headerStatus}
        </span>
        {reportDashboard && (
          <div className="flex items-center gap-2">
            <ReportModal
              dashboard={reportDashboard}
              mission={activeMission}
              reportContext={{
                finalReport: state?.activeRun?.finalReport ?? null,
                chatMessages: state?.globalChatMessages ?? [],
                runStatus: state?.activeRun?.status ?? null,
                governance: state?.heartbeatMonitor?.governance ?? state?.governance ?? null,
                heartbeatMonitor: state?.heartbeatMonitor ?? null,
              }}
            />
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto">
        {display ? (
          <div className="p-5">
            <div className="mb-4">
              <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: theme.gold }}>canvas</span>
              <h2 className="void-title text-xl mt-1 luca-wrap">{display.title ?? 'Canvas temporário'}</h2>
              {display.subtitle && (
                <p className="text-sm mt-1 luca-wrap" style={{ color: theme.textMute }}>{display.subtitle}</p>
              )}
              {rejected && (
                <div
                  className="mt-3 rounded-xl px-3 py-2 text-xs"
                  style={{ color: theme.error, background: theme.errorBg, border: `1px solid ${theme.error}` }}
                >
                  {run?.verifier?.reason || 'O verificador pediu revisão, mas o canvas foi preservado para auditoria.'}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <ReportModal
                  dashboard={display}
                  mission={activeMission}
                  reportContext={{
                    finalReport: state?.activeRun?.finalReport ?? null,
                    chatMessages: state?.globalChatMessages ?? [],
                    runStatus: state?.activeRun?.status ?? null,
                    governance: state?.heartbeatMonitor?.governance ?? state?.governance ?? null,
                    heartbeatMonitor: state?.heartbeatMonitor ?? null,
                  }}
                  buttonClassName="btn-fleet !px-4 !py-2 text-[11px] flex items-center gap-2"
                />
              </div>
            </div>
            <motion.div
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07 } } }}
              className="grid grid-cols-1 md:grid-cols-2 gap-3"
            >
              {resolveBlocks(display).map((block, i) => (
                <motion.div
                  key={`${block.type}-${block.title}-${i}`}
                  variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                  className="min-w-0"
                >
                  <DashboardBlock block={block} />
                </motion.div>
              ))}
            </motion.div>
          </div>
        ) : rejected ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 py-8">
            <div className="void-panel rounded-xl p-5 max-w-lg" style={{ borderColor: theme.error }}>
              <span className="state-badge error">revisão necessária</span>
              <h2 className="void-title text-lg mt-3">Canvas não aprovado</h2>
              <p className="text-sm mt-2 leading-relaxed" style={{ color: theme.textMute }}>
                {run?.verifier?.reason || 'O verificador bloqueou esta saída. Ajuste o briefing ou use um pedido de chat quando não houver necessidade de canvas.'}
              </p>
              {reportDashboard && (
                <div className="mt-4 flex justify-center">
                  <ReportModal
                    dashboard={reportDashboard}
                    mission={activeMission}
                    reportContext={{
                      finalReport: state?.activeRun?.finalReport ?? null,
                      chatMessages: state?.globalChatMessages ?? [],
                      runStatus: state?.activeRun?.status ?? null,
                      governance: state?.heartbeatMonitor?.governance ?? state?.governance ?? null,
                      heartbeatMonitor: state?.heartbeatMonitor ?? null,
                    }}
                    buttonClassName="btn-fleet !px-4 !py-2 text-[11px] flex items-center gap-2"
                  />
                </div>
              )}
            </div>
          </div>
        ) : chatOnly ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 py-8">
            <LucaOwl size={120} alive={backendReady} />
            <p className="text-sm mt-4 max-w-sm leading-relaxed" style={{ color: theme.textMute }}>
              Pedido tratado como chat. A resposta está no painel de comunicação.
            </p>
          </div>
        ) : (
          // Estado ocioso — medalhão compacto (o herói grande está no topo da página).
          <div className="h-full flex flex-col items-center justify-center text-center px-6 py-8">
            <LucaOwl size={150} alive={backendReady} />
            <p className="text-sm mt-4 max-w-xs leading-relaxed" style={{ color: theme.textMute }}>
              {activeMission
                ? 'Missão ativa. O canvas refletirá os resultados assim que o designer publicar.'
                : 'O canvas vai montar os resultados da missão aqui.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
