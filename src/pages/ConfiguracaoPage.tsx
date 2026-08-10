import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { buildApiErrorMessage, lucaApi } from '@/lib/api';
import type { LucaAiIndividualTemplate, LucaAiTeamTemplate, YumePersonaSummary } from '@/lib/types';
import {
  PRESET_ICON_MAP,
  resolvePresetIcon,
  type LucaPresetIconId,
} from '@/lib/lucaPresets';
import { useTheme } from '@/hooks/useTheme';
import { PRESET_ICON_IDS, TEAM_ROLE_ORDER } from '../../shared/luca-preset-seed.js';

type Kind = 'team' | 'individual';
type RoleId = 'supervisor' | 'mission' | 'execution' | 'approval' | 'display' | 'visual';
const ROLE_ORDER = TEAM_ROLE_ORDER as readonly RoleId[];

const ROLE_LABELS: Record<RoleId, string> = {
  supervisor: 'Supervisor',
  mission: 'Decisor da missão',
  execution: 'Executores',
  approval: 'Aprovação',
  display: 'Exibição final',
  visual: 'Especialista visual',
};

const ROLE_LIMITS: Record<RoleId, number> = {
  supervisor: 1,
  mission: 1,
  execution: 4,
  approval: 1,
  display: 1,
  visual: 1,
};

const ICON_OPTIONS = PRESET_ICON_IDS as LucaPresetIconId[];

function emptyTeam(): LucaAiTeamTemplate {
  return {
    id: '',
    label: '',
    description: '',
    icon: 'users',
    assignments: {
      supervisor: [],
      mission: [],
      execution: [],
      approval: [],
      display: [],
      visual: [],
    },
  };
}

function emptyIndividual(): LucaAiIndividualTemplate {
  return {
    id: '',
    label: '',
    description: '',
    icon: 'users',
    participants: [],
    judge: null,
  };
}

function unique(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const slug = String(value || '').trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
    if (out.length >= limit) break;
  }
  return out;
}

export default function ConfiguracaoPage() {
  const theme = useTheme();
  const [kind, setKind] = useState<Kind>('team');
  const [team, setTeam] = useState<LucaAiTeamTemplate[]>([]);
  const [individual, setIndividual] = useState<LucaAiIndividualTemplate[]>([]);
  const [personas, setPersonas] = useState<YumePersonaSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTeam, setDraftTeam] = useState<LucaAiTeamTemplate>(emptyTeam());
  const [draftIndividual, setDraftIndividual] = useState<LucaAiIndividualTemplate>(emptyIndividual());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [templates, catalog] = await Promise.all([
        lucaApi.listTeamTemplates(),
        lucaApi.listYumePersonas(undefined, 15000),
      ]);
      setTeam(templates.team || []);
      setIndividual(templates.individual || []);
      setPersonas(catalog.personas || []);
    } catch (err) {
      setError(buildApiErrorMessage(err, 'Falha ao carregar configuração de equipes.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const list = kind === 'team' ? team : individual;
  const personaBySlug = useMemo(
    () => new Map(personas.map((persona) => [persona.slug, persona])),
    [personas],
  );

  function openCreate() {
    setEditingId(null);
    setDraftTeam(emptyTeam());
    setDraftIndividual(emptyIndividual());
    setEditorOpen(true);
  }

  function openEdit(id: string) {
    if (kind === 'team') {
      const item = team.find((entry) => entry.id === id);
      if (!item) return;
      setDraftTeam(JSON.parse(JSON.stringify(item)));
    } else {
      const item = individual.find((entry) => entry.id === id);
      if (!item) return;
      setDraftIndividual(JSON.parse(JSON.stringify(item)));
    }
    setEditingId(id);
    setEditorOpen(true);
  }

  async function saveDraft() {
    setBusy(true);
    setError(null);
    try {
      if (kind === 'team') {
        const payload = {
          label: draftTeam.label,
          description: draftTeam.description,
          icon: draftTeam.icon,
          assignments: draftTeam.assignments,
        };
        const res = editingId
          ? await lucaApi.updateTeamTemplate('team', editingId, payload)
          : await lucaApi.createTeamTemplate('team', payload);
        setTeam(res.team || []);
        setIndividual(res.individual || []);
      } else {
        const payload = {
          label: draftIndividual.label,
          description: draftIndividual.description,
          icon: draftIndividual.icon,
          participants: draftIndividual.participants,
          judge: draftIndividual.judge,
        };
        const res = editingId
          ? await lucaApi.updateTeamTemplate('individual', editingId, payload)
          : await lucaApi.createTeamTemplate('individual', payload);
        setTeam(res.team || []);
        setIndividual(res.individual || []);
      }
      setEditorOpen(false);
    } catch (err) {
      setError(buildApiErrorMessage(err, 'Falha ao salvar template.'));
    } finally {
      setBusy(false);
    }
  }

  async function removeTemplate(id: string) {
    if (!window.confirm('Apagar este template?')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await lucaApi.deleteTeamTemplate(kind, id);
      setTeam(res.team || []);
      setIndividual(res.individual || []);
    } catch (err) {
      setError(buildApiErrorMessage(err, 'Falha ao apagar template.'));
    } finally {
      setBusy(false);
    }
  }

  async function moveTemplate(id: string, direction: -1 | 1) {
    const ids = list.map((item) => item.id);
    const index = ids.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    const next = ids.slice();
    [next[index], next[target]] = [next[target], next[index]];
    setBusy(true);
    setError(null);
    try {
      const res = await lucaApi.reorderTeamTemplates(kind, next);
      setTeam(res.team || []);
      setIndividual(res.individual || []);
    } catch (err) {
      setError(buildApiErrorMessage(err, 'Falha ao reordenar templates.'));
    } finally {
      setBusy(false);
    }
  }

  function toggleTeamRole(roleId: RoleId, slug: string) {
    setDraftTeam((prev) => {
      const current = prev.assignments[roleId] || [];
      const limit = ROLE_LIMITS[roleId];
      const has = current.includes(slug);
      const next = has
        ? current.filter((item) => item !== slug)
        : unique([...current, slug], limit);
      return {
        ...prev,
        assignments: { ...prev.assignments, [roleId]: next },
      };
    });
  }

  function toggleParticipant(slug: string) {
    setDraftIndividual((prev) => {
      const has = prev.participants.includes(slug);
      return {
        ...prev,
        participants: has
          ? prev.participants.filter((item) => item !== slug)
          : unique([...prev.participants, slug], 5),
      };
    });
  }

  return (
    <div className="luca-page-shell h-full overflow-y-auto px-6 py-7 sm:px-8">
      <div className="mx-auto max-w-[1200px] space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div
              className="mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]"
              style={{ background: theme.goldSoft, color: theme.goldDeep }}
            >
              <Settings2 className="h-3.5 w-3.5" />
              Bancada
            </div>
            <h1 className="void-title text-3xl">Configuração</h1>
            <p className="mt-2 max-w-[60ch] text-sm" style={{ color: theme.textMute }}>
              Crie, edite, reordene e apague templates de Equipe e Individual. Secundárias do Yume entram via cache local (GET only).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Metric label="equipes" value={team.length} />
            <Metric label="individuais" value={individual.length} />
            <button type="button" className="btn-fleet inline-flex items-center gap-2" onClick={() => void load()} disabled={loading || busy}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Recarregar
            </button>
            <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={openCreate} disabled={busy}>
              <Plus className="h-4 w-4" />
              Novo template
            </button>
          </div>
        </header>

        <div className="luca-ai-view-switch w-fit" role="group" aria-label="Tipo de template">
          <button type="button" className={kind === 'team' ? 'active' : ''} aria-pressed={kind === 'team'} onClick={() => setKind('team')}>
            <Users className="h-4 w-4" /> Equipe
          </button>
          <button type="button" className={kind === 'individual' ? 'active' : ''} aria-pressed={kind === 'individual'} onClick={() => setKind('individual')}>
            Individual
          </button>
        </div>

        {error && (
          <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: theme.border, background: theme.input, color: theme.error }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex min-h-[240px] items-center justify-center gap-2 text-sm" style={{ color: theme.textMute }}>
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando templates…
          </div>
        ) : (
          <div className="space-y-3">
            {list.length === 0 && (
              <p className="rounded-xl border px-4 py-8 text-center text-sm" style={{ borderColor: theme.border, color: theme.textMute }}>
                Nenhum template neste tipo. Crie o primeiro.
              </p>
            )}
            {list.map((item, index) => {
              const Icon = resolvePresetIcon(item.icon);
              const chips = kind === 'team'
                ? ROLE_ORDER.flatMap((roleId) => (item as LucaAiTeamTemplate).assignments[roleId] || [])
                : [
                    ...((item as LucaAiIndividualTemplate).participants || []),
                    (item as LucaAiIndividualTemplate).judge,
                  ].filter(Boolean) as string[];
              return (
                <article
                  key={item.id}
                  className="rounded-2xl border p-4"
                  style={{ borderColor: theme.border, background: theme.surface }}
                  data-template-id={item.id}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: theme.goldSoft, color: theme.goldDeep }}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <h2 className="truncate text-base font-semibold" style={{ color: theme.text }}>{item.label}</h2>
                        <p className="mt-1 text-xs leading-relaxed" style={{ color: theme.textMute }}>{item.description || 'Sem descrição.'}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {chips.map((slug) => {
                            const persona = personaBySlug.get(slug);
                            return (
                              <span
                                key={`${item.id}-${slug}`}
                                className="rounded-full border px-2 py-0.5 text-[10px]"
                                style={{
                                  borderColor: theme.border,
                                  color: persona?.is_official === false ? theme.textGhost : theme.textSoft,
                                }}
                                title={persona?.is_official === false ? 'Secundária' : 'Oficial'}
                              >
                                {persona?.name || slug}
                                {persona?.is_official === false ? ' · sec' : ''}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1">
                      <IconButton label="Subir" onClick={() => void moveTemplate(item.id, -1)} disabled={busy || index === 0}>
                        <ArrowUp className="h-4 w-4" />
                      </IconButton>
                      <IconButton label="Descer" onClick={() => void moveTemplate(item.id, 1)} disabled={busy || index === list.length - 1}>
                        <ArrowDown className="h-4 w-4" />
                      </IconButton>
                      <IconButton label="Editar" onClick={() => openEdit(item.id)} disabled={busy}>
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                      <IconButton label="Apagar" onClick={() => void removeTemplate(item.id)} disabled={busy}>
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border p-5" style={{ background: theme.surface, borderColor: theme.border }}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold" style={{ color: theme.text }}>
                  {editingId ? 'Editar template' : 'Novo template'} · {kind === 'team' ? 'Equipe' : 'Individual'}
                </h2>
                <p className="mt-1 text-xs" style={{ color: theme.textMute }}>
                  Personas secundárias podem ser escolhidas; o LUCA cacheia via Kamui GET.
                </p>
              </div>
              <button type="button" className="grid h-9 w-9 place-items-center rounded-lg" onClick={() => setEditorOpen(false)} aria-label="Fechar">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <Field label="Nome">
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ background: theme.input, borderColor: theme.border, color: theme.text }}
                  value={kind === 'team' ? draftTeam.label : draftIndividual.label}
                  onChange={(event) => {
                    const label = event.target.value;
                    if (kind === 'team') setDraftTeam((prev) => ({ ...prev, label }));
                    else setDraftIndividual((prev) => ({ ...prev, label }));
                  }}
                />
              </Field>
              <Field label="Descrição">
                <textarea
                  rows={2}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ background: theme.input, borderColor: theme.border, color: theme.text }}
                  value={kind === 'team' ? draftTeam.description : draftIndividual.description}
                  onChange={(event) => {
                    const description = event.target.value;
                    if (kind === 'team') setDraftTeam((prev) => ({ ...prev, description }));
                    else setDraftIndividual((prev) => ({ ...prev, description }));
                  }}
                />
              </Field>
              <Field label="Ícone">
                <div className="flex flex-wrap gap-2">
                  {ICON_OPTIONS.map((iconId) => {
                    const Icon = PRESET_ICON_MAP[iconId] || Users;
                    const active = (kind === 'team' ? draftTeam.icon : draftIndividual.icon) === iconId;
                    return (
                      <button
                        key={iconId}
                        type="button"
                        className="grid h-10 w-10 place-items-center rounded-xl border"
                        style={{
                          background: active ? theme.goldSoft : theme.input,
                          borderColor: active ? theme.borderActive : theme.border,
                          color: theme.goldDeep,
                        }}
                        onClick={() => {
                          if (kind === 'team') setDraftTeam((prev) => ({ ...prev, icon: iconId }));
                          else setDraftIndividual((prev) => ({ ...prev, icon: iconId }));
                        }}
                        aria-label={iconId}
                      >
                        <Icon className="h-4 w-4" />
                      </button>
                    );
                  })}
                </div>
              </Field>

              {kind === 'team' ? (
                ROLE_ORDER.map((roleId) => (
                  <RolePicker
                    key={roleId}
                    label={ROLE_LABELS[roleId]}
                    limit={ROLE_LIMITS[roleId]}
                    selected={draftTeam.assignments[roleId] || []}
                    personas={personas}
                    onToggle={(slug) => toggleTeamRole(roleId, slug)}
                  />
                ))
              ) : (
                <>
                  <RolePicker
                    label="Participantes"
                    limit={5}
                    selected={draftIndividual.participants}
                    personas={personas}
                    onToggle={toggleParticipant}
                  />
                  <RolePicker
                    label="Juiz"
                    limit={1}
                    selected={draftIndividual.judge ? [draftIndividual.judge] : []}
                    personas={personas}
                    onToggle={(slug) => setDraftIndividual((prev) => ({
                      ...prev,
                      judge: prev.judge === slug ? null : slug,
                    }))}
                  />
                </>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-fleet" onClick={() => setEditorOpen(false)} disabled={busy}>Cancelar</button>
              <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={() => void saveDraft()} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  const theme = useTheme();
  return (
    <div className="rounded-xl border px-3 py-2 text-center" style={{ borderColor: theme.border, background: theme.input }}>
      <div className="text-lg font-semibold" style={{ color: theme.text }}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: theme.textGhost }}>{label}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: theme.textGhost }}>{label}</span>
      {children}
    </label>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-lg border disabled:opacity-40"
      style={{ borderColor: theme.border, background: theme.input, color: theme.textSoft }}
    >
      {children}
    </button>
  );
}

function RolePicker({
  label,
  limit,
  selected,
  personas,
  onToggle,
}: {
  label: string;
  limit: number;
  selected: string[];
  personas: YumePersonaSummary[];
  onToggle: (slug: string) => void;
}) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const term = query.trim().toLowerCase();
  const visible = personas.filter((persona) => {
    if (!term) return true;
    return [persona.name, persona.slug, persona.description]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term));
  }).slice(0, 40);

  return (
    <section className="rounded-xl border p-3" style={{ borderColor: theme.border, background: theme.input }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold" style={{ color: theme.textSoft }}>{label}</h3>
        <span className="text-[10px] font-mono" style={{ color: theme.textGhost }}>{selected.length}/{limit}</span>
      </div>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar persona"
        className="mb-2 w-full rounded-lg border px-3 py-2 text-sm outline-none"
        style={{ background: theme.surface, borderColor: theme.border, color: theme.text }}
      />
      <div className="max-h-40 space-y-1 overflow-y-auto">
        {visible.map((persona) => {
          const active = selected.includes(persona.slug);
          const limitReached = !active && selected.length >= limit;
          return (
            <button
              key={persona.slug}
              type="button"
              disabled={limitReached}
              onClick={() => onToggle(persona.slug)}
              className="flex w-full items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-left text-xs disabled:opacity-40"
              style={{
                borderColor: active ? theme.borderActive : theme.border,
                background: active ? theme.goldSoft : 'transparent',
                color: theme.textSoft,
              }}
            >
              <span className="min-w-0 truncate">
                {persona.name}
                {persona.is_official === false ? ' · sec' : ''}
              </span>
              <span className="shrink-0 font-mono text-[10px]" style={{ color: theme.textGhost }}>{persona.slug}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
