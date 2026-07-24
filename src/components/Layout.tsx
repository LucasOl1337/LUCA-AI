import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  Home,
  Menu,
  StickyNote,
  X,
} from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useLuca } from '@/hooks/useLucaState';

export type PageId = 'inicio' | 'luca-ai' | 'personas';

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
  { id: 'inicio', label: 'Início', icon: Home, hint: 'visão geral do LUCA-AI' },
  { id: 'luca-ai', label: 'LUCA-AI', icon: BrainCircuit, hint: 'bancada isolada com equipe de personas' },
  { id: 'personas', label: 'Personas', icon: StickyNote, hint: 'personas do Yume disponíveis no LUCA' },
];

const dockIds: PageId[] = ['inicio', 'luca-ai', 'personas'];

export default function Layout({ activePage, onPageChange, children }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const theme = useTheme();
  const { backendReady, connectionState, runtimeMode, state } = useLuca();

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const sync = () => {
      setIsNarrow(media.matches);
      if (!media.matches) setMobileNavOpen(false);
    };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [mobileNavOpen]);

  const cloudRuntime = runtimeMode === 'cloud';
  const runtimeOnline = cloudRuntime ? connectionState !== 'offline' : backendReady;
  const statusTone = connectionState === 'checking' ? theme.warning : runtimeOnline ? theme.alive : theme.error;
  const runtimeLabel = cloudRuntime
    ? connectionState === 'checking' ? 'conectando 9router' : runtimeOnline ? '9router online' : '9router offline'
    : connectionState === 'checking' ? 'checando sistema' : backendReady ? 'sistema online' : 'sistema offline';
  const activeItem = navItems.find((item) => item.id === activePage) ?? navItems[0];

  function navigate(page: PageId) {
    onPageChange(page);
    setMobileNavOpen(false);
  }

  function renderSidebar(options: { compact: boolean; drawer?: boolean }) {
    const { compact, drawer = false } = options;
    return (
      <>
        <div className="flex items-center gap-3 px-3 h-16 shrink-0">
          <div
            className="relative w-10 h-10 shrink-0 rounded-xl grid place-items-center"
            style={{ background: theme.goldSoft, boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,.28)' }}
          >
            <BrandMark />
          </div>
          <AnimatePresence initial={false}>
            {!compact && (
              <motion.div
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: 0.18 }}
                className="min-w-0 flex-1"
              >
                <strong className="block text-[15px] font-bold tracking-[0.12em]" style={{ color: theme.text }}>LUC.AI</strong>
                <span className="block text-[10px] tracking-[0.12em] uppercase truncate" style={{ color: theme.textGhost }}>
                  centro operacional
                </span>
              </motion.div>
            )}
          </AnimatePresence>
          {drawer && (
            <button type="button" className="luca-menu-button" onClick={() => setMobileNavOpen(false)} aria-label="Fechar menu">
              <X className="w-[18px] h-[18px]" />
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-1" aria-label="Navegação principal">
          {!compact && (
            <div className="px-3 pb-2 text-[10px] font-semibold tracking-[0.12em] uppercase" style={{ color: theme.textGhost }}>
              Espaços
            </div>
          )}
          {navItems.map((item) => {
            const Icon = item.icon;
            const selected = activePage === item.id;
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => navigate(item.id)}
                className={`rift-item w-full ${selected ? 'active' : ''} ${compact ? 'justify-center !px-0' : ''}`}
                title={compact ? item.label : undefined}
                aria-current={selected ? 'page' : undefined}
              >
                <Icon className="w-[18px] h-[18px] shrink-0" />
                {!compact && <span className="min-w-0 flex-1 text-left truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="px-2 pb-3 pt-2">
          <div
            className={`min-h-11 flex items-center gap-2 rounded-xl px-3 ${compact ? 'justify-center' : ''}`}
            style={{ background: 'rgba(255,255,255,.08)', boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,.18)' }}
          >
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: statusTone }} />
            {!compact && <span className="text-[10px] font-semibold tracking-[0.08em] uppercase truncate" style={{ color: theme.textMute }}>{runtimeLabel}</span>}
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="luca-shell">
      <header className="luca-mobile-header" aria-hidden={mobileNavOpen ? true : undefined}>
        <button
          type="button"
          className="luca-menu-button"
          aria-label="Abrir menu"
          aria-expanded={mobileNavOpen}
          aria-controls="luca-mobile-navigation"
          onClick={() => setMobileNavOpen(true)}
        >
          <Menu className="w-[18px] h-[18px]" />
        </button>
        <BrandMark />
        <div className="min-w-0 flex-1">
          <strong className="block text-sm tracking-[0.08em]">LUC.AI</strong>
          <span className="block text-[10px] truncate" style={{ color: theme.textMute }}>{activeItem.label}</span>
        </div>
        <span className="state-badge shrink-0" style={{ color: statusTone, background: runtimeOnline ? theme.aliveSoft : theme.errorBg }}>
          {connectionState === 'checking' ? 'conectando' : runtimeOnline ? 'online' : 'offline'}
        </span>
      </header>

      <div className="luca-stage" aria-hidden={mobileNavOpen && isNarrow ? true : undefined}>
        <motion.aside
          initial={false}
          animate={{ width: collapsed ? 76 : 228 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="luca-sidebar luca-sidebar-desktop relative flex flex-col"
          aria-label="Menu lateral"
        >
          {renderSidebar({ compact: collapsed })}
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="absolute -right-3 top-[72px] w-7 h-7 min-h-0 rounded-full grid place-items-center transition-transform hover:scale-105"
            style={{ background: 'rgba(18,22,29,.92)', color: theme.textMute, boxShadow: 'var(--l-shadow-card)' }}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </motion.aside>

        <main className="luca-main">
          <div className="luca-workspace">
            <motion.div
              key={activePage}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="h-full"
            >
              {children}
            </motion.div>
          </div>
        </main>
      </div>

      <div className="luca-dock-anchor" aria-hidden={mobileNavOpen && isNarrow ? true : undefined}>
        <nav className="luca-dock" aria-label="Acesso rápido">
          {dockIds.map((id) => {
            const item = navItems.find((candidate) => candidate.id === id)!;
            const Icon = item.icon;
            const selected = activePage === id;
            return (
              <button
                type="button"
                key={id}
                className={`luca-dock-item ${selected ? 'active' : ''}`}
                onClick={() => navigate(id)}
                aria-current={selected ? 'page' : undefined}
                aria-label={item.label}
              >
                <Icon className="w-[18px] h-[18px]" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {mobileNavOpen && (
        <button type="button" className="luca-drawer-scrim" tabIndex={-1} aria-hidden="true" onClick={() => setMobileNavOpen(false)} />
      )}
      {mobileNavOpen && (
        <aside
          id="luca-mobile-navigation"
          className="luca-drawer open"
          role="dialog"
          aria-modal="true"
          aria-label="Menu completo"
        >
          <div className="luca-sidebar flex flex-col">{renderSidebar({ compact: false, drawer: true })}</div>
        </aside>
      )}
    </div>
  );
}

function BrandMark() {
  return (
    <img src="/icon-512.png" alt="" aria-hidden="true" className="h-8 w-8 shrink-0 rounded-lg object-cover object-[center_28%]" draggable={false} />
  );
}
