import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Building2,
  CloudRain,
  Filter,
  MapPin,
  Search,
  Sprout,
  TriangleAlert,
  Wheat,
} from 'lucide-react';
import type { PageId } from '@/components/Layout';
import { useTheme } from '@/hooks/useTheme';
import {
  SOMPO_EXAMPLE_CASES,
  SOMPO_INDUSTRY_CONTEXT,
  SOMPO_SEVERITY_LABELS,
  queueSompoCaseForLuca,
  type SompoCaseSeverity,
  type SompoExampleCase,
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

export default function SompoPage({ onNavigate }: SompoPageProps) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [productFilter, setProductFilter] = useState<ProductFilter>('all');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [selectedId, setSelectedId] = useState<string>(SOMPO_EXAMPLE_CASES[0]?.id || '');

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

  function openInLuca(caseItem: SompoExampleCase) {
    queueSompoCaseForLuca(caseItem);
    onNavigate('luca-ai');
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
              SOMPO · casos de exemplo
            </div>
            <h1 className="void-title text-3xl">SOMPO</h1>
            <p className="mt-2 max-w-[70ch] text-sm leading-relaxed" style={{ color: theme.textMute }}>
              Casos realistas de seguro rural e agrícola — com foco em sinistros climáticos, ZARC,
              produtividade/custeio, penhor e renovação de carteira. Cenários didáticos baseados em
              padrões públicos do setor; não são apólices confidenciais.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Metric label="casos" value={SOMPO_EXAMPLE_CASES.length} />
            <Metric label="visíveis" value={filtered.length} />
            <Metric label="fatos setoriais" value={SOMPO_INDUSTRY_CONTEXT.length} />
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

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)]">
          <section className="space-y-3">
            {filtered.length === 0 && (
              <p className="rounded-2xl border px-4 py-10 text-center text-sm" style={{ borderColor: theme.border, color: theme.textMute }}>
                Nenhum caso com esses filtros. Limpe a busca ou mude o produto/severidade.
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
                      <h2 className="text-base font-semibold" style={{ color: theme.text }}>{item.title}</h2>
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
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {item.tags.map((tag) => (
                      <span
                        key={`${item.id}-${tag}`}
                        className="rounded-full border px-2 py-0.5 text-[10px]"
                        style={{ borderColor: theme.border, color: theme.textGhost }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </section>

          <aside className="xl:sticky xl:top-4 xl:self-start">
            {selected ? (
              <article
                className="space-y-4 rounded-2xl border p-5"
                style={{ borderColor: theme.border, background: theme.surface }}
                data-sompo-detail={selected.id}
              >
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ background: theme.goldSoft, color: theme.goldDeep }}>
                      {selected.stageLabel}
                    </span>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ background: theme.input, color: severityColor(selected.severity, theme) }}>
                      {SOMPO_SEVERITY_LABELS[selected.severity]}
                    </span>
                  </div>
                  <h2 className="text-xl font-semibold" style={{ color: theme.text }}>{selected.title}</h2>
                  <p className="mt-1 text-sm" style={{ color: theme.textMute }}>{selected.subtitle}</p>
                </div>

                <p className="text-sm leading-relaxed" style={{ color: theme.textSoft }}>{selected.situation}</p>

                <Block title="Sinais" theme={theme}>
                  <ul className="space-y-1.5 text-xs leading-relaxed" style={{ color: theme.textMute }}>
                    {selected.signals.map((signal) => (
                      <li key={signal}>• {signal}</li>
                    ))}
                  </ul>
                </Block>

                <Block title="Perguntas abertas" theme={theme}>
                  <ul className="space-y-1.5 text-xs leading-relaxed" style={{ color: theme.textMute }}>
                    {selected.questions.map((question) => (
                      <li key={question}>• {question}</li>
                    ))}
                  </ul>
                </Block>

                <Block title="CSV do briefing" theme={theme}>
                  <pre className="overflow-x-auto rounded-xl p-3 text-[11px] leading-relaxed" style={{ background: theme.console, color: theme.textSoft }}>
                    {selected.claimsCsv}
                  </pre>
                </Block>

                <Block title="Telemetria / campo" theme={theme}>
                  <p className="text-xs leading-relaxed" style={{ color: theme.textMute }}>{selected.telemetry}</p>
                </Block>

                <Block title="Padrão setorial" theme={theme}>
                  <p className="text-xs leading-relaxed" style={{ color: theme.textMute }}>{selected.patternNote}</p>
                  <p className="mt-2 text-[10px] leading-relaxed" style={{ color: theme.textGhost }}>
                    Fontes: {selected.sources.join(' · ')}
                  </p>
                </Block>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    className="btn-primary inline-flex flex-1 items-center justify-center gap-2"
                    onClick={() => openInLuca(selected)}
                    data-sompo-open-luca={selected.id}
                  >
                    Abrir na bancada LUCA-AI
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-[10px] leading-relaxed" style={{ color: theme.textGhost }}>
                  O briefing completo vai para o composer da bancada (modo {selected.suggestedMode === 'team' ? 'Equipe' : 'Individual'}
                  {selected.suggestedMode === 'team' ? `, preset sugerido: ${selected.suggestedPresetId}` : ''}).
                </p>
              </article>
            ) : (
              <div className="rounded-2xl border px-4 py-10 text-center text-sm" style={{ borderColor: theme.border, color: theme.textMute }}>
                <BookOpen className="mx-auto mb-2 h-5 w-5" />
                Selecione um caso para ver o dossiê.
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
