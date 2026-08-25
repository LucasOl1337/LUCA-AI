import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Box as BoxIcon,
  Building2,
  Database,
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
import SompoTelemetryPanel from '@/components/SompoTelemetryPanel';
import { useTheme } from '@/hooks/useTheme';
import { useChatLibrary } from '@/hooks/useChatLibrary';
import { useAppLocation } from '@/hooks/useAppLocation';
import { useLuca } from '@/hooks/useLucaState';
import { GRAVIDADE_VALUES, PRODUTO_PARAM, PRODUTO_VALUE, SOMPO_ABA } from '../../shared/app-location.js';
import { buildApiErrorMessage, lucaApi } from '@/lib/api';
import type { SompoTelemetrySnapshot } from '@/lib/types';
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
  SOMPO_PAGE_BACKGROUND,
  SOMPO_SEVERITY_LABELS,
  buildSompoCaseMission,
  queueSompoLaunch,
  type SompoCaseSeverity,
  type SompoExampleCase,
  type SompoLaunchMode,
  type SompoProductLine,
} from '@/lib/sompo-cases';
import { buildSompoTelemetryMission } from '../../shared/sompo-telemetry.js';
import { createSompoSimulationSnapshot } from '../../shared/sompo-telemetry-simulator.js';
import '@/sompo-page.css';

const SompoTruckSimulator = lazy(() => import('@/components/SompoTruckSimulator'));

interface SompoPageProps {
  onNavigate: (page: PageId) => void;
}

type ProductFilter = 'all' | SompoProductLine;
type SeverityFilter = 'all' | SompoCaseSeverity;
type SompoViewMode = 'telemetry' | 'cases';
type TelemetrySourceMode = 'firebase' | 'simulation';

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

/** Três fatos-chave no header — o resto do contexto fica de fora pra reduzir poluição. */
const CONTEXT_HIGHLIGHTS = SOMPO_INDUSTRY_CONTEXT.filter((fact) =>
  ['triade-climatica', 'seca', 'zarc'].includes(fact.id),
);

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
  const { sompoTelemetry: streamedTelemetry } = useLuca();
  const { location, navigate } = useAppLocation();
  const viewMode: SompoViewMode = location.aba === SOMPO_ABA ? 'cases' : 'telemetry';
  const query = location.busca;
  const mappedProduct = PRODUTO_VALUE[location.produto];
  const productFilter: ProductFilter = mappedProduct === 'agricola-produtividade'
    || mappedProduct === 'agricola-custeio'
    || mappedProduct === 'penhor-rural'
    || mappedProduct === 'carteira'
    ? mappedProduct
    : 'all';
  const severityFilter: SeverityFilter = GRAVIDADE_VALUES.includes(location.gravidade)
    ? location.gravidade as SompoCaseSeverity
    : 'all';
  const selectedId = location.caso || null;
  const telemetrySourceMode: TelemetrySourceMode = location.fonte === 'simulacao' ? 'simulation' : 'firebase';
  const [simulatedTelemetry, setSimulatedTelemetry] = useState<SompoTelemetrySnapshot>(() => (
    createSompoSimulationSnapshot()
  ));
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
  const [bootstrapTelemetry, setBootstrapTelemetry] = useState<SompoTelemetrySnapshot | null>(null);
  const [telemetryLoading, setTelemetryLoading] = useState(true);
  const [telemetryRefreshing, setTelemetryRefreshing] = useState(false);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);
  const [telemetryLaunching, setTelemetryLaunching] = useState(false);
  const [telemetryLaunchError, setTelemetryLaunchError] = useState<string | null>(null);
  const telemetryRequestBusyRef = useRef(false);

  const loadTelemetry = useCallback(async (kind: 'initial' | 'manual' = 'manual') => {
    if (telemetryRequestBusyRef.current) return;
    telemetryRequestBusyRef.current = true;
    if (kind === 'initial') setTelemetryLoading(true);
    if (kind === 'manual') setTelemetryRefreshing(true);
    try {
      const result = await lucaApi.getSompoTelemetry(undefined, 6_000);
      if (!result?.ok || !result.telemetry) throw new Error('Snapshot de telemetria inválido.');
      setBootstrapTelemetry(result.telemetry);
      setTelemetryError(null);
    } catch (err) {
      setTelemetryError(buildApiErrorMessage(err, 'Não foi possível ler a telemetria do trator.'));
    } finally {
      telemetryRequestBusyRef.current = false;
      if (kind === 'initial') setTelemetryLoading(false);
      if (kind === 'manual') setTelemetryRefreshing(false);
    }
  }, []);

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

  useEffect(() => {
    if (viewMode !== 'telemetry') return undefined;
    void loadTelemetry('initial');
    return undefined;
  }, [loadTelemetry, viewMode]);

  useEffect(() => {
    if (!selectedId) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        navigate({ caso: '' }, 'push');
        setLaunchError(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

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

  const firebaseTelemetry = streamedTelemetry || bootstrapTelemetry;
  const telemetry = telemetrySourceMode === 'simulation' ? simulatedTelemetry : firebaseTelemetry;
  const visibleTelemetryError = telemetrySourceMode === 'firebase' && !streamedTelemetry ? telemetryError : null;

  const selected = useMemo(
    () => (selectedId ? SOMPO_EXAMPLE_CASES.find((item) => item.id === selectedId) || null : null),
    [selectedId],
  );

  useEffect(() => {
    if (!selected) return;
    setTeamMode(selected.suggestedMode);
    if (selected.suggestedMode === 'team') {
      setSelectedTeamId((prev) => (
        teamPresets.some((item) => item.id === selected.suggestedPresetId)
          ? selected.suggestedPresetId
          : prev
      ));
    } else {
      setSelectedIndividualId((prev) => (
        individualPresets.some((item) => item.id === selected.suggestedPresetId)
          ? selected.suggestedPresetId
          : prev
      ));
    }
  }, [individualPresets, selected, teamPresets]);

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

  function setViewMode(mode: SompoViewMode) {
    navigate({
      aba: mode === 'cases' ? SOMPO_ABA : '',
      caso: mode === 'cases' ? location.caso : '',
      fonte: mode === 'cases' ? '' : location.fonte,
    }, 'replace');
  }

  function setQuery(value: string) {
    navigate({ busca: value }, 'replace');
  }

  function setProductFilter(value: ProductFilter) {
    navigate({ produto: value === 'all' ? '' : (PRODUTO_PARAM[value] || '') }, 'replace');
  }

  function setSeverityFilter(value: SeverityFilter) {
    navigate({ gravidade: value === 'all' ? '' : value }, 'replace');
  }

  function openCase(caseItem: SompoExampleCase) {
    navigate({ aba: SOMPO_ABA, caso: caseItem.id }, 'push');
    setLaunchError(null);
    setTeamMode(caseItem.suggestedMode);
    if (caseItem.suggestedMode === 'team') {
      setSelectedTeamId((prev) => (
        teamPresets.some((item) => item.id === caseItem.suggestedPresetId)
          ? caseItem.suggestedPresetId
          : prev
      ));
    } else {
      setSelectedIndividualId((prev) => (
        individualPresets.some((item) => item.id === caseItem.suggestedPresetId)
          ? caseItem.suggestedPresetId
          : prev
      ));
    }
  }

  function closeLaunch() {
    navigate({ caso: '' }, 'push');
    setLaunchError(null);
  }

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
      navigate({ page: 'luca-ai', sessao: session.id }, 'push');
    } catch (err) {
      setLaunchError(buildApiErrorMessage(err, 'Falha ao iniciar a avaliação do caso.'));
    } finally {
      setLaunching(false);
    }
  }

  async function runTelemetryWithSquad() {
    if (!telemetry || !activeSquad || telemetryLaunching || sessionsBusy) return;
    setTelemetryLaunching(true);
    setTelemetryLaunchError(null);
    try {
      const session = await createSession();
      if (!session) {
        setTelemetryLaunchError('Não foi possível abrir uma sessão limpa na bancada.');
        return;
      }
      queueSompoLaunch({
        caseId: `${telemetry.source.kind === 'simulation' ? 'simulacao' : 'telemetria'}-trator-${telemetry.tractorId}-${telemetry.deviceTimestamp ?? 'snapshot'}`,
        mission: buildSompoTelemetryMission(telemetry, activeSquad.label),
        mode: teamMode,
        presetId: activeSquad.id,
        presetLabel: activeSquad.label,
        autoRun: true,
      });
      navigate({ page: 'luca-ai', sessao: session.id }, 'push');
    } catch (err) {
      setTelemetryLaunchError(buildApiErrorMessage(err, 'Falha ao enviar a telemetria para a bancada.'));
    } finally {
      setTelemetryLaunching(false);
    }
  }

  return (
    <div
      className="sompo-page"
      style={{ ['--sompo-bg-image' as string]: `url('${SOMPO_PAGE_BACKGROUND}')` }}
    >
      <div className="sompo-page-bg" aria-hidden="true" />

      <div className="sompo-page-scroll">
        <div className="sompo-page-inner">
          <header className="sompo-header">
            <div>
              <div className="sompo-kicker">
                <Wheat className="h-3.5 w-3.5" />
                SOMPO · campo + agentes
              </div>
              <h1 className="sompo-title">SOMPO</h1>
              <p className="sompo-lead">
                Acompanhe o ESP32 pelo Firebase ou teste cenários com o caminhão virtual,
                sempre com a origem do snapshot preservada para a equipe de agentes.
              </p>
            </div>
            <div className="sompo-metrics">
              <div className="sompo-metric">
                <strong>{telemetry?.tractorId || '001'}</strong>
                <span>{telemetrySourceMode === 'simulation' ? 'caminhão' : 'trator'}</span>
              </div>
              <div className="sompo-metric">
                <strong>{SOMPO_EXAMPLE_CASES.length}</strong>
                <span>casos</span>
              </div>
              <div className="sompo-metric">
                <strong>{teamPresets.length}</strong>
                <span>equipes</span>
              </div>
            </div>
          </header>

          <section className="sompo-view-switch" aria-label="Modo SOMPO">
            <button
              type="button"
              aria-pressed={viewMode === 'telemetry'}
              onClick={() => setViewMode('telemetry')}
            >
              <Activity />
              <span><strong>Telemetria</strong><small>Firebase + simulador 3D</small></span>
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'cases'}
              onClick={() => setViewMode('cases')}
            >
              <Wheat />
              <span><strong>Casos agrícolas</strong><small>Cenários para avaliação</small></span>
            </button>
          </section>

          {viewMode === 'telemetry' ? (
            <>
              <section className="sompo-source-switch" aria-label="Origem dos dados da telemetria">
                <div className="sompo-source-switch-label">
                  <span>Origem dos dados</span>
                  <small>O Firebase continua ativo quando o simulador é aberto.</small>
                </div>
                <div className="sompo-source-switch-options">
                  <button
                    type="button"
                    aria-pressed={telemetrySourceMode === 'firebase'}
                    onClick={() => {
                      navigate({ fonte: '' }, 'replace');
                      setTelemetryLaunchError(null);
                    }}
                  >
                    <Database />
                    <span>
                      <strong>Firebase</strong>
                      <small>Dispositivo físico · fonte principal</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={telemetrySourceMode === 'simulation'}
                    onClick={() => {
                      navigate({ fonte: 'simulacao' }, 'replace');
                      setTelemetryLaunchError(null);
                    }}
                  >
                    <BoxIcon />
                    <span>
                      <strong>Simulador 3D</strong>
                      <small>Three.js · ensaio local</small>
                    </span>
                  </button>
                </div>
              </section>

              {telemetrySourceMode === 'simulation' && (
                <Suspense fallback={(
                  <div className="sompo-simulator-loading" role="status">
                    <Loader2 className="animate-spin" /> Preparando laboratório 3D…
                  </div>
                )}>
                  <SompoTruckSimulator onTelemetry={setSimulatedTelemetry} />
                </Suspense>
              )}

              <SompoTelemetryPanel
                telemetry={telemetry}
                loading={telemetrySourceMode === 'firebase' && telemetryLoading}
                refreshing={telemetrySourceMode === 'firebase' && telemetryRefreshing}
                error={visibleTelemetryError}
                onRefresh={telemetrySourceMode === 'firebase' ? () => void loadTelemetry('manual') : undefined}
              >
                  <aside className="sompo-telemetry-action" aria-label="Enviar telemetria para os agentes">
                    <div className="sompo-telemetry-action-copy">
                      <span>Próxima etapa</span>
                      <h3>{telemetrySourceMode === 'simulation' ? 'Analisar este ensaio com a equipe' : 'Processar este snapshot com a equipe'}</h3>
                      <p>
                        {telemetrySourceMode === 'simulation'
                          ? 'O LUCA marca o briefing como simulação, registra os sinais do cenário e inicia uma sessão nova.'
                          : 'O LUCA fecha a leitura real em um briefing, registra alertas e lacunas e inicia uma sessão nova.'}
                      </p>
                    </div>
                    <div className="sompo-telemetry-controls">
                      <div className="sompo-mode-switch" role="group" aria-label="Modo da equipe para telemetria">
                        <button
                          type="button"
                          className={teamMode === 'team' ? 'active' : ''}
                          aria-pressed={teamMode === 'team'}
                          onClick={() => setTeamMode('team')}
                        >
                          <Users /> Equipe
                        </button>
                        <button
                          type="button"
                          className={teamMode === 'individual' ? 'active' : ''}
                          aria-pressed={teamMode === 'individual'}
                          onClick={() => setTeamMode('individual')}
                        >
                          <Scale /> Individual
                        </button>
                      </div>
                      <label className="sompo-telemetry-team-select">
                        <span>Template</span>
                        <select
                          value={teamMode === 'team' ? selectedTeamId : selectedIndividualId}
                          disabled={templatesLoading}
                          onChange={(event) => {
                            if (teamMode === 'team') setSelectedTeamId(event.target.value);
                            else setSelectedIndividualId(event.target.value);
                          }}
                        >
                          {(teamMode === 'team' ? teamPresets : individualPresets).map((preset) => (
                            <option key={preset.id} value={preset.id}>{preset.label}</option>
                          ))}
                        </select>
                      </label>
                      <div className="sompo-telemetry-team-summary">
                        {activeSquad?.label || 'Carregando equipe'}
                        {activeSlugs.length ? ` · ${activeSlugs.length} personas` : ''}
                      </div>
                    </div>

                    <div className="sompo-telemetry-run">
                      {templatesError && <p className="sompo-templates-error">{templatesError}</p>}
                      {telemetryLaunchError && <p className="sompo-launch-error">{telemetryLaunchError}</p>}
                      <button
                        type="button"
                        className="sompo-run-btn"
                        disabled={!telemetry || !activeSquad || telemetryLaunching || sessionsBusy || templatesLoading}
                        onClick={() => void runTelemetryWithSquad()}
                        data-sompo-telemetry-run
                      >
                        {telemetryLaunching || sessionsBusy ? (
                          <><Loader2 className="animate-spin" /> Preparando run…</>
                        ) : (
                          <>
                            <Play />
                            {telemetrySourceMode === 'simulation' ? 'Analisar simulação' : 'Analisar na bancada'}
                            <ArrowRight />
                          </>
                        )}
                      </button>
                    </div>
                  </aside>
              </SompoTelemetryPanel>
            </>
          ) : (
            <>
              <section className="sompo-context" aria-label="Contexto setorial">
                {CONTEXT_HIGHLIGHTS.map((fact) => (
                  <article key={fact.id} className="sompo-context-card">
                    <span>{fact.label}</span>
                    <strong>{fact.value}</strong>
                    <p>{fact.detail}</p>
                  </article>
                ))}
              </section>

              <section className="sompo-toolbar">
                <div className="sompo-toolbar-row">
                  <label className="sompo-search">
                    <Search />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Buscar por cultura, região, evento, ZARC, granizo…"
                      aria-label="Buscar casos agrícolas"
                    />
                  </label>
                  <div className="sompo-chips">
                    <Filter className="h-4 w-4" style={{ color: theme.textGhost }} aria-hidden="true" />
                    {PRODUCT_FILTERS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="sompo-chip"
                        aria-pressed={productFilter === item.id}
                        onClick={() => setProductFilter(item.id)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="sompo-toolbar-row">
                  <span className="sompo-chip-label">Severidade</span>
                  <div className="sompo-chips">
                    {SEVERITY_FILTERS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="sompo-chip"
                        aria-pressed={severityFilter === item.id}
                        onClick={() => setSeverityFilter(item.id)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="sompo-grid" aria-label="Casos agrícolas">
                {filtered.length === 0 && (
                  <p className="sompo-empty">Nenhum caso com esses filtros.</p>
                )}
                {filtered.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="sompo-case-card"
                    onClick={() => openCase(item)}
                    data-sompo-case={item.id}
                  >
                    <div className="sompo-case-card-media">
                      <img src={item.image} alt="" loading="lazy" />
                      <span className={`sompo-severity sompo-severity-${item.severity}`}>
                        {SOMPO_SEVERITY_LABELS[item.severity]}
                      </span>
                    </div>
                    <div className="sompo-case-card-body">
                      <h3>{item.title}</h3>
                      <p>{item.subtitle}</p>
                      <div className="sompo-case-meta">
                        <span><Sprout /> {item.culture}</span>
                        <span><MapPin /> {item.region}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </section>
            </>
          )}
        </div>
      </div>

      {selected && (
        <div
          className="sompo-launch"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sompo-launch-title"
          data-sompo-detail={selected.id}
        >
          <div className="sompo-launch-panel">
            <section className="sompo-launch-case">
              <div className="sompo-launch-hero">
                <img src={selected.image} alt="" />
                <button type="button" className="sompo-launch-back" onClick={closeLaunch}>
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Casos
                </button>
              </div>
              <div className="sompo-launch-case-body">
                <div className="sompo-launch-badges">
                  <span className="sompo-launch-badge">{selected.stageLabel}</span>
                  <span className={`sompo-severity sompo-severity-${selected.severity}`} style={{ position: 'static' }}>
                    {SOMPO_SEVERITY_LABELS[selected.severity]}
                  </span>
                </div>
                <h2 id="sompo-launch-title">{selected.title}</h2>
                <div className="sompo-launch-meta-row">
                  <span><Sprout /> {selected.culture}</span>
                  <span><MapPin /> {selected.region}</span>
                  <span><Building2 /> {selected.productLabel}</span>
                  <span><TriangleAlert /> {selected.riskEvent}</span>
                </div>
                <p className="sompo-launch-situation">{selected.situation}</p>
                <div className="sompo-launch-signals">
                  <h3>Sinais</h3>
                  <ul>
                    {selected.signals.slice(0, 3).map((signal) => (
                      <li key={signal}>{signal}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            <aside className="sompo-launch-squad" data-sompo-squad-panel>
              <div className="sompo-launch-squad-head">
                <h2>2 · Quem avalia</h2>
                <p>Escolha o template de equipe ou individual e rode na bancada.</p>
              </div>

              <div className="sompo-mode-switch" role="group" aria-label="Modo da equipe">
                <button
                  type="button"
                  className={teamMode === 'team' ? 'active' : ''}
                  aria-pressed={teamMode === 'team'}
                  onClick={() => setTeamMode('team')}
                >
                  <Users /> Equipe
                </button>
                <button
                  type="button"
                  className={teamMode === 'individual' ? 'active' : ''}
                  aria-pressed={teamMode === 'individual'}
                  onClick={() => setTeamMode('individual')}
                >
                  <Scale /> Individual
                </button>
              </div>

              {templatesError && (
                <p className="sompo-templates-error">{templatesError}</p>
              )}

              {templatesLoading ? (
                <div className="sompo-loading">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando equipes…
                </div>
              ) : (
                <div className="sompo-squad-list">
                  {teamMode === 'team'
                    ? teamPresets.map((preset) => {
                      const active = selectedTeam?.id === preset.id;
                      const Icon = preset.icon;
                      const slugs = teamPresetSlugs(preset);
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          className="sompo-squad-item"
                          aria-pressed={active}
                          onClick={() => setSelectedTeamId(preset.id)}
                          data-sompo-team={preset.id}
                        >
                          <span className="sompo-squad-icon"><Icon /></span>
                          <div className="min-w-0 flex-1">
                            <strong>{preset.label}</strong>
                            <p>{preset.description || 'Template de equipe'}</p>
                            <div className="sompo-squad-slugs">
                              {slugs.slice(0, 5).map((slug) => (
                                <span key={slug}>{slug}</span>
                              ))}
                              {slugs.length > 5 && <span>+{slugs.length - 5}</span>}
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
                          className="sompo-squad-item"
                          aria-pressed={active}
                          onClick={() => setSelectedIndividualId(preset.id)}
                          data-sompo-individual={preset.id}
                        >
                          <span className="sompo-squad-icon"><Icon /></span>
                          <div className="min-w-0 flex-1">
                            <strong>{preset.label}</strong>
                            <p>{preset.description || 'Seleção individual com juiz'}</p>
                            <div className="sompo-squad-slugs">
                              {slugs.map((slug) => (
                                <span key={slug}>{slug === preset.judge ? `${slug} · juiz` : slug}</span>
                              ))}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                </div>
              )}

              <div className="sompo-launch-summary">
                <strong>{activeSquad?.label || 'Nenhuma equipe'}</strong>
                {' · '}
                {teamMode === 'team' ? 'fluxo coordenado' : 'respostas isoladas + juiz'}
                {activeSlugs.length ? ` · ${activeSlugs.length} personas` : ''}
              </div>

              {launchError && (
                <p className="sompo-launch-error">{launchError}</p>
              )}

              <button
                type="button"
                className="sompo-run-btn"
                disabled={!selected || !activeSquad || launching || sessionsBusy || templatesLoading}
                onClick={() => void runCaseWithSquad(selected)}
                data-sompo-run={selected.id}
              >
                {launching || sessionsBusy ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Preparando run…
                  </>
                ) : (
                  <>
                    <Play />
                    Rodar avaliação na bancada
                    <ArrowRight />
                  </>
                )}
              </button>
              <p className="sompo-run-hint">
                Abre sessão limpa no LUCA-AI, monta o briefing do caso, aplica a equipe e inicia a run.
              </p>
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}
