import { motion } from 'framer-motion';
import { useTheme } from '@/hooks/useTheme';
import { useLuca } from '@/hooks/useLucaState';
import LucaOwl from '@/components/LucaOwl';
import type { PageId } from '@/components/Layout';

interface LandingPageProps {
  onNavigate: (page: PageId) => void;
}

const fadeUp = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const } },
};
export default function LandingPage({ onNavigate }: LandingPageProps) {
  const theme = useTheme();
  const {
    backendReady,
    connectionState,
    runtimeMode,
    operationError,
    refresh,
    clearOperationError,
  } = useLuca();

  const cloudRuntime = runtimeMode === 'cloud';
  const runtimeOnline = cloudRuntime ? connectionState !== 'offline' : backendReady;
  const checking = connectionState === 'checking';
  const systemBadge = checking ? 'conectando' : runtimeOnline ? 'online' : 'offline';
  const systemBadgeClass = checking ? 'warning' : runtimeOnline ? 'ok' : 'error';
  const needsRecovery = Boolean(operationError) || (!checking && !runtimeOnline);
  const statusTone = operationError || !runtimeOnline
    ? 'error'
    : checking
      ? 'warning'
      : 'ok';
  const statusCopy = operationError
    ? operationError
    : checking
      ? 'Conectando ao runtime para preparar o LUCA-AI e o catálogo de personas.'
      : cloudRuntime
        ? 'Modo público online. O runtime da VM está conectado ao 9Router e pronto para atender o LUCA-AI.'
        : backendReady
          ? 'Sistema online. Abra o LUCA-AI para iniciar uma missão ou Personas para montar o catálogo.'
          : 'Sem conexão com o backend. Verifique se o servidor está em 127.0.0.1:4242.';

  async function retryConnection() {
    clearOperationError();
    await refresh();
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="luca-page-shell mx-auto flex min-h-full max-w-[1180px] flex-col gap-3 p-6">
        <motion.section
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="luca-hero void-panel grid rounded-[22px] lg:grid-cols-[minmax(0,1fr)_220px]"
        >
          <div className="flex flex-col justify-center p-5 sm:p-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: theme.goldBright }}>LUCA-AI</span>
              <span className="h-1 w-1 rounded-full" style={{ background: theme.textGhost }} />
              <span className="text-[10px] uppercase tracking-[0.12em]" style={{ color: theme.textGhost }}>equipe de personas</span>
            </div>
            <h1 className="void-title">LUCA</h1>
            <p className="mt-2 max-w-[620px] text-[13px] leading-relaxed" style={{ color: theme.textMute }}>
              Monte uma equipe de personas, envie uma missão e acompanhe a entrega em uma conversa única.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => onNavigate('luca-ai')} className="btn-primary">
                Abrir LUCA-AI
              </button>
              <button
                type="button"
                onClick={() => onNavigate('personas')}
                className="btn-fleet"
              >
                Ver personas
              </button>
            </div>
          </div>
          <div className="luca-hero-art relative grid place-items-center overflow-hidden p-3">
            <div className="absolute inset-5 rounded-full" style={{ background: `radial-gradient(circle, ${theme.goldSoft}, transparent 68%)` }} />
            <LucaOwl size={176} alive={runtimeOnline} />
          </div>
        </motion.section>

        <motion.section
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="void-panel flex flex-col gap-3 rounded-[18px] p-4 sm:flex-row sm:items-center"
          aria-label="Estado do sistema"
          data-landing-system-status
          data-tone={statusTone}
          data-landing-system-error={needsRecovery ? '' : undefined}
          role={needsRecovery ? 'alert' : undefined}
        >
          <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full sm:mt-0" style={{ background: checking ? theme.warning : runtimeOnline ? theme.alive : theme.error }} />
            <p className="min-w-0 flex-1 text-[13px] leading-relaxed" style={{ color: theme.textMute }}>
              {statusCopy}
            </p>
            <div className={`state-badge ${systemBadgeClass} shrink-0`}>
              {systemBadge}
            </div>
          </div>
          {needsRecovery && (
            <div className="flex shrink-0 flex-wrap items-center gap-2" data-landing-system-actions>
              <button
                type="button"
                className="btn-primary"
                data-landing-system-retry
                onClick={() => void retryConnection()}
              >
                Tentar novamente
              </button>
              {operationError && (
                <button
                  type="button"
                  className="btn-fleet"
                  data-landing-system-dismiss
                  onClick={clearOperationError}
                >
                  Dispensar
                </button>
              )}
            </div>
          )}
        </motion.section>
      </div>
    </div>
  );
}
