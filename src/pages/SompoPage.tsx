import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Building2,
  CloudRain,
  Filter,
  Loader2,
  MapPin,
  Play,
  Scale,
  Search,
  Sprout,
  TriangleAlert,
  Users,
  Wheat,
} from 'lucide-react';
import type { PageId } from '@/components/Layout';
import { useTheme } from '@/hooks/useTheme';
import { useChatLibrary } from '@/hooks/useChatLibrary';
import { buildApiErrorMessage, lucaApi } from '@/lib/api';
import {
  hydrateIndividualTemplate,
  hydrateTeamTemplate,
  individualPresetSlugs,
  LUCA_INDIVIDUAL_PRESETS,
  LUCA_TEAM_PRESETS,
  teamPresetSlugs,
  type LucaIndividualPreset,
  type LucaTeamPreset,
} from '@/lib/lucaPresets';
import {
  SOMPO_EXAMPLE_CASES,
  SOMPO_INDUSTRY_CONTEXT,
  SOMPO_SEVERITY_LABELS,
  buildSompoCaseMission,
  queueSompoLaunch,
  type SompoCaseSeverity,
  type SompoExampleCase,
  type SompoLaunchMode,
  type SompoProductLine,
} from '@/lib/sompo-cases';

interface SompoPageProps {
  onNavigate: (page: PageId) => void;
}

type ProductFilter = 'all' | SompoProductLine;
type SeverityFilter = 'all' | SompoCaseSeverity;

const PRODUCT_FILTERS: { id: ProductFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'agricola-produtividade', label: 'Produtividade' },
  { id: 'agricola-custeio', label: 'Custeio' },
  { id: 'penhor-rural', label: 'Penhor' },
  { id: 'carteira', label: 'Carteira' },
];

const SEVERITY_FILTERS: { id: SeverityFilter; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'critica', label: 'Crítica' },
  { id: 'alta', label: 'Alta' },
  { id: 'media', label: 'Média' },
  { id: 'baixa', label: 'Baixa' },
];

function severityColor(severity: SompoCaseSeverity, theme: ReturnType<typeof useTheme>): string {
  if (severity === 'critica') return theme.error;
  if (severity === 'alta') return theme.warning;
  if (severity === 'media') return theme.goldDeep;
  return theme.alive;
}

function defaultTeamPresetId(list: LucaTeamPreset[]): string {
  return list.find((item) => item.id === 'risco-agro')?.id
    || list.find((item) => /agro|risco|sompo/i.test(`${item.id} ${item.label}`))?.id
    || list[0]?.id
    || '';
}

function defaultIndividualPresetId(list: LucaIndividualPreset[]): string {
  return list.find((item) => item.id === 'comite-risco-agro')?.id
    || list.find((item) => /agro|risco|sompo/i.test(`${item.id} ${item.label}`))?.id
    || list[0]?.id
    || '';
}

export default function SompoPage({ onNavigate }: SompoPageProps) {
  const theme = useTheme();
  const { createSession, busy: sessionsBusy } = useChatLibrary();
  const [query, setQuery] = useState('');
  const [productFilter, setProductFilter] = useState<ProductFilter>('all');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [selectedId, setSelectedId] = useState<string>(SOMPO_EXAMPLE_CASES[0]?.id || '');
  const [teamMode, setTeamMode] = useState<SompoLaunchMode>('team');
  const [teamPresets, setTeamPresets] = useState<LucaTeamPreset[]>(LUCA_TEAM_PRESETS);
  const [individualPresets, setIndividualPresets] = useState<LucaIndividualPreset[]>(LUCA_INDIVIDUAL_PRESETS);
  const [selectedTeamId, setSelectedTeamId] = useState<string>(defaultTeamPresetId(LUCA_TEAM_PRESETS));
  const [selectedIndividualId, setSelectedIndividualId] = useState<string>(
    defaultIndividualPresetId(LUCA_INDIVIDUAL_PRESETS),
  );
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    setTemplatesError(null);
    try {
      const data = await lucaApi.listTeamTemplates(undefined, 15000);
      const team = (data.team || []).map(hydrateTeamTemplate);
      const individual = (data.individual || [])
        .map(hydrateIndividualTemplate)
        .filter((item) => item.participants.length > 0 && item.judge);
      const nextTeam = team.length ? team : LUCA_TEAM_PRESETS;
      const nextIndividual = individual.length ? individual : LUCA_INDIVIDUAL_PRESETS;
      setTeamPresets(nextTeam);
      setIndividualPresets(nextIndividual);
      setSelectedTeamId((prev) => (
        nextTeam.some((item) => item.id === prev) ? prev : defaultTeamPresetId(nextTeam)
      ));
      setSelectedIndividualId((prev) => (
        nextIndividual.some((item) => item.id === prev) ? prev : defaultIndividualPresetId(nextIndividual)
      ));
    } catch (err) {
      setTemplatesError(buildApiErrorMessage(err, 'Falha ao carregar equipes. Usando presets embutidos.'));
      setTeamPresets(LUCA_TEAM_PRESETS);
      setIndividualPresets(LUCA_INDIVIDUAL_PRESETS);
      setSelectedTeamId(defaultTeamPresetId(LUCA_TEAM_PRESETS));
      setSelectedIndividualId(defaultIndividualPresetId(LUCA_INDIVIDUAL_PRESETS));
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return SOMPO_EXAMPLE_CASES.filter((item) => {
      if (productFilter !== 'all' && item.product !== productFilter) return false;
      if (severityFilter !== 'all' && item.severity !== severityFilter) return false;
      if (!term) return true;
      const haystack = [
        item.title,
        item.subtitle,
        item.culture,
        item.region,
        item.riskEvent,
        item.productLabel,
        item.stageLabel,
        ...item.tags,
        item.situation,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [productFilter, query, severityFilter]);

  const selected = useMemo(
    () => filtered.find((item) => item.id === selectedId) || filtered[0] || null,
    [filtered, selectedId],
  );

  const selectedTeam = useMemo(
    () => teamPresets.find((item) => item.id === selectedTeamId) || teamPresets[0] || null,
    [selectedTeamId, teamPresets],
  );
  const selectedIndividual = useMemo(
    () => individualPresets.find((item) => item.id === selectedIndividualId) || individualPresets[0] || null,
    [individualPresets, selectedIndividualId],
  );
  const activeSquad = teamMode === 'team' ? selectedTeam : selectedIndividual;
  const activeSlugs = useMemo(() => {
    if (!activeSquad) return [] as string[];
    if (teamMode === 'team') return teamPresetSlugs(activeSquad as LucaTeamPreset);
    return individualPresetSlugs(activeSquad as LucaIndividualPreset);
  }, [activeSquad, teamMode]);

  async function runCaseWithSquad(caseItem: SompoExampleCase) {
    if (!activeSquad || launching || sessionsBusy) return;
    setLaunching(true);
    setLaunchError(null);
    try {
      const session = await createSession();
      if (!session) {
        setLaunchError('Não foi possível abrir uma sessão limpa na bancada.');
        return;
      }
      queueSompoLaunch({
        caseId: caseItem.id,
        mission: buildSompoCaseMission(caseItem, activeSquad.label),
        mode: teamMode,
        presetId: activeSquad.id,
        presetLabel: activeSquad.label,
        autoRun: true,
      });
      onNavigate('luca-ai');
    } catch (err) {
      setLaunchError(buildApiErrorMessage(err, 'Falha ao iniciar a avaliação do caso.'));
    } finally {
      setLaunching(false);
    }
  }

  return (
    <div className="luca-page-shell h-full overflow-y-auto px-6 py-7 sm:px-8">
      <div className="mx-auto max-w-[1360px] space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div
              className="mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]"
              style={{ background: theme.goldSoft, color: theme.goldDeep }}
            >
              <Wheat className="h-3.5 w-3.5" />
              SOMPO · casos + equipe
            </div>
            <h1 className="void-title text-3xl">SOMPO</h1>
            <p className="mt-2 max-w-[70ch] text-sm leading-relaxed" style={{ color: theme.textMute }}>
              1) escolha o caso agrícola · 2) escolha a equipe (modo Equipe ou Individual) · 3) rode a avaliação
              na bancada. Cenários didáticos com padrões públicos do seguro rural.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Metric label="casos" value={SOMPO_EXAMPLE_CASES.length} />
            <Metric label="equipes" value={teamPresets.length} />
            <Metric label="individuais" value={individualPresets.length} />
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {SOMPO_INDUSTRY_CONTEXT.map((fact) => (
            <article
              key={fact.id}
              className="rounded-2xl border p-4"
              style={{ borderColor: theme.border, background: theme.surface }}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: theme.textGhost }}>
                  {fact.label}
                </span>
                <CloudRain className="h-4 w-4 shrink-0" style={{ color: theme.goldDeep }} />
              </div>
              <p className="mt-2 text-xl font-semibold" style={{ color: theme.text }}>{fact.value}</p>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: theme.textMute }}>{fact.detail}</p>
              <p className="mt-3 text-[10px] leading-relaxed" style={{ color: theme.textGhost }}>Fonte: {fact.source}</p>
            </article>
          ))}
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border p-4" style={{ borderColor: theme.border, background: theme.surface }}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: theme.textGhost }} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por cultura, região, evento, ZARC, granizo…"
                className="w-full rounded-xl border py-2.5 pl-10 pr-3 text-sm outline-none"
                style={{ borderColor: theme.border, background: theme.input, color: theme.text }}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="h-4 w-4" style={{ color: theme.textGhost }} />
              {PRODUCT_FILTERS.map((item) => (
                <Chip
                  key={item.id}
                  active={productFilter === item.id}
                  onClick={() => setProductFilter(item.id)}
                  label={item.label}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: theme.textGhost }}>
              Severidade
            </span>
            {SEVERITY_FILTERS.map((item) => (
              <Chip
                key={item.id}
                active={severityFilter === item.id}
                onClick={() => setSeverityFilter(item.id)}
                label={item.label}
              />
            ))}
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.95fr)]">
          <section className="space-y-3">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: theme.textGhost }}>
              1 · Caso agrícola
            </h2>
            {filtered.length === 0 && (
              <p className="rounded-2xl border px-4 py-10 text-center text-sm" style={{ borderColor: theme.border, color: theme.textMute }}>
                Nenhum caso com esses filtros.
              </p>
            )}
            {filtered.map((item) => {
              const active = selected?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className="w-full rounded-2xl border p-4 text-left transition-colors"
                  style={{
                    borderColor: active ? theme.borderActive : theme.border,
                    background: active ? theme.surfaceHi : theme.surface,
                    boxShadow: active ? `0 0 0 1px ${theme.goldSoft}` : undefined,
                  }}
                  data-sompo-case={item.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold" style={{ color: theme.text }}>{item.title}</h3>
                      <p className="mt-1 text-xs leading-relaxed" style={{ color: theme.textMute }}>{item.subtitle}</p>
                    </div>
                    <span
                      className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
                      style={{ background: theme.input, color: severityColor(item.severity, theme) }}
                    >
                      {SOMPO_SEVERITY_LABELS[item.severity]}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px]" style={{ color: theme.textSoft }}>
                    <Meta icon={Sprout} text={item.culture} />
                    <Meta icon={MapPin} text={item.region} />
                    <Meta icon={Building2} text={item.productLabel} />
                    <Meta icon={TriangleAlert} text={item.riskEvent} />
                  </div>
                </button>
              );
            })}
          </section>

          <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
            {selected ? (
              <>
                <article
                  className="space-y-3 rounded-2xl border p-5"
                  style={{ borderColor: theme.border, background: theme.surface }}
                  data-sompo-detail={selected.id}
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ background: theme.goldSoft, color: theme.goldDeep }}>
                      {selected.stageLabel}
                    </span>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ background: theme.input, color: severityColor(selected.severity, theme) }}>
                      {SOMPO_SEVERITY_LABELS[selected.severity]}
                    </span>
                  </div>
                  <h2 className="text-xl font-semibold" style={{ color: theme.text }}>{selected.title}</h2>
                  <p className="text-sm leading-relaxed" style={{ color: theme.textSoft }}>{selected.situation}</p>
                  <Block title="Sinais" theme={theme}>
                    <ul className="space-y-1 text-xs leading-relaxed" style={{ color: theme.textMute }}>
                      {selected.signals.slice(0, 4).map((signal) => (
                        <li key={signal}>• {signal}</li>
                      ))}
                    </ul>
                  </Block>
                </article>

                <article
                  className="space-y-4 rounded-2xl border p-5"
                  style={{ borderColor: theme.border, background: theme.surface }}
                  data-sompo-squad-panel
                >
                  <div>
                    <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: theme.textGhost }}>
                      2 · Quem avalia
                    </h2>
                    <p className="mt-1 text-sm" style={{ color: theme.textMute }}>
                      Escolha um template do modo Equipe ou do modo Individual (os mesmos da Configuração / bancada).
                    </p>
                  </div>

                  <div className="luca-ai-view-switch w-full" role="group" aria-label="Modo da equipe">
                    <button
                      type="button"
                      className={teamMode === 'team' ? 'active' : ''}
                      aria-pressed={teamMode === 'team'}
                      onClick={() => setTeamMode('team')}
                    >
                      <Users className="h-4 w-4" /> Equipe
                    </button>
                    <button
                      type="button"
                      className={teamMode === 'individual' ? 'active' : ''}
                      aria-pressed={teamMode === 'individual'}
                      onClick={() => setTeamMode('individual')}
                    >
                      <Scale className="h-4 w-4" /> Individual
                    </button>
                  </div>

                  {templatesError && (
                    <p className="rounded-xl border px-3 py-2 text-xs" style={{ borderColor: theme.border, color: theme.warning }}>
                      {templatesError}
                    </p>
                  )}

                  {templatesLoading ? (
                    <div className="flex items-center gap-2 text-sm" style={{ color: theme.textMute }}>
                      <Loader2 className="h-4 w-4 animate-spin" /> Carregando equipes…
                    </div>
                  ) : (
                    <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                      {teamMode === 'team'
                        ? teamPresets.map((preset) => {
                          const active = selectedTeam?.id === preset.id;
                          const Icon = preset.icon;
                          const slugs = teamPresetSlugs(preset);
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => setSelectedTeamId(preset.id)}
                              className="w-full rounded-xl border p-3 text-left"
                              style={{
                                borderColor: active ? theme.borderActive : theme.border,
                                background: active ? theme.goldSoft : theme.input,
                              }}
                              data-sompo-team={preset.id}
                            >
                              <div className="flex items-start gap-3">
                                <span className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: theme.surface, color: theme.goldDeep }}>
                                  <Icon className="h-4 w-4" />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-semibold" style={{ color: theme.text }}>{preset.label}</div>
                                  <p className="mt-0.5 text-[11px] leading-relaxed" style={{ color: theme.textMute }}>
                                    {preset.description || 'Template de equipe'}
                                  </p>
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {slugs.slice(0, 6).map((slug) => (
                                      <span key={slug} className="rounded-full border px-1.5 py-0.5 text-[9px]" style={{ borderColor: theme.border, color: theme.textGhost }}>
                                        {slug}
                                      </span>
                                    ))}
                                    {slugs.length > 6 && (
                                      <span className="text-[9px]" style={{ color: theme.textGhost }}>+{slugs.length - 6}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </button>
                          );
                        })
                        : individualPresets.map((preset) => {
                          const active = selectedIndividual?.id === preset.id;
                          const Icon = preset.icon;
                          const slugs = individualPresetSlugs(preset);
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => setSelectedIndividualId(preset.id)}
                              className="w-full rounded-xl border p-3 text-left"
                              style={{
                                borderColor: active ? theme.borderActive : theme.border,
                                background: active ? theme.goldSoft : theme.input,
                              }}
                              data-sompo-individual={preset.id}
                            >
                              <div className="flex items-start gap-3">
                                <span className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: theme.surface, color: theme.goldDeep }}>
                                  <Icon className="h-4 w-4" />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-semibold" style={{ color: theme.text }}>{preset.label}</div>
                                  <p className="mt-0.5 text-[11px] leading-relaxed" style={{ color: theme.textMute }}>
                                    {preset.description || 'Seleção individual com juiz'}
                                  </p>
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {slugs.map((slug) => (
                                      <span key={slug} className="rounded-full border px-1.5 py-0.5 text-[9px]" style={{ borderColor: theme.border, color: theme.textGhost }}>
                                        {slug === preset.judge ? `${slug} · juiz` : slug}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                    </div>
                  )}

                  <div className="rounded-xl border px-3 py-2 text-xs leading-relaxed" style={{ borderColor: theme.border, color: theme.textSoft }}>
                    <strong style={{ color: theme.text }}>{activeSquad?.label || 'Nenhuma equipe'}</strong>
                    {' · '}
                    {teamMode === 'team' ? 'fluxo coordenado' : 'respostas isoladas + juiz'}
                    {activeSlugs.length ? ` · ${activeSlugs.length} personas` : ''}
                  </div>

                  {launchError && (
                    <p className="rounded-xl border px-3 py-2 text-xs" style={{ borderColor: theme.border, color: theme.error }}>
                      {launchError}
                    </p>
                  )}

                  <button
                    type="button"
                    className="btn-primary inline-flex w-full items-center justify-center gap-2"
                    disabled={!selected || !activeSquad || launching || sessionsBusy || templatesLoading}
                    onClick={() => void runCaseWithSquad(selected)}
                    data-sompo-run={selected.id}
                  >
                    {launching || sessionsBusy ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Preparando run…
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" />
                        Rodar avaliação na bancada
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                  <p className="text-[10px] leading-relaxed" style={{ color: theme.textGhost }}>
                    Abre uma sessão limpa no LUCA-AI, monta o briefing do caso, aplica a equipe escolhida e inicia a run.
                  </p>
                </article>
              </>
            ) : (
              <div className="rounded-2xl border px-4 py-10 text-center text-sm" style={{ borderColor: theme.border, color: theme.textMute }}>
                <BookOpen className="mx-auto mb-2 h-5 w-5" />
                Selecione um caso para escolher a equipe e rodar.
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  const theme = useTheme();
  return (
    <div className="rounded-xl border px-3 py-2 text-center" style={{ borderColor: theme.border, background: theme.surface }}>
      <div className="text-lg font-semibold" style={{ color: theme.text }}>{value}</div>
      <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: theme.textGhost }}>{label}</div>
    </div>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  const theme = useTheme();
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-3 py-1 text-[11px] font-medium"
      style={{
        borderColor: active ? theme.borderActive : theme.border,
        background: active ? theme.goldSoft : theme.input,
        color: active ? theme.goldDeep : theme.textSoft,
      }}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

function Meta({ icon: Icon, text }: { icon: typeof MapPin; text: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className="h-3.5 w-3.5 opacity-70" />
      {text}
    </span>
  );
}

function Block({
  title,
  children,
  theme,
}: {
  title: string;
  children: React.ReactNode;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <div>
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: theme.textGhost }}>
        {title}
      </h3>
      {children}
    </div>
  );
}
