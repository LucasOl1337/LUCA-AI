import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  UsersRound,
  X,
} from 'lucide-react';
import { lucaApi } from '@/lib/api';
import { pickFailureCopy } from '@/lib/surface-failure';
import { useDeferredFlag } from '@/hooks/useDeferredFlag';
import type { PersonaCatalogOverride, RouterModelProfile, YumePersonaSummary } from '@/lib/types';
import { useTheme } from '@/hooks/useTheme';
import { useAppLocation } from '@/hooks/useAppLocation';
import type { AppLocation } from '../../shared/app-location.js';

type FilterMode = 'all' | 'visible' | 'hidden' | 'customized';

// Catálogo global: o que o admin define aqui vale para todas as contas.
// Não existe mais ativação por usuário nem link para o painel do Yume.
function filterFromLocation(value: string): FilterMode {
  if (value === 'visiveis' || value === 'ativadas') return 'visible';
  if (value === 'ocultas') return 'hidden';
  if (value === 'editadas') return 'customized';
  return 'all';
}

function filterToLocation(value: FilterMode): AppLocation['filtro'] {
  if (value === 'visible') return 'visiveis';
  if (value === 'hidden') return 'ocultas';
  if (value === 'customized') return 'editadas';
  return 'all';
}

function isVisible(persona: YumePersonaSummary): boolean {
  return persona.visible !== false;
}

export default function PersonasPage() {
  const theme = useTheme();
  const [personas, setPersonas] = useState<YumePersonaSummary[]>([]);
  const [profiles, setProfiles] = useState<RouterModelProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const { location, navigate } = useAppLocation();
  const query = location.busca;
  const filter = filterFromLocation(location.filtro);

  function setQuery(value: string) {
    navigate({ busca: value }, 'replace');
  }

  function setFilter(value: FilterMode) {
    navigate({ filtro: filterToLocation(value) }, 'replace');
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, models] = await Promise.all([
        lucaApi.adminListPersonas(),
        lucaApi.listRouterModels().catch(() => null),
      ]);
      setPersonas(data.personas ?? []);
      if (models?.profiles?.length) setProfiles(models.profiles);
    } catch (err) {
      setError(pickFailureCopy(err, {
        offline: 'Sem internet. Os cards que já estavam na grade continuam aqui. Reconecte e recarregue as fontes.',
        forbidden: 'Só o admin mexe no catálogo global de personas.',
        server: 'As fontes de personas não responderam. Tente de novo; o catálogo que já estava na tela permanece.',
      }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const savePersona = useCallback(async (slug: string, patch: PersonaCatalogOverride) => {
    setBusySlug(slug);
    setError(null);
    try {
      const data = await lucaApi.adminUpdatePersona(slug, patch);
      setPersonas(data.personas ?? []);
      return true;
    } catch (err) {
      setError(pickFailureCopy(err, {
        offline: 'Sem internet. A alteração não foi salva. Reconecte e tente de novo.',
        forbidden: 'Só o admin mexe no catálogo global de personas.',
        server: 'Não consegui salvar a persona. Tente de novo.',
      }));
      return false;
    } finally {
      setBusySlug(null);
    }
  }, []);

  const resetPersona = useCallback(async (slug: string) => {
    setBusySlug(slug);
    setError(null);
    try {
      const data = await lucaApi.adminResetPersona(slug);
      setPersonas(data.personas ?? []);
      return true;
    } catch (err) {
      setError(pickFailureCopy(err, {
        offline: 'Sem internet. Nada foi restaurado. Reconecte e tente de novo.',
        forbidden: 'Só o admin mexe no catálogo global de personas.',
        server: 'Não consegui restaurar a persona. Tente de novo.',
      }));
      return false;
    } finally {
      setBusySlug(null);
    }
  }, []);

  const visiblePersonas = useMemo(() => personas.filter(isVisible), [personas]);
  const hiddenPersonas = useMemo(() => personas.filter((persona) => !isVisible(persona)), [personas]);
  const customizedCount = personas.filter((persona) => persona.customized).length;

  const searchedPersonas = useMemo(() => {
    const term = query.trim().toLowerCase();
    return personas.filter((persona) => {
      if (filter === 'visible' && !isVisible(persona)) return false;
      if (filter === 'hidden' && isVisible(persona)) return false;
      if (filter === 'customized' && !persona.customized) return false;
      if (!term) return true;
      return [persona.name, persona.slug, persona.description, persona.model, persona.base?.name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [personas, query, filter]);

  const shownVisible = searchedPersonas.filter(isVisible);
  const shownHidden = searchedPersonas.filter((persona) => !isVisible(persona));
  const showVisibleSection = filter !== 'hidden';
  const showHiddenSection = filter !== 'visible';
  const visiblePersonaCount = (showVisibleSection ? shownVisible.length : 0) + (showHiddenSection ? shownHidden.length : 0);

  const showCatalogSkeleton = useDeferredFlag(loading && personas.length === 0);
  const editing = editingSlug ? personas.find((persona) => persona.slug === editingSlug) ?? null : null;

  return (
    <div className="luca-page-shell h-full overflow-y-auto px-6 py-7 sm:px-8">
      <div className="mx-auto max-w-[1360px] space-y-6">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ background: theme.goldSoft, color: theme.goldDeep }}>
              <UsersRound className="h-3.5 w-3.5" />
              Persona Source
            </div>
            <h1 className="void-title text-3xl">Persona Cards</h1>
            <p className="mt-2 text-sm" style={{ color: theme.textMute }}>
              Catálogo global: o que você define aqui vale para todas as contas. Oculte, renomeie, troque modelo, avatar e system prompt sem sair do LUCA.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Metric label="catalogo" value={personas.length} />
            <Metric label="visiveis" value={visiblePersonas.length} />
            <Metric label="ocultas" value={hiddenPersonas.length} />
            <Metric label="editadas" value={customizedCount} />
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
              ['visible', 'Visíveis'],
              ['hidden', 'Ocultas'],
              ['customized', 'Editadas'],
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
            title="Fontes de personas indisponíveis"
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

        {showCatalogSkeleton ? (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {Array.from({ length: 12 }, (_, index) => (
              <div key={index} className="aspect-square animate-pulse rounded-lg" style={{ background: theme.surfaceHi, border: `1px solid ${theme.border}` }} />
            ))}
          </div>
        ) : visiblePersonaCount > 0 ? (
          <div className="space-y-10">
            {showVisibleSection && (
              <section aria-labelledby="luca-visible-title" className="space-y-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4" style={{ color: theme.goldDeep }} aria-hidden="true" />
                    <h2 id="luca-visible-title" className="text-sm font-semibold" style={{ color: theme.text }}>
                      Visíveis para todos
                    </h2>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: theme.goldSoft, color: theme.goldDeep }}>
                      {shownVisible.length}
                    </span>
                  </div>
                  <p className="mt-1 text-xs" style={{ color: theme.textMute }}>
                    Aparecem na bancada de qualquer conta. Fonte editorial: Yume via Kamui (só leitura); builtins LUCA e cache sustentam a execução.
                  </p>
                </div>

                {shownVisible.length > 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
                  >
                    {shownVisible.map((persona, index) => (
                      <PersonaCard
                        key={persona.slug}
                        persona={persona}
                        delay={index * 0.025}
                        busy={busySlug === persona.slug}
                        onEdit={() => setEditingSlug(persona.slug)}
                        onToggleVisible={() => void savePersona(persona.slug, { visible: false })}
                      />
                    ))}
                  </motion.div>
                ) : (
                  <div className="rounded-xl border px-5 py-6 text-sm" style={{ borderColor: theme.border, color: theme.textMute }}>
                    {query.trim() ? 'Nenhuma persona visível corresponde à busca.' : 'Nenhuma persona visível. Mostre alguma na seção Ocultas.'}
                  </div>
                )}
              </section>
            )}

            {showHiddenSection && (shownHidden.length > 0 || filter === 'hidden') && (
              <section aria-labelledby="luca-hidden-title" className="space-y-4">
                <div>
                  <div className="flex items-center gap-2">
                    <EyeOff className="h-4 w-4" style={{ color: theme.textMute }} aria-hidden="true" />
                    <h2 id="luca-hidden-title" className="text-sm font-semibold" style={{ color: theme.text }}>
                      Ocultas
                    </h2>
                    <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: theme.surfaceHi, color: theme.textMute }}>
                      {shownHidden.length}
                    </span>
                  </div>
                  <p className="mt-1 text-xs" style={{ color: theme.textMute }}>
                    Ninguém vê essas na bancada até você mostrar de novo. Elas continuam no catálogo do Yume.
                  </p>
                </div>

                {shownHidden.length > 0 ? (
                  <motion.div
                    id="luca-hidden-panel"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
                  >
                    {shownHidden.map((persona, index) => (
                      <PersonaCard
                        key={persona.slug}
                        persona={persona}
                        delay={index * 0.025}
                        busy={busySlug === persona.slug}
                        onEdit={() => setEditingSlug(persona.slug)}
                        onToggleVisible={() => void savePersona(persona.slug, { visible: true })}
                      />
                    ))}
                  </motion.div>
                ) : (
                  <div className="rounded-xl border px-5 py-6 text-sm" style={{ borderColor: theme.border, color: theme.textMute }}>
                    Nenhuma persona oculta. Tudo do catálogo está visível.
                  </div>
                )}
              </section>
            )}
          </div>
        ) : null}

        {!loading && !error && visiblePersonaCount === 0 && (
          <div
            className="flex min-h-[220px] flex-col items-center justify-center gap-4 rounded-lg border px-6 py-10 text-center"
            style={{ borderColor: theme.border, color: theme.textMute }}
            data-personas-empty
          >
            <div>
              <p className="text-sm font-semibold" style={{ color: theme.textSoft }}>
                {personas.length === 0
                  ? 'Nenhuma persona disponível.'
                  : 'Nenhuma persona corresponde à busca ou filtro.'}
              </p>
              <p className="mt-2 max-w-[48ch] text-xs leading-relaxed" style={{ color: theme.textGhost }}>
                {personas.length === 0
                  ? 'Recarregue as fontes. O catálogo vem do Yume via Kamui; se o Kamui estiver fora, só os builtins do LUCA aparecem.'
                  : 'Limpe a busca e o filtro, ou recarregue o catálogo se o Yume acabou de sincronizar.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {(query.trim() || filter !== 'all') && (
                <button
                  type="button"
                  className="btn-primary !px-4 !py-2 !text-xs"
                  data-personas-clear-filters
                  onClick={() => {
                    navigate({ busca: '', filtro: 'all' }, 'replace');
                  }}
                >
                  Limpar busca e filtro
                </button>
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

      {editing && (
        <PersonaEditor
          key={editing.slug}
          persona={editing}
          profiles={profiles}
          busy={busySlug === editing.slug}
          onClose={() => setEditingSlug(null)}
          onSave={async (patch) => {
            const ok = await savePersona(editing.slug, patch);
            if (ok) setEditingSlug(null);
          }}
          onReset={async () => {
            const ok = await resetPersona(editing.slug);
            if (ok) setEditingSlug(null);
          }}
        />
      )}
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
  onEdit: () => void;
  onToggleVisible: () => void;
}

function PersonaCard({ persona, delay, busy, onEdit, onToggleVisible }: PersonaCardProps) {
  const theme = useTheme();
  const avatarUrl = persona.avatarUrl || persona.avatar_url || '';
  const initial = (persona.name || persona.slug || '?').trim().charAt(0).toUpperCase();
  const visible = isVisible(persona);

  return (
    <motion.article
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, delay, ease: [0.4, 0, 0.2, 1] }}
      className="group relative aspect-square cursor-pointer overflow-hidden rounded-[18px]"
      style={{
        background: theme.input,
        boxShadow: persona.customized ? `inset 3px 0 0 ${theme.gold}` : 'var(--l-shadow-card)',
        opacity: visible ? 1 : 0.55,
      }}
      data-persona-card={persona.slug}
      data-persona-visible={visible ? 'true' : 'false'}
      onClick={onEdit}
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
          style={{ objectPosition: 'center 18%', filter: visible ? undefined : 'grayscale(0.7)' }}
          onError={(event) => { event.currentTarget.style.display = 'none'; }}
        />
      )}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3">
        <div className="flex items-center gap-1.5">
          <span className={visible ? 'state-badge ok' : 'state-badge dormant'}>
            {visible ? 'Visível' : 'Oculta'}
          </span>
          {persona.customized && (
            <span className="state-badge" style={{ background: theme.goldSoft, color: theme.goldDeep }}>Editada</span>
          )}
        </div>
        {typeof persona.version === 'number' && (
          <span className="rounded-full px-2 py-1 text-[10px] font-mono" style={{ background: 'rgba(5,8,13,0.62)', color: theme.text }}>
            v{persona.version}
          </span>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 translate-y-2 p-3 opacity-0 transition duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
        <div className="rounded-xl p-3 shadow-lg" style={{ background: 'rgba(10, 14, 20, 0.90)', color: theme.text, backdropFilter: 'blur(20px)' }}>
          <h2 className="truncate text-sm font-semibold">{persona.name}</h2>
          <div className="mt-1 truncate text-[11px] font-mono opacity-75">{persona.slug}</div>
          {persona.model && <div className="mt-1 truncate text-[11px] font-mono opacity-60">{persona.model}</div>}
          {persona.description && <p className="mt-2 line-clamp-2 text-xs leading-relaxed opacity-80">{persona.description}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition"
              style={{ background: theme.goldSoft, color: theme.text }}
              onClick={(event) => {
                event.stopPropagation();
                onEdit();
              }}
              disabled={busy}
              data-persona-edit
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition"
              style={{ background: 'rgba(255,255,255,0.10)', color: theme.text }}
              onClick={(event) => {
                event.stopPropagation();
                onToggleVisible();
              }}
              disabled={busy}
              title={visible ? 'Ocultar para todos' : 'Mostrar para todos'}
              aria-label={visible ? 'Ocultar para todos' : 'Mostrar para todos'}
              data-persona-toggle-visible
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

interface PersonaEditorProps {
  persona: YumePersonaSummary;
  profiles: RouterModelProfile[];
  busy: boolean;
  onClose: () => void;
  onSave: (patch: PersonaCatalogOverride) => Promise<void>;
  onReset: () => Promise<void>;
}

function PersonaEditor({ persona, profiles, busy, onClose, onSave, onReset }: PersonaEditorProps) {
  const theme = useTheme();
  const override = persona.override ?? {};
  const base = persona.base ?? { name: persona.name, description: persona.description ?? '', purpose: persona.purpose ?? '', avatarUrl: persona.avatarUrl };
  const [visible, setVisible] = useState(isVisible(persona));
  const [name, setName] = useState(override.name ?? '');
  const [description, setDescription] = useState(override.description ?? '');
  const [purpose, setPurpose] = useState(override.purpose ?? '');
  const [model, setModel] = useState(override.model ?? '');
  const [avatarUrl, setAvatarUrl] = useState(override.avatarUrl ?? '');
  const [systemPrompt, setSystemPrompt] = useState(override.systemPrompt ?? '');

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const modelOptions = useMemo(() => {
    const ids = new Set(profiles.map((profile) => profile.model));
    const list = profiles.map((profile) => ({ id: profile.model, label: `${profile.name} · ${profile.model}` }));
    if (model && !ids.has(model)) list.unshift({ id: model, label: model });
    return list;
  }, [profiles, model]);

  const fieldStyle = { background: theme.input, borderColor: theme.border, color: theme.text };
  const labelStyle = { color: theme.textMute };
  const previewAvatar = avatarUrl.trim() || base.avatarUrl || persona.avatarUrl || '';

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="persona-editor-title"
      data-persona-editor={persona.slug}
    >
      <button
        type="button"
        className="absolute inset-0"
        style={{ background: 'rgba(3, 5, 9, 0.62)' }}
        aria-label="Fechar editor"
        onClick={onClose}
      />
      <motion.form
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        className="relative flex h-full w-full max-w-xl flex-col overflow-hidden"
        style={{ background: theme.void, borderLeft: `1px solid ${theme.border}` }}
        onSubmit={(event) => {
          event.preventDefault();
          void onSave({ visible, name, description, purpose, model, avatarUrl, systemPrompt });
        }}
      >
        <div className="flex items-start gap-4 px-6 pt-6 pb-4" style={{ borderBottom: `1px solid ${theme.border}` }}>
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl" style={{ background: theme.goldSoft }}>
            {previewAvatar && (
              <img
                src={previewAvatar}
                alt=""
                className="h-full w-full object-cover"
                style={{ objectPosition: 'center 18%' }}
                onError={(event) => { event.currentTarget.style.display = 'none'; }}
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: theme.goldDeep }}>Editar persona</div>
            <h2 id="persona-editor-title" className="truncate text-lg font-semibold" style={{ color: theme.text }}>{name.trim() || base.name}</h2>
            <div className="truncate text-[11px] font-mono" style={{ color: theme.textMute }}>
              {persona.slug}
              {typeof persona.version === 'number' ? ` · v${persona.version}` : ''}
              {persona.source ? ` · ${persona.source}` : ''}
            </div>
          </div>
          <button type="button" className="rounded-lg p-2 transition hover:bg-white/10" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4" style={{ color: theme.textMute }} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <label className="flex items-center justify-between gap-4 rounded-xl px-4 py-3" style={{ background: theme.input, border: `1px solid ${theme.border}` }}>
            <span>
              <span className="block text-sm font-semibold" style={{ color: theme.text }}>Visível para todos</span>
              <span className="block text-xs" style={labelStyle}>Desligado = some da bancada de todas as contas.</span>
            </span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-sky-400"
              checked={visible}
              onChange={(event) => setVisible(event.target.checked)}
              data-persona-field="visible"
            />
          </label>

          <Field label="Nome" hint={`Vazio = "${base.name}"`}>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={base.name}
              maxLength={80}
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
              style={fieldStyle}
              data-persona-field="name"
            />
          </Field>

          <Field label="Descrição" hint={base.description ? 'Vazio = descrição do Yume' : 'Vazio = sem descrição'}>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={base.description || 'Uma linha sobre o que essa persona faz.'}
              rows={3}
              maxLength={600}
              className="w-full resize-y rounded-lg border px-3 py-2.5 text-sm outline-none"
              style={fieldStyle}
              data-persona-field="description"
            />
          </Field>

          <Field label="Propósito" hint={base.purpose ? 'Vazio = propósito do Yume' : 'Vazio = sem propósito'}>
            <input
              type="text"
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              placeholder={base.purpose || 'Ex.: revisar código, criticar plano, resumir'}
              maxLength={300}
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
              style={fieldStyle}
              data-persona-field="purpose"
            />
          </Field>

          <Field label="Modelo no 9Router" hint={persona.yumeModel ? `Vazio = segue o Yume (${persona.yumeModel})` : 'Vazio = padrão do LUCA'}>
            <ModelSelect
              value={model}
              options={modelOptions}
              emptyLabel="Seguir o Yume / padrão do LUCA"
              onChange={setModel}
            />
          </Field>

          <Field label="Avatar (URL)" hint="http(s) ou caminho do próprio LUCA. Vazio = avatar do Yume.">
            <input
              type="text"
              value={avatarUrl}
              onChange={(event) => setAvatarUrl(event.target.value)}
              placeholder="https://…/avatar.png"
              maxLength={2000}
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
              style={fieldStyle}
              data-persona-field="avatarUrl"
            />
          </Field>

          <Field label="System prompt" hint="Vazio = usa o prompt do Yume (ou do builtin). Preenchido = substitui por completo na execução.">
            <textarea
              value={systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
              placeholder="Você é…"
              rows={10}
              maxLength={24000}
              className="w-full resize-y rounded-lg border px-3 py-2.5 font-mono text-xs leading-relaxed outline-none"
              style={fieldStyle}
              data-persona-field="systemPrompt"
            />
          </Field>
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4" style={{ borderTop: `1px solid ${theme.border}` }}>
          <button
            type="button"
            className="btn-fleet inline-flex items-center gap-2 !px-4 !text-xs"
            onClick={() => void onReset()}
            disabled={busy || !persona.customized}
            title="Apaga todos os overrides e volta ao que vem do Yume"
            data-persona-reset
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restaurar padrão
          </button>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-fleet !px-4 !text-xs" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary inline-flex items-center gap-2 !px-5 !text-xs" disabled={busy} data-persona-save>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Salvar para todos
            </button>
          </div>
        </div>
      </motion.form>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <div className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: theme.textSoft }}>{label}</span>
        {hint && <span className="truncate text-[11px]" style={{ color: theme.textGhost }}>{hint}</span>}
      </span>
      {children}
    </div>
  );
}

const MODEL_SELECT_SURFACE = '#12161d';

function ModelSelect({
  value,
  options,
  emptyLabel,
  onChange,
}: {
  value: string;
  options: Array<{ id: string; label: string }>;
  emptyLabel: string;
  onChange: (value: string) => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [menuBox, setMenuBox] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const current = options.find((option) => option.id === value);

  const placeMenu = useCallback(() => {
    const trigger = rootRef.current?.getBoundingClientRect();
    if (!trigger) return;
    const maxHeight = 256;
    const spaceBelow = window.innerHeight - trigger.bottom - 8;
    const openUp = spaceBelow < 160 && trigger.top > spaceBelow;
    const height = Math.min(maxHeight, Math.max(120, openUp ? trigger.top - 8 : spaceBelow));
    setMenuBox({
      top: openUp ? Math.max(8, trigger.top - height) : trigger.bottom + 4,
      left: trigger.left,
      width: trigger.width,
      maxHeight: height,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    placeMenu();
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
    window.addEventListener('resize', placeMenu);
    window.addEventListener('scroll', placeMenu, true);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('resize', placeMenu);
      window.removeEventListener('scroll', placeMenu, true);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, placeMenu]);

  function pick(next: string) {
    onChange(next);
    setOpen(false);
  }

  const menu = open && menuBox
    ? createPortal(
      <ul
        ref={listRef}
        role="listbox"
        className="fixed z-[80] overflow-y-auto rounded-lg border py-1 shadow-lg"
        style={{
          top: menuBox.top,
          left: menuBox.left,
          width: menuBox.width,
          maxHeight: menuBox.maxHeight,
          background: MODEL_SELECT_SURFACE,
          borderColor: theme.border,
          color: theme.text,
        }}
        data-persona-model-list
      >
        <li>
          <button
            type="button"
            role="option"
            aria-selected={!value}
            className="w-full px-3 py-2 text-left text-sm hover:bg-white/10"
            style={{ background: !value ? theme.goldSoft : 'transparent', color: theme.text }}
            onClick={() => pick('')}
            data-persona-model-option=""
          >
            {emptyLabel}
          </button>
        </li>
        {options.map((option) => {
          const selected = value === option.id;
          return (
            <li key={option.id}>
              <button
                type="button"
                role="option"
                aria-selected={selected}
                className="w-full px-3 py-2 text-left text-sm hover:bg-white/10"
                style={{ background: selected ? theme.goldSoft : 'transparent', color: theme.text }}
                onClick={() => pick(option.id)}
                data-persona-model-option={option.id}
              >
                {option.label}
              </button>
            </li>
          );
        })}
      </ul>,
      document.body,
    )
    : null;

  return (
    <div ref={rootRef} className="relative" data-persona-field="model">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        className="luca-persona-model-select w-full rounded-lg border px-3 py-2.5 text-left text-sm outline-none"
        style={{ background: MODEL_SELECT_SURFACE, borderColor: theme.border, color: theme.text }}
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          placeMenu();
          setOpen(true);
        }}
        data-persona-model-trigger
      >
        {current?.label || emptyLabel}
      </button>
      {menu}
    </div>
  );
}
