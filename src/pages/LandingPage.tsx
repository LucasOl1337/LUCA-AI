import { motion } from 'framer-motion';
import { Boxes, Crosshair, Database, Activity } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useLuca } from '@/hooks/useLucaState';
import { countDatabaseItems } from '@/lib/database';
import LucaOwl from '@/components/LucaOwl';
import type { PageId } from '@/components/Layout';

interface LandingPageProps {
  onNavigate: (page: PageId) => void;
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.4, 0, 0.2, 1] as const } },
};
const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.09 } },
};

export default function LandingPage({ onNavigate }: LandingPageProps) {
  const theme = useTheme();
  const { activeMission, supervisorMode, agents, database, backendReady, heartbeatMonitor } = useLuca();

  const dbItems = countDatabaseItems(database);
  const running = supervisorMode === 'running';
  const monitorStatus = heartbeatMonitor?.status ?? (backendReady ? 'online' : 'offline');

  return (
    <div className="h-full overflow-y-auto">
      {/* ─── Fundo: rifts dimensionais (partículas e glows) ─── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div
          className="absolute top-[-20%] left-[10%] w-[800px] h-[800px] rounded-full opacity-[0.06]"
          style={{
            background: `radial-gradient(circle, ${theme.gold}, transparent 65%)`,
            filter: 'blur(180px)',
          }}
        />
        <div
          className="absolute bottom-[-15%] right-[5%] w-[600px] h-[600px] rounded-full opacity-[0.05]"
          style={{
            background: `radial-gradient(circle, ${theme.fleet}, transparent 70%)`,
            filter: 'blur(160px)',
          }}
        />
      </div>

      <div className="relative z-10 max-w-[1100px] mx-auto px-8 pb-16 flex flex-col" style={{ minHeight: '100%' }}>

        {/* ─── HERO — coruja cinemática ─── */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="flex flex-col items-center justify-center pt-10 pb-6"
        >
          {/* Coruja grande com halo */}
          <div className="relative flex items-center justify-center">
            {/* halo de fundo — rift dimensional */}
            <div
              className="absolute rounded-full animate-pulse-void"
              style={{
                width: 420,
                height: 420,
                background: `radial-gradient(circle at 50% 50%, rgba(196,67,67,0.07) 0%, rgba(107,74,170,0.04) 45%, transparent 70%)`,
                filter: 'blur(32px)',
              }}
            />
            <LucaOwl size={340} alive={backendReady} />
          </div>

          {/* Título */}
          <motion.div
            className="text-center mt-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.55 }}
          >
            <h1 className="void-title text-6xl tracking-[0.32em] font-display font-bold">LUC.AI</h1>
            <p
              className="text-[11px] tracking-[0.6em] uppercase mt-3 kanji"
              style={{ color: theme.textGhost }}
            >
              centro operacional
            </p>
            <p
              className="text-sm mt-5 max-w-sm mx-auto leading-relaxed text-center"
              style={{ color: theme.textMute }}
            >
              Um esquadrão de agentes coordenados — operando missões e desenhando resultados em tempo real.
            </p>
          </motion.div>

          {/* CTA */}
          <motion.button
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => onNavigate('operacional')}
            className="btn-primary mt-7 flex items-center gap-2 !px-8 !py-3 text-sm tracking-widest uppercase"
          >
            Entrar no Centro Operacional
          </motion.button>
        </motion.div>

        {/* ─── Stat cards ─── */}
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-2"
        >
          {[
            {
              icon: Boxes,
              label: 'Agentes',
              value: String(agents.length),
              desc: 'corujas no esquadrão',
              tone: theme.gold,
            },
            {
              icon: Crosshair,
              label: 'Missão',
              value: activeMission ? 'ativa' : '—',
              desc: running ? 'supervisor rodando' : 'aguardando comando',
              tone: activeMission ? theme.alive : theme.textMute,
            },
            {
              icon: Database,
              label: 'Database',
              value: String(dbItems),
              desc: 'itens registrados',
              tone: theme.fleet,
            },
            {
              icon: Activity,
              label: 'Heartbeat',
              value: backendReady ? 'vivo' : 'off',
              desc: `monitor ${monitorStatus}`,
              tone: backendReady ? theme.alive : theme.error,
            },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <motion.div key={s.label} variants={fadeUp}>
                <div className="void-panel rounded-2xl p-5 h-full">
                  <div className="flex items-start justify-between">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center"
                      style={{ background: theme.goldSoft, border: `1px solid ${theme.border}` }}
                    >
                      <Icon className="w-4 h-4" style={{ color: s.tone, opacity: 0.85 }} />
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="text-2xl font-bold tracking-tight" style={{ color: theme.text }}>
                      {s.value}
                    </div>
                    <div
                      className="text-[10px] font-semibold tracking-[0.22em] uppercase mt-1"
                      style={{ color: theme.textSoft }}
                    >
                      {s.label}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: theme.textMute }}>
                      {s.desc}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* ─── Estado do sistema ─── */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.35 }}
          className="void-panel rounded-2xl px-6 py-5 mt-4 flex items-center gap-4"
        >
          <div
            className="w-2 h-2 rounded-full shrink-0 animate-pulse-void"
            style={{ background: backendReady ? theme.alive : theme.error }}
          />
          <p className="text-sm leading-relaxed flex-1" style={{ color: theme.textMute }}>
            {activeMission
              ? 'Missão ativa. Abra o Centro Operacional para acompanhar o canvas e o log do supervisor.'
              : backendReady
                ? 'Sistema online. Pronto para receber missão.'
                : 'Sem conexão com o backend. Verifique se o servidor está em 127.0.0.1:4242.'}
          </p>
          <div className={`state-badge ${activeMission ? 'ok' : backendReady ? 'warning' : 'error'} shrink-0`}>
            {activeMission ? 'em operação' : backendReady ? 'em espera' : 'offline'}
          </div>
        </motion.div>

      </div>
    </div>
  );
}
