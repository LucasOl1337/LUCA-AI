import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BrainCircuit,
  Eye,
  GitBranch,
  Home,
  LockKeyhole,
  RefreshCw,
  Settings2,
  StickyNote,
  UserRound,
  Wheat,
} from 'lucide-react';
import {
  LucaMissionCanvas,
  type OperationMode,
  type TeamTranscriptEntry,
} from '@/pages/LucaAiPage';
import type { LucaAiVisualPack, YumePersonaSummary } from '@/lib/types';

interface PublicShareSnapshot {
  title: string;
  operationMode: OperationMode;
  missionDraft?: string;
  transcript: TeamTranscriptEntry[];
  finalResult?: TeamTranscriptEntry | null;
  visualPack?: LucaAiVisualPack | null;
  sessionCreatedAt?: string;
  sessionUpdatedAt?: string;
}

interface PublicShare {
  token: string;
  createdAt?: string;
  updatedAt?: string;
  snapshot: PublicShareSnapshot;
}

interface PublicShareResponse {
  ok: boolean;
  share?: PublicShare;
  error?: string;
}

const readonlyNav = [
  { label: 'Início', icon: Home },
  { label: 'LUCA-AI', icon: BrainCircuit, active: true },
  { label: 'Personas', icon: StickyNote },
  { label: 'Configuração', icon: Settings2 },
  { label: 'SOMPO', icon: Wheat },
];

function BrandMark() {
  return (
    <img
      src="/icon-512.png"
      alt=""
      aria-hidden="true"
      className="h-8 w-8 shrink-0 rounded-lg object-cover object-[center_28%]"
      draggable={false}
    />
  );
}

function ReadingSidebar({ title }: { title: string }) {
  return (
    <>
      <div className="flex h-16 shrink-0 items-center gap-3 px-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl luca-reading-brand">
          <BrandMark />
        </div>
        <div className="min-w-0 flex-1">
          <strong className="block text-[15px] font-bold tracking-[0.12em]">LUCA</strong>
          <span className="block truncate text-[10px] uppercase tracking-[0.12em] text-[var(--l-text-ghost)]">
            centro operacional
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <nav className="shrink-0 space-y-1 px-2 py-2" aria-label="Navegação indisponível no modo leitura">
          <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--l-text-ghost)]">
            Espaços
          </div>
          {readonlyNav.map(({ label, icon: Icon, active }) => (
            <div
              key={label}
              className={`rift-item w-full ${active ? 'active' : ''} luca-reading-nav-item`}
              aria-current={active ? 'page' : undefined}
              aria-disabled={!active}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">{label}</span>
              {!active ? <LockKeyhole className="h-3 w-3 opacity-35" aria-hidden="true" /> : null}
            </div>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-hidden border-t border-white/[0.06] px-2 pb-2 pt-2">
          <div className="luca-sidebar-sessions">
            <div className="luca-sidebar-section-head px-2">Sessão compartilhada</div>
            <div className="luca-sidebar-session-scroll">
              <div className="luca-sidebar-folder">
                <div className="luca-sidebar-root-label px-2">Somente leitura</div>
                <div className="luca-reading-session active">
                  <Eye className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <strong>{title || 'Sessão LUCA-AI'}</strong>
                    <small>Conteúdo compartilhado</small>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-2 pb-2 pt-2">
        <div className="luca-reading-account">
          <span><Eye className="h-4 w-4" /></span>
          <div><strong>Visitante</strong><small>modo leitura</small></div>
          <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
        </div>
        <div className="mt-2 flex min-h-11 items-center gap-2 rounded-xl bg-white/[0.08] px-3">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--l-alive)]" />
          <span className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--l-text-mute)]">
            link público ativo
          </span>
        </div>
      </div>
    </>
  );
}

export default function PublicReadingPage({ token }: { token: string }) {
  const [share, setShare] = useState<PublicShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const loadShare = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/public/share/${encodeURIComponent(token)}`, {
        credentials: 'omit',
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => ({})) as PublicShareResponse;
      if (!response.ok || !payload.ok || !payload.share) throw new Error('share_not_found');
      setShare(payload.share);
    } catch {
      setShare(null);
      setError('Este link não existe ou foi revogado pelo autor.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadShare();
  }, [loadShare]);

  useEffect(() => {
    const previousTitle = document.title;
    const existingRobots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const previousRobots = existingRobots?.content;
    const robots = existingRobots || document.createElement('meta');
    if (!existingRobots) {
      robots.name = 'robots';
      document.head.appendChild(robots);
    }
    robots.content = 'noindex, nofollow';
    document.title = share?.snapshot.title
      ? `${share.snapshot.title} — LUCA em modo leitura`
      : 'LUCA — modo leitura';
    return () => {
      document.title = previousTitle;
      if (existingRobots) robots.content = previousRobots || '';
      else robots.remove();
    };
  }, [share?.snapshot.title]);

  const snapshot = share?.snapshot;
  const operationMode: OperationMode = snapshot?.operationMode === 'individual' ? 'individual' : 'team';
  const transcript = useMemo(
    () => Array.isArray(snapshot?.transcript) ? snapshot.transcript : [],
    [snapshot?.transcript],
  );
  const personaBySlug = useMemo(() => new Map<string, YumePersonaSummary>(), []);
  const title = snapshot?.title || 'Sessão compartilhada';

  return (
    <div className="luca-shell luca-reading-shell">
      <header className="luca-mobile-header">
        <BrandMark />
        <div className="min-w-0 flex-1">
          <strong className="block text-sm tracking-[0.08em]">LUCA</strong>
          <span className="block truncate text-[10px] text-[var(--l-text-mute)]">{title}</span>
        </div>
        <span className="state-badge text-[var(--l-navy-deep)] bg-[var(--l-navy-soft)]">leitura</span>
      </header>

      <div className="luca-stage">
        <aside className="luca-sidebar luca-sidebar-desktop luca-reading-sidebar" aria-label="LUCA em modo leitura">
          <ReadingSidebar title={title} />
        </aside>

        <main className="luca-main">
          <div className="luca-workspace">
            <div className="h-full">
              <div className="luca-ai-page luca-ai-chat-page relative h-full min-h-0">
                <div className="luca-ai-chat-column">
                  <header className="luca-ai-chat-toolbar">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <div className="luca-ai-view-switch" role="group" aria-label="Modo da sessão compartilhada">
                        <button type="button" className={operationMode === 'team' ? 'active' : ''} tabIndex={-1} aria-disabled="true">
                          <GitBranch className="h-4 w-4" /> Equipe
                        </button>
                        <button type="button" className={operationMode === 'individual' ? 'active' : ''} tabIndex={-1} aria-disabled="true">
                          <UserRound className="h-4 w-4" /> Individual
                        </button>
                      </div>
                      <div className="luca-ai-view-switch" role="group" aria-label="Visualização compartilhada">
                        <button type="button" className="active" tabIndex={-1} aria-disabled="true">
                          <Eye className="h-4 w-4" /> Chat
                        </button>
                      </div>
                    </div>
                    <div className="luca-ai-toolbar-actions">
                      <span className="luca-ai-team-trigger active luca-reading-badge">
                        <LockKeyhole className="h-4 w-4" />
                        <span>Somente leitura</span>
                      </span>
                    </div>
                  </header>

                  <main className="luca-ai-chat-stage">
                    {loading ? (
                      <div className="luca-reading-state" role="status">
                        <RefreshCw className="h-5 w-5 animate-spin" />
                        <strong>Abrindo sessão compartilhada…</strong>
                      </div>
                    ) : error || !snapshot ? (
                      <div className="luca-reading-state" role="alert">
                        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--l-error-bg)] text-[var(--l-error)]">
                          <LockKeyhole className="h-5 w-5" />
                        </div>
                        <strong>Link indisponível</strong>
                        <p>{error}</p>
                        <button type="button" className="btn-fleet !min-h-9 !px-4 !text-xs" onClick={() => void loadShare()}>
                          Tentar novamente
                        </button>
                      </div>
                    ) : (
                      <LucaMissionCanvas
                        transcript={transcript}
                        finalResult={snapshot.finalResult || null}
                        visualPack={snapshot.visualPack || null}
                        personaBySlug={personaBySlug}
                        running={false}
                        transcriptRef={transcriptRef}
                        onInspect={() => undefined}
                        operationMode={operationMode}
                        missionDraft={snapshot.missionDraft}
                      />
                    )}
                  </main>

                  {!loading && snapshot ? (
                    <div className="luca-ai-composer-dock">
                      <div className="luca-reading-composer" role="note">
                        <LockKeyhole className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 flex-1">Modo leitura — esta sessão não aceita novas mensagens.</span>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
