import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home,
  LayoutGrid,
  BrainCircuit,
  Boxes,
  StickyNote,
  Database,
  Activity,
  History,
  Plug2,
  Wrench,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useLuca } from '@/hooks/useLucaState';

export type PageId = 'inicio' | 'operacional' | 'luca-ai' | 'agentes' | 'personas' | 'database' | 'ferramentas' | 'endpoints' | 'heartbeat' | 'historico';

interface LayoutProps {
  activePage: PageId;
  onPageChange: (page: PageId) => void;
  children: React.ReactNode;
}

interface NavItem {
  id: PageId;
  label: string;
  icon: React.ElementType;
  hint: string;
}

const navItems: NavItem[] = [
  { id: 'inicio', label: 'Início', icon: Home, hint: 'apresentação do centro' },
  { id: 'operacional', label: 'Operacional', icon: LayoutGrid, hint: 'centro operacional da missão' },
  { id: 'luca-ai', label: 'LUCA-AI', icon: BrainCircuit, hint: 'bancada isolada com equipe de personas' },
  { id: 'agentes', label: 'Agentes', icon: Boxes, hint: 'esquadrão de corujas e seus terminais' },
  { id: 'personas', label: 'Personas', icon: StickyNote, hint: 'cards do Yume embutidos no LUCA' },
  { id: 'database', label: 'Database', icon: Database, hint: 'as três camadas do conhecimento' },
  { id: 'ferramentas', label: 'Ferramentas', icon: Wrench, hint: 'catálogo operacional adaptado do TARS' },
  { id: 'endpoints', label: 'Endpoints', icon: Plug2, hint: 'catálogo operacional de rotas e contratos' },
  { id: 'heartbeat', label: 'Heartbeat', icon: Activity, hint: 'o pulso vital do sistema' },
  { id: 'historico', label: 'Histórico', icon: History, hint: 'missões passadas e agendadas' },
];

export default function Layout({ activePage, onPageChange, children }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const theme = useTheme();
  const { backendReady, connectionState, runtimeMode, state } = useLuca();
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsNarrow(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  const shellCollapsed = collapsed || isNarrow;
  const cloudRuntime = runtimeMode === 'cloud';
  const heartbeatModelSelector = state?.heartbeatMonitor?.modelSelector as { model?: string } | undefined;
  const activeCloudModel = heartbeatModelSelector?.model || state?.governance?.provider || 'modelo cloud';
  const statusTone = connectionState === 'checking'
    ? theme.gold
    : backendReady
      ? theme.alive
      : theme.error;
  const runtimeLabel = cloudRuntime
    ? connectionState === 'checking'
      ? 'conectando cloud'
      : `${activeCloudModel} cloud`
    : connectionState === 'checking'
      ? 'checando sistema'
      : backendReady
        ? 'sistema online'
        : 'sistema offline';

  return (
    <div className="flex h-screen w-screen overflow-hidden relative" style={{ background: theme.void }}>
      {/* ─── Fundo: glows quentes + grid cartográfico (porcelana) ─── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-[-15%] left-[5%] w-[700px] h-[700px] rounded-full opacity-[0.10]"
          style={{ background: `radial-gradient(circle, ${theme.goldBright}, transparent 65%)`, filter: 'blur(150px)' }}
        />
        <div
          className="absolute bottom-[-20%] right-[-5%] w-[600px] h-[600px] rounded-full opacity-[0.08]"
          style={{ background: `radial-gradient(circle, ${theme.fleet}, transparent 70%)`, filter: 'blur(150px)' }}
        />
        <div
          className="absolute inset-0 opacity-[0.7]"
          style={{
            backgroundImage:
              `linear-gradient(rgba(30,58,108,0.035) 1px, transparent 1px),
               linear-gradient(90deg, rgba(30,58,108,0.035) 1px, transparent 1px)`,
            backgroundSize: '58px 58px',
            maskImage: 'radial-gradient(circle at center, black 20%, transparent 78%)',
            WebkitMaskImage: 'radial-gradient(circle at center, black 20%, transparent 78%)',
          }}
        />
      </div>

      {/* ─── Sidebar ─── */}
      <motion.aside
        initial={false}
        animate={{ width: shellCollapsed ? 76 : 240 }}
        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        className="relative flex flex-col h-full shrink-0 z-20 border-r"
        style={{
          background: `linear-gradient(180deg, ${theme.void2} 0%, ${theme.void} 100%)`,
          borderColor: theme.border,
        }}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-4 h-16 border-b shrink-0" style={{ borderColor: theme.border }}>
          <div className="relative w-10 h-10 shrink-0">
            <div
              className="absolute inset-0.5 rounded-md flex items-center justify-center overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${theme.navy}, ${theme.navyDeep})`,
                border: `1px solid ${theme.borderHover}`,
              }}
            >
              <BrandMark color={theme.goldBright} alive="#7fe0b0" />
            </div>
          </div>
          <AnimatePresence>
            {!shellCollapsed && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.22 }}
                className="flex flex-col"
              >
                <h1 className="text-base font-display font-bold tracking-[0.22em] gold-text">LUC.AI</h1>
                <span className="text-[9px] tracking-[0.32em] uppercase" style={{ color: theme.textGhost }}>
                  centro operacional
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onPageChange(item.id)}
                className={`rift-item w-full ${isActive ? 'active' : ''}`}
                title={shellCollapsed ? item.label : undefined}
              >
                <Icon className="w-[18px] h-[18px] shrink-0" />
                <AnimatePresence>
                  {!shellCollapsed && (
                    <motion.span
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -6 }}
                      transition={{ duration: 0.18 }}
                      className="whitespace-nowrap flex-1 text-left"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            );
          })}
        </nav>

        {/* Footer — status do runtime */}
        <div className="px-3 py-3 border-t" style={{ borderColor: theme.border }}>
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-lg ${shellCollapsed ? 'justify-center' : ''}`}
            style={{ background: theme.goldSoft, border: `1px solid ${theme.border}` }}
          >
            <div
              className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse-void"
              style={{ background: statusTone }}
            />
            <AnimatePresence>
              {!shellCollapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                className="text-[10px] font-medium tracking-wider uppercase"
                style={{ color: theme.textMute }}
              >
                  {runtimeLabel}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`absolute -right-3 top-20 w-6 h-6 rounded-full items-center justify-center cursor-pointer border z-30 transition-all hover:scale-110 ${isNarrow ? 'hidden' : 'flex'}`}
          style={{ background: theme.void2, borderColor: theme.border }}
        >
          {collapsed ? (
            <ChevronRight className="w-3 h-3" style={{ color: theme.gold }} />
          ) : (
            <ChevronLeft className="w-3 h-3" style={{ color: theme.gold }} />
          )}
        </button>
      </motion.aside>

      {/* ─── Main ─── */}
      <main className="flex-1 overflow-hidden relative z-10 flex flex-col">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 h-14 shrink-0 border-b" style={{ borderColor: theme.border }}>
          <span className="text-[11px] font-medium tracking-[0.25em] uppercase truncate" style={{ color: theme.textMute }}>
            {navItems.find((n) => n.id === activePage)?.hint}
          </span>
          <div className="hidden sm:flex items-center gap-3 text-[10px] font-mono" style={{ color: theme.textGhost }}>
            <span>{cloudRuntime ? `${activeCloudModel} cloud` : '127.0.0.1 : 4242'}</span>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <motion.div
            key={activePage}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="h-full"
          >
            {children}
          </motion.div>
        </div>
      </main>
    </div>
  );
}

/** Marca mini — coruja-pulso simplificada para o canto da sidebar. */
function BrandMark({ color, alive }: { color: string; alive: string }) {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <circle cx="9" cy="10" r="2.2" fill={color} />
      <circle cx="15" cy="10" r="2.2" fill={color} />
      <path d="M5 17 L9 17 L10.5 14 L12 19 L13.5 13 L15 17 L19 17" fill="none" stroke={alive} strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
