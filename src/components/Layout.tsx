import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BrainCircuit, ChevronLeft, ChevronRight, StickyNote } from 'lucide-react';

import { useTheme } from '@/hooks/useTheme';
import { lucaApi } from '@/lib/api';

export type PageId = 'luca-ai' | 'personas';

interface LayoutProps {
  activePage: PageId;
  onPageChange: (page: PageId) => void;
  children: React.ReactNode;
}

const navItems = [
  { id: 'luca-ai' as const, label: 'LUCA-AI', icon: BrainCircuit, hint: 'bancada isolada com equipe de personas' },
  { id: 'personas' as const, label: 'Personas', icon: StickyNote, hint: 'catalogo Yume disponivel para a bancada' },
];

export default function Layout({ activePage, onPageChange, children }: LayoutProps) {
  const theme = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const [connection, setConnection] = useState<'checking' | 'online' | 'offline'>('checking');

  const checkHealth = useCallback(async () => {
    setConnection((current) => current === 'online' ? current : 'checking');
    try {
      const health = await lucaApi.health();
      setConnection(health.ok ? 'online' : 'offline');
    } catch {
      setConnection('offline');
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsNarrow(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    void checkHealth();
    const timer = window.setInterval(checkHealth, 15000);
    return () => window.clearInterval(timer);
  }, [checkHealth]);

  const shellCollapsed = collapsed || isNarrow;
  const statusTone = connection === 'checking' ? theme.gold : connection === 'online' ? theme.alive : theme.error;
  const runtimeLabel = connection === 'checking' ? 'checando sistema' : connection === 'online' ? 'sistema online' : 'sistema offline';

  return (
    <div className="relative flex h-screen w-screen overflow-hidden" style={{ background: theme.void }}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="absolute left-[5%] top-[-15%] h-[700px] w-[700px] rounded-full opacity-[0.10]"
          style={{ background: `radial-gradient(circle, ${theme.goldBright}, transparent 65%)`, filter: 'blur(150px)' }}
        />
        <div
          className="absolute bottom-[-20%] right-[-5%] h-[600px] w-[600px] rounded-full opacity-[0.08]"
          style={{ background: `radial-gradient(circle, ${theme.fleet}, transparent 70%)`, filter: 'blur(150px)' }}
        />
        <div
          className="absolute inset-0 opacity-[0.7]"
          style={{
            backgroundImage: 'linear-gradient(rgba(30,58,108,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(30,58,108,0.035) 1px, transparent 1px)',
            backgroundSize: '58px 58px',
            maskImage: 'radial-gradient(circle at center, black 20%, transparent 78%)',
            WebkitMaskImage: 'radial-gradient(circle at center, black 20%, transparent 78%)',
          }}
        />
      </div>

      <motion.aside
        initial={false}
        animate={{ width: shellCollapsed ? 76 : 240 }}
        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        className="relative z-20 flex h-full shrink-0 flex-col border-r"
        style={{ background: `linear-gradient(180deg, ${theme.void2} 0%, ${theme.void} 100%)`, borderColor: theme.border }}
      >
        <div className="flex h-16 shrink-0 items-center gap-3 border-b px-4" style={{ borderColor: theme.border }}>
          <div className="relative h-10 w-10 shrink-0">
            <div
              className="absolute inset-0.5 flex items-center justify-center overflow-hidden rounded-md"
              style={{ background: `linear-gradient(135deg, ${theme.navy}, ${theme.navyDeep})`, border: `1px solid ${theme.borderHover}` }}
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
                className="flex flex-col"
              >
                <h1 className="gold-text text-base font-display font-bold tracking-[0.22em]">LUC.AI</h1>
                <span className="text-[9px] uppercase tracking-[0.32em]" style={{ color: theme.textGhost }}>persona workbench</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <nav className="flex-1 space-y-1.5 overflow-y-auto px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onPageChange(item.id)}
                className={`rift-item w-full ${isActive ? 'active' : ''}`}
                title={shellCollapsed ? item.label : undefined}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <AnimatePresence>
                  {!shellCollapsed && (
                    <motion.span
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -6 }}
                      className="flex-1 whitespace-nowrap text-left"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            );
          })}
        </nav>

        <div className="border-t px-3 py-3" style={{ borderColor: theme.border }}>
          <div
            className={`flex items-center gap-2 rounded-lg px-3 py-2 ${shellCollapsed ? 'justify-center' : ''}`}
            style={{ background: theme.goldSoft, border: `1px solid ${theme.border}` }}
          >
            <div className="h-1.5 w-1.5 shrink-0 animate-pulse-void rounded-full" style={{ background: statusTone }} />
            <AnimatePresence>
              {!shellCollapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-[10px] font-medium uppercase tracking-wider"
                  style={{ color: theme.textMute }}
                >
                  {runtimeLabel}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className={`absolute -right-3 top-20 z-30 h-6 w-6 items-center justify-center rounded-full border transition hover:scale-110 ${isNarrow ? 'hidden' : 'flex'}`}
          style={{ background: theme.void2, borderColor: theme.border }}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          {collapsed ? <ChevronRight className="h-3 w-3" style={{ color: theme.gold }} /> : <ChevronLeft className="h-3 w-3" style={{ color: theme.gold }} />}
        </button>
      </motion.aside>

      <main className="relative z-10 flex flex-1 flex-col overflow-hidden">
        <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4 sm:px-6" style={{ borderColor: theme.border }}>
          <span className="truncate text-[11px] font-medium uppercase tracking-[0.25em]" style={{ color: theme.textMute }}>
            {navItems.find((item) => item.id === activePage)?.hint}
          </span>
          <span className="hidden text-[10px] font-mono sm:block" style={{ color: theme.textGhost }}>127.0.0.1 : 4242</span>
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

function BrandMark({ color, alive }: { color: string; alive: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5">
      <circle cx="9" cy="10" r="2.2" fill={color} />
      <circle cx="15" cy="10" r="2.2" fill={color} />
      <path d="M5 17 L9 17 L10.5 14 L12 19 L13.5 13 L15 17 L19 17" fill="none" stroke={alive} strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
