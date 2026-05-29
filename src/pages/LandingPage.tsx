import { motion } from 'framer-motion';
import { Boxes, Crosshair, Database, Activity, Sparkles, ArrowRight } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useLuca } from '@/hooks/useLucaState';
import { countDatabaseItems } from '@/lib/database';
import LucaOwl from '@/components/LucaOwl';
import StatCard from '@/components/StatCard';
import type { PageId } from '@/components/Layout';

interface LandingPageProps {
  onNavigate: (page: PageId) => void;
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] as const } },
};
const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

/**
 * Landing / Apresentação — a vitrine da LUC.AI (aba 1).
 * Só apresentação: herói + título + CTA + stats + estado. O trabalho de fato
 * acontece na aba Operacional.
 */
export default function LandingPage({ onNavigate }: LandingPageProps) {
  const theme = useTheme();
  const { activeMission, supervisorMode, agents, database, backendReady, heartbeatMonitor } = useLuca();

  const dbItems = countDatabaseItems(database);
  const running = supervisorMode === 'running';
  const monitorStatus = heartbeatMonitor?.status ?? (backendReady ? 'online' : 'offline');

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1180px] mx-auto px-8 py-12 space-y-12">

        {/* ─── Herói ─── */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="relative flex flex-col items-center justify-center pt-6 pb-2"
        >
          <LucaOwl size={320} alive={backendReady} />
          <div className="text-center mt-3">
            <h1 className="void-title text-6xl tracking-[0.3em] font-display font-bold">LUC.AI</h1>
            <p className="text-[12px] tracking-[0.55em] uppercase mt-4" style={{ color: theme.textMute }}>
              centro operacional
            </p>
            <p className="text-sm mt-6 max-w-md mx-auto leading-relaxed" style={{ color: theme.textSoft }}>
              Um esquadrão de agentes de IA coordenados — supervisor, planejador, pesquisador e designer —
              operando missões e desenhando resultados em tempo real.
            </p>
          </div>

          {/* CTA — entrar no cockpit */}
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => onNavigate('operacional')}
            className="btn-primary mt-8 flex items-center gap-2 !px-7 !py-3 text-base"
          >
            Entrar no Centro Operacional
            <ArrowRight className="w-4 h-4" />
          </motion.button>
        </motion.div>

        {/* ─── Stat cards ─── */}
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        >
          <StatCard icon={Boxes} label="Agentes" value={String(agents.length)} desc="corujas no esquadrão" />
          <StatCard
            icon={Crosshair}
            label="Missão"
            value={activeMission ? 'ativa' : '—'}
            desc={running ? 'supervisor rodando' : 'aguardando comando'}
            tone={activeMission ? theme.alive : theme.gold}
          />
          <StatCard icon={Database} label="Database" value={String(dbItems)} desc="itens registrados" tone={theme.fleet} />
          <StatCard
            icon={Activity}
            label="Heartbeat"
            value={backendReady ? 'vivo' : 'off'}
            desc={`monitor ${monitorStatus}`}
            tone={backendReady ? theme.alive : theme.error}
          />
        </motion.div>

        {/* ─── Estado da dimensão ─── */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="void-panel rounded-2xl p-8 relative overflow-hidden"
        >
          <div className="relative flex items-start gap-4">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
              style={{ background: theme.goldSoft, border: `1px solid ${theme.border}` }}
            >
              <Sparkles className="w-4 h-4" style={{ color: theme.gold }} />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-display font-semibold mb-1" style={{ color: theme.text }}>
                {activeMission ? 'O centro está em missão.' : backendReady ? 'O centro está pronto.' : 'O centro está offline.'}
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: theme.textSoft }}>
                {activeMission
                  ? 'Há uma missão ativa agora. Abra o Centro Operacional para acompanhar o canvas, o chat dos agentes e o log do supervisor.'
                  : backendReady
                    ? 'Tudo conectado e pronto para operar. Entre no Centro Operacional para descrever uma missão e ativar o esquadrão.'
                    : 'Sem conexão com o backend. Verifique se o servidor está rodando em 127.0.0.1:4242.'}
              </p>
              <div className="flex items-center gap-2 mt-4">
                <div className={`state-badge ${activeMission ? 'ok' : backendReady ? 'warning' : 'error'}`}>
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: activeMission ? theme.alive : backendReady ? theme.warning : theme.error }} />
                  {activeMission ? 'em operação' : backendReady ? 'em espera' : 'offline'}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
