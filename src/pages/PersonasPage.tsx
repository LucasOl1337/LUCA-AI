import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, BadgeCheck, ChevronDown, ExternalLink, Layers3, Loader2, Plus, RefreshCw, Search, Sparkles, Trash2, UserPlus, UsersRound } from 'lucide-react';
import { buildApiErrorMessage, lucaApi } from '@/lib/api';
import type { YumePersonaSummary } from '@/lib/types';
import { useLuca } from '@/hooks/useLucaState';
import { useTheme } from '@/hooks/useTheme';

type FilterMode = 'all' | 'imported' | 'available';

const YUME_DASHBOARD_URL = 'http://127.0.0.1:2222';

function withBaseUrl(value: string | undefined, base: string | undefined): string | undefined {
  const raw = String(value || '').trim();
  if (!raw || !base || /^https?:\/\//i.test(raw)) return raw || undefined;
  if (!raw.startsWith('/')) return raw;
  return `${base.replace(/\/+$/, '')}${raw}`;
}

function normalizePersonaAssetUrls(personas: YumePersonaSummary[], base: string | undefined): YumePersonaSummary[] {
  return personas.map((persona) => ({
    ...persona,
    avatarUrl: withBaseUrl(persona.avatarUrl, base),
    avatar_url: withBaseUrl(persona.avatar_url, base),
  }));
}

export default function PersonasPage() {
  const theme = useTheme();
  const { runtimeMode, refresh, state } = useLuca();
  const [personas, setPersonas] = useState<YumePersonaSummary[]>([]);
  const [loading, setLoading] = useState(runtimeMode === 'backend');
  const [error, setError] = useState<string | null>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [secondaryOpen, setSecondaryOpen] = useState(false);

  // No domínio, o Express está na mesma origem via Cloudflare Tunnel.
  // Usar 127.0.0.1 aqui apontaria para a máquina do visitante.
  const bridgeBase: string | undefined = undefined;
  const importedInState = state?.personaAgents?.length ?? 0;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await lucaApi.listYumePersonas(bridgeBase, bridgeBase ? 15000 : undefined);
      setPersonas(normalizePersonaAssetUrls(data.personas ?? [], bridgeBase));
    } catch (err) {
      const fallback = 'Falha ao carregar personas do Yume.';
      setError(buildApiErrorMessage(err, fallback));
    } finally {
      setLoading(false);
    }
  }, [bridgeBase]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (filter === 'available' || query.trim()) setSecondaryOpen(true);
  }, [filter, query]);

  const searchedPersonas = useMemo(() => {
    const term = query.trim().toLowerCase();
    return personas.filter((persona) => {
      if (!term) return true;
      return [persona.name, persona.slug, persona.description, persona.model]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [personas, query]);

  const rosterPersonas = searchedPersonas.filter((persona) => persona.imported);
  const secondaryPersonas = searchedPersonas.filter((persona) => !persona.imported);
  const showRoster = filter !== 'available';
  const showSecondary = filter !== 'imported';
  const secondaryExpanded = secondaryOpen;
  const visiblePersonaCount = (showRoster ? rosterPersonas.length : 0) + (showSecondary ? secondaryPersonas.length : 0);

  const importedCount = personas.filter((persona) => persona.imported).length || importedInState;
  const availableCount = Math.max(0, personas.length - personas.filter((persona) => persona.imported).length);

  async function importPersona(slug: string) {
    setBusySlug(slug);
      setError(null);
    try {
      await lucaApi.importYumePersona(slug, bridgeBase);
      await load();
      if (runtimeMode === 'backend') await refresh();
    } catch (err) {
      setError(buildApiErrorMessage(err, `Falha ao importar ${slug}.`));
    } finally {
      setBusySlug(null);
    }
  }

  async function removePersona(slug: string) {
    setBusySlug(slug);
      setError(null);
    try {
      await lucaApi.removeYumePersona(slug, bridgeBase);
      await load();
      if (runtimeMode === 'backend') await refresh();
    } catch (err) {
      setError(buildApiErrorMessage(err, `Falha ao remover ${slug}.`));
    } finally {
      setBusySlug(null);
    }
  }

  return (
    <div className="luca-page-shell h-full overflow-y-auto px-6 py-7 sm:px-8">
      <div className="mx-auto max-w-[1360px] space-y-6">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ background: theme.goldSoft, color: theme.goldDeep }}>
              <UsersRound className="h-3.5 w-3.5" />
              Yume embedded
            </div>
            <h1 className="void-title text-3xl">Persona Cards</h1>
            <p className="mt-2 text-sm" style={{ color: theme.textMute }}>
              Cada card e uma persona do Yume pronta para virar especialista no LUCA.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Metric label="catalogo" value={personas.length} />
            <Metric label="no luca" value={importedCount} />
            <Metric label="livres" value={availableCount} />
            <button type="button" className="btn-fleet inline-flex items-center gap-2" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Recarregar
            </button>
          </div>
        </header>

        <section className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: theme.textGhost }} />
            <label htmlFor="persona-search" className="sr-only">Buscar persona</label>
            <input
              id="persona-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="buscar persona"
              className="w-full rounded-lg border py-2.5 pl-10 pr-3 text-sm outline-none transition"
              style={{ background: theme.input, borderColor: theme.border, color: theme.text }}
            />
          </div>
          <div className="flex rounded-lg border p-1" style={{ background: theme.input, borderColor: theme.border }}>
            {[
              ['all', 'Todas'],
              ['imported', 'No LUCA'],
              ['available', 'Disponiveis'],
            ].map(([id, label]) => {
              const active = filter === id;
              return (
                <button
                  key={id}
                  type="button"
                  className="rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition"
                  style={{ background: active ? theme.goldSoft : 'transparent', color: active ? theme.goldDeep : theme.textMute }}
                  onClick={() => setFilter(id as FilterMode)}
                  aria-pressed={active}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </section>

        {error && (
          <Notice
            tone="error"
            title="Yume indisponivel"
            body={error}
            actions={(
              <button
                type="button"
                className="btn-primary !px-4 !py-2 !text-xs"
                data-personas-retry
                onClick={() => void load()}
                disabled={loading}
              >
                {loading ? 'Recarregando…' : 'Tentar novamente'}
              </button>
            )}
          />
        )}

        {loading && personas.length === 0 ? (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {Array.from({ length: 12 }, (_, index) => (
              <div key={index} className="aspect-square animate-pulse rounded-lg" style={{ background: theme.surfaceHi, border: `1px solid ${theme.border}` }} />
            ))}
          </div>
        ) : visiblePersonaCount > 0 ? (
          <div className="space-y-10">
            {showRoster && (
              <section aria-labelledby="luca-roster-title" className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <BadgeCheck className="h-4 w-4" style={{ color: theme.goldDeep }} aria-hidden="true" />
                      <h2 id="luca-roster-title" className="text-sm font-semibold" style={{ color: theme.text }}>
                        Roster principal
                      </h2>
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: theme.goldSoft, color: theme.goldDeep }}>
                        {rosterPersonas.length}
                      </span>
                    </div>
                    <p className="mt-1 text-xs" style={{ color: theme.textMute }}>
                      Estas personas estão no LUCA e podem participar de execuções reais.
                    </p>
                  </div>
                </div>

                {rosterPersonas.length > 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
                  >
                    {rosterPersonas.map((persona, index) => (
                      <PersonaCard
                        key={persona.slug}
                        persona={persona}
                        delay={index * 0.025}
                        busy={busySlug === persona.slug}
                        onImport={() => importPersona(persona.slug)}
                        onRemove={() => removePersona(persona.slug)}
                      />
                    ))}
                  </motion.div>
                ) : (
                  <div className="rounded-xl border px-5 py-6 text-sm" style={{ borderColor: theme.border, color: theme.textMute }}>
                    O roster está vazio. Expanda as personas disponíveis abaixo para adicionar a primeira especialista.
                  </div>
                )}
              </section>
            )}

            {showSecondary && (
              <section aria-labelledby="luca-secondary-title" className="space-y-4">
                <button
                  type="button"
                  className="flex min-h-12 w-full items-center gap-3 rounded-xl border px-4 py-3 text-left active:scale-[0.96] motion-safe:transition-transform"
                  style={{ background: theme.input, borderColor: theme.border, color: theme.text }}
                  aria-expanded={secondaryExpanded}
                  aria-controls="luca-secondary-panel"
                  onClick={() => setSecondaryOpen((open) => !open)}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: theme.goldSoft, color: theme.goldDeep }}>
                    <Layers3 className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span id="luca-secondary-title" className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      Disponíveis no Yume
                      <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: theme.surfaceHi, color: theme.textMute }}>
                        {secondaryPersonas.length}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs" style={{ color: theme.textMute }}>
                      Fora do roster e bloqueadas para execução até serem adicionadas ao LUCA.
                    </span>
                  </span>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 motion-safe:transition-transform ${secondaryExpanded ? 'rotate-180' : ''}`}
                    style={{ color: theme.textMute }}
                    aria-hidden="true"
                  />
                </button>

                {secondaryExpanded && (
                  <motion.div
                    id="luca-secondary-panel"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
                  >
                    {secondaryPersonas.map((persona, index) => (
                      <PersonaCard
                        key={persona.slug}
                        persona={persona}
                        delay={index * 0.025}
                        busy={busySlug === persona.slug}
                        onImport={() => importPersona(persona.slug)}
                        onRemove={() => removePersona(persona.slug)}
                      />
                    ))}
                    {!query.trim() && <NewPersonaCard delay={secondaryPersonas.length * 0.025} />}
                  </motion.div>
                )}
              </section>
            )}
          </div>
        ) : null}

        {!loading && visiblePersonaCount === 0 && (
          <div
            className="flex min-h-[220px] flex-col items-center justify-center gap-4 rounded-lg border px-6 py-10 text-center"
            style={{ borderColor: theme.border, color: theme.textMute }}
            data-personas-empty
          >
            <div>
              <p className="text-sm font-semibold" style={{ color: theme.textSoft }}>
                {personas.length === 0
                  ? 'Nenhuma persona no catálogo Yume.'
                  : 'Nenhuma persona corresponde à busca ou filtro.'}
              </p>
              <p className="mt-2 max-w-[48ch] text-xs leading-relaxed" style={{ color: theme.textGhost }}>
                {personas.length === 0
                  ? 'Abra o Yume para criar personas ou recarregue o catálogo quando o bridge estiver no ar.'
                  : 'Limpe a busca e o filtro, ou recarregue o catálogo se o Yume acabou de sincronizar.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {(query.trim() || filter !== 'all') ? (
                <button
                  type="button"
                  className="btn-primary !px-4 !py-2 !text-xs"
                  data-personas-clear-filters
                  onClick={() => {
                    setQuery('');
                    setFilter('all');
                  }}
                >
                  Limpar busca e filtro
                </button>
              ) : (
                <a
                  href={YUME_DASHBOARD_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-primary !px-4 !py-2 !text-xs inline-flex items-center gap-2"
                  data-personas-open-yume
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir Yume
                </a>
              )}
              <button
                type="button"
                className="btn-fleet !px-4 !py-2 !text-xs inline-flex items-center gap-2"
                data-personas-empty-reload
                onClick={() => void load()}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Recarregar catálogo
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  const theme = useTheme();
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: theme.input, border: `1px solid ${theme.border}` }}>
      <div className="text-[9px] font-semibold uppercase tracking-[0.18em]" style={{ color: theme.textGhost }}>{label}</div>
      <div className="mt-0.5 text-sm font-mono font-semibold" style={{ color: theme.textSoft }}>{value}</div>
    </div>
  );
}

function Notice({
  tone,
  title,
  body,
  actions,
}: {
  tone: 'warning' | 'error';
  title: string;
  body: string;
  actions?: ReactNode;
}) {
  const theme = useTheme();
  const color = tone === 'error' ? theme.error : theme.warning;
  const bg = tone === 'error' ? theme.errorBg : theme.warningBg;
  return (
    <div
      className="flex items-start gap-3 rounded-lg px-4 py-3"
      style={{ background: bg, border: `1px solid ${color}` }}
      data-personas-error={tone === 'error' ? '' : undefined}
      data-tone={tone}
      role={tone === 'error' ? 'alert' : undefined}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color }} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold" style={{ color }}>{title}</div>
        <div className="mt-1 text-xs leading-relaxed" style={{ color: theme.textSoft }}>{body}</div>
        {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

interface PersonaCardProps {
  persona: YumePersonaSummary;
  delay: number;
  busy: boolean;
  onImport: () => void;
  onRemove: () => void;
}

function PersonaCard({ persona, delay, busy, onImport, onRemove }: PersonaCardProps) {
  const theme = useTheme();
  const avatarUrl = persona.avatarUrl || persona.avatar_url || '';
  const initial = (persona.name || persona.slug || '?').trim().charAt(0).toUpperCase();

  return (
    <motion.article
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, delay, ease: [0.4, 0, 0.2, 1] }}
      className="group relative aspect-square overflow-hidden rounded-[18px]"
      style={{ background: theme.input, boxShadow: persona.imported ? `inset 3px 0 0 ${theme.gold}` : 'var(--l-shadow-card)' }}
    >
      <div className="absolute inset-0 flex items-center justify-center" style={{ background: theme.goldSoft, color: theme.goldDeep }}>
        <span className="font-display text-6xl font-bold">{initial}</span>
      </div>
      {avatarUrl && (
        <img
          src={avatarUrl}
          alt={persona.name}
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
          style={{ objectPosition: 'center 18%' }}
          onError={(event) => { event.currentTarget.style.display = 'none'; }}
        />
      )}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3">
        <span className={persona.imported ? 'state-badge ok' : 'state-badge dormant'}>
          {persona.imported ? 'LUCA' : 'Yume'}
        </span>
        {persona.version !== null && persona.version !== undefined && (
          <span className="rounded-full px-2 py-1 text-[10px] font-mono" style={{ background: 'rgba(5,8,13,0.62)', color: theme.text }}>
            v{persona.version}
          </span>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 translate-y-2 p-3 opacity-0 transition duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
        <div className="rounded-xl p-3 shadow-lg" style={{ background: 'rgba(10, 14, 20, 0.90)', color: theme.text, backdropFilter: 'blur(20px)' }}>
          <h2 className="truncate text-sm font-semibold">{persona.name}</h2>
          <div className="mt-1 truncate text-[11px] font-mono opacity-75">{persona.slug}</div>
          {persona.description && <p className="mt-2 line-clamp-2 text-xs leading-relaxed opacity-80">{persona.description}</p>}
          <button
            type="button"
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition disabled:opacity-50"
            style={{ background: persona.imported ? theme.errorBg : theme.goldSoft, color: theme.text }}
            disabled={busy}
            onClick={persona.imported ? onRemove : onImport}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : persona.imported ? (
              <Trash2 className="h-3.5 w-3.5" />
            ) : (
              <UserPlus className="h-3.5 w-3.5" />
            )}
            {persona.imported ? 'Remover do LUCA' : 'Adicionar ao LUCA'}
          </button>
        </div>
      </div>
    </motion.article>
  );
}

function NewPersonaCard({ delay }: { delay: number }) {
  const theme = useTheme();
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, delay, ease: [0.4, 0, 0.2, 1] }}
      className="group relative aspect-square overflow-hidden rounded-lg border text-left transition hover:-translate-y-1"
      style={{ background: theme.goldSoft, borderColor: theme.border }}
      onClick={() => window.open(YUME_DASHBOARD_URL, '_blank', 'noopener,noreferrer')}
      title="Abrir Yume"
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <Plus className="h-12 w-12 transition group-hover:scale-110" style={{ color: theme.goldDeep, opacity: 0.5 }} />
      </div>
      <div className="absolute bottom-3 right-3 flex items-center gap-1 text-[11px] font-semibold" style={{ color: theme.goldDeep }}>
        nova
        <ExternalLink className="h-3 w-3" />
      </div>
      <Sparkles className="absolute left-3 top-3 h-4 w-4" style={{ color: theme.goldDeep, opacity: 0.45 }} />
    </motion.button>
  );
}
