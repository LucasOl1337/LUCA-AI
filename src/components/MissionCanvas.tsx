import { motion } from 'framer-motion';
import { useTheme } from '@/hooks/useTheme';
import { useLuca } from '@/hooks/useLucaState';
import { isOperationalCanvas, resolveBlocks } from '@/lib/canvas';
import LucaOwl from './LucaOwl';
import DashboardBlock from './DashboardBlock';

export default function MissionCanvas() {
  const theme = useTheme();
  const { temporaryDashboard, activeMission, backendReady } = useLuca();

  // Só exibe canvas de resultado se for conteúdo "público" (não operacional).
  const display = temporaryDashboard && !isOperationalCanvas(temporaryDashboard) ? temporaryDashboard : null;

  return (
    <div className="void-panel rounded-2xl flex flex-col h-full overflow-hidden">
      <header className="flex items-center gap-2 px-5 h-12 border-b shrink-0" style={{ borderColor: theme.border }}>
        <h3 className="text-[11px] font-semibold tracking-[0.2em] uppercase flex-1" style={{ color: theme.textSoft }}>
          Canvas da Missão
        </h3>
        <span className="text-[10px]" style={{ color: theme.textMute }}>
          {activeMission ? (activeMission.title ?? 'missão ativa') : 'aguardando missão'}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto">
        {display ? (
          <div className="p-5">
            <div className="mb-4">
              <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: theme.gold }}>canvas</span>
              <h2 className="void-title text-xl mt-1">{display.title ?? 'Canvas temporário'}</h2>
              {display.subtitle && (
                <p className="text-sm mt-1" style={{ color: theme.textMute }}>{display.subtitle}</p>
              )}
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
                >
                  <DashboardBlock block={block} />
                </motion.div>
              ))}
            </motion.div>
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
