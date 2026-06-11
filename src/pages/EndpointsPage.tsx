import { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Cable, Loader2, Plug2 } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

interface EndpointSpec {
  id: string;
  method: string;
  path: string;
  summary: string;
  availability: 'both' | 'local' | 'cloud';
  examplePayload?: string;
}

interface ModuleSpec {
  id: string;
  label: string;
  description: string;
  featured?: boolean;
  outbound: EndpointSpec[];
  inbound: EndpointSpec[];
}

interface CatalogResponse {
  generatedAt: string;
  mode?: 'backend' | 'cloud';
  modules: ModuleSpec[];
}

type CatalogTab = 'outbound' | 'inbound';

function methodTone(method: string, theme: ReturnType<typeof useTheme>) {
  switch (method) {
    case 'GET':
      return { color: theme.alive, background: theme.aliveSoft };
    case 'POST':
      return { color: theme.goldDeep, background: theme.goldSoft };
    default:
      return { color: theme.fleet, background: theme.fleetSoft };
  }
}

function availabilityLabel(availability: EndpointSpec['availability']) {
  if (availability === 'local') return 'local';
  if (availability === 'cloud') return 'cloud';
  return 'local + cloud';
}

function moduleTone(module: ModuleSpec) {
  return module.featured ? 'featured' : 'default';
}

export default function EndpointsPage() {
  const theme = useTheme();
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<CatalogTab>('inbound');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/catalog/endpoints')
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<CatalogResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        setCatalog(data);
        setSelectedId(data.modules[0]?.id ?? null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedModule = useMemo(
    () => catalog?.modules.find((item) => item.id === selectedId) ?? catalog?.modules[0] ?? null,
    [catalog, selectedId],
  );

  const selectedRows = tab === 'outbound'
    ? selectedModule?.outbound ?? []
    : selectedModule?.inbound ?? [];

  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <div className="mx-auto max-w-[1200px] space-y-6">
        <header className="void-panel rounded-[28px] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em]" style={{ background: theme.goldSoft, color: theme.goldDeep }}>
                <Cable className="h-3.5 w-3.5" />
                {catalog?.mode === 'cloud' ? 'endpoint catalog cloud' : 'endpoint catalog local'}
              </div>
              <h1 className="void-title text-3xl">Endpoints</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: theme.textMute }}>
                Catálogo operacional inspirado no TARS para mapear o que o runtime LUCA expõe e o que ele aceita receber.
              </p>
            </div>
            <div className="rounded-2xl px-4 py-3" style={{ background: theme.surfaceHi, border: `1px solid ${theme.border}` }}>
              <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: theme.textGhost }}>gerado em</div>
              <div className="mt-1 text-xs font-mono" style={{ color: theme.textSoft }}>
                {catalog?.generatedAt ?? 'carregando'}
              </div>
            </div>
          </div>
        </header>

        {error && (
          <div className="void-panel rounded-2xl p-5">
            <div className="text-sm font-semibold" style={{ color: theme.error }}>Falha ao carregar o catálogo</div>
            <div className="mt-2 text-xs font-mono" style={{ color: theme.textMute }}>{error}</div>
          </div>
        )}

        {!catalog && !error && (
          <div className="flex min-h-[240px] items-center justify-center">
            <div className="flex items-center gap-3 text-sm uppercase tracking-[0.24em]" style={{ color: theme.textMute }}>
              <Loader2 className="h-4 w-4 animate-spin" />
              carregando catálogo
            </div>
          </div>
        )}

        {catalog && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(420px,1.08fr)]">
            <section className="space-y-3">
              {catalog.modules.map((module) => {
                const active = module.id === selectedModule?.id;
                const total = module.outbound.length + module.inbound.length;
                return (
                  <button
                    key={module.id}
                    type="button"
                    onClick={() => setSelectedId(module.id)}
                    className="void-panel w-full rounded-2xl p-5 text-left transition-all"
                    style={{
                      borderColor: active ? theme.borderActive : theme.border,
                      boxShadow: active ? `0 0 0 1px ${theme.goldSoft}` : undefined,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-lg font-semibold" style={{ color: theme.text }}>{module.label}</div>
                          {module.featured && (
                            <span className="rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ background: theme.aliveSoft, color: theme.alive }}>
                              core
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm leading-relaxed" style={{ color: theme.textMute }}>{module.description}</p>
                      </div>
                      <div
                        className="flex h-11 w-11 items-center justify-center rounded-2xl"
                        style={{
                          background: moduleTone(module) === 'featured' ? theme.aliveSoft : theme.goldSoft,
                          border: `1px solid ${theme.border}`,
                        }}
                      >
                        <Plug2 className="h-5 w-5" style={{ color: theme.goldDeep }} />
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                      <span className="state-badge dormant">{total} rotas</span>
                      <span className="state-badge ok">{module.outbound.length} saída</span>
                      <span className="state-badge warning">{module.inbound.length} entrada</span>
                    </div>
                  </button>
                );
              })}
            </section>

            <section className="void-panel rounded-[28px] p-6">
              {selectedModule ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-semibold" style={{ color: theme.text }}>{selectedModule.label}</h2>
                      <p className="mt-2 text-sm leading-relaxed" style={{ color: theme.textMute }}>{selectedModule.description}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-right text-[11px]">
                      <div className="rounded-xl px-3 py-2" style={{ background: theme.input, border: `1px solid ${theme.border}` }}>
                        <div style={{ color: theme.textGhost }}>saídas</div>
                        <strong style={{ color: theme.alive }}>{selectedModule.outbound.length}</strong>
                      </div>
                      <div className="rounded-xl px-3 py-2" style={{ background: theme.input, border: `1px solid ${theme.border}` }}>
                        <div style={{ color: theme.textGhost }}>entradas</div>
                        <strong style={{ color: theme.goldDeep }}>{selectedModule.inbound.length}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex gap-2">
                    <button className={`tab-pill ${tab === 'inbound' ? 'active' : ''}`} onClick={() => setTab('inbound')}>
                      <span className="inline-flex items-center gap-2">
                        <ArrowDownToLine className="h-3.5 w-3.5" />
                        Entrada
                      </span>
                    </button>
                    <button className={`tab-pill ${tab === 'outbound' ? 'active' : ''}`} onClick={() => setTab('outbound')}>
                      <span className="inline-flex items-center gap-2">
                        <ArrowUpFromLine className="h-3.5 w-3.5" />
                        Saída
                      </span>
                    </button>
                  </div>

                  <div className="mt-5 space-y-3">
                    {selectedRows.length === 0 ? (
                      <div className="rounded-2xl px-4 py-8 text-center" style={{ background: theme.input, border: `1px dashed ${theme.border}` }}>
                        <div className="text-sm font-semibold" style={{ color: theme.textSoft }}>Nenhuma rota nesta direção</div>
                        <div className="mt-1 text-xs" style={{ color: theme.textMute }}>
                          Este módulo hoje só opera pela direção oposta no contrato atual do runtime.
                        </div>
                      </div>
                    ) : (
                      selectedRows.map((row) => {
                        const tone = methodTone(row.method, theme);
                        return (
                          <article key={row.id} className="rounded-2xl p-4" style={{ background: theme.input, border: `1px solid ${theme.border}` }}>
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="rounded-lg px-2.5 py-1 text-[10px] font-bold tracking-[0.18em]" style={{ color: tone.color, background: tone.background }}>
                                {row.method}
                              </span>
                              <code className="text-xs font-mono" style={{ color: theme.text }}>{row.path}</code>
                              <span className="rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.16em]" style={{ background: theme.surfaceHi, color: theme.textMute, border: `1px solid ${theme.border}` }}>
                                {availabilityLabel(row.availability)}
                              </span>
                            </div>
                            <p className="mt-3 text-sm leading-relaxed" style={{ color: theme.textMute }}>{row.summary}</p>
                            {row.examplePayload && (
                              <div className="mt-3 rounded-2xl px-3 py-3" style={{ background: theme.surfaceHi, border: `1px solid ${theme.border}` }}>
                                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: theme.textGhost }}>
                                  exemplo
                                </div>
                                <pre className="overflow-x-auto text-[11px] leading-relaxed" style={{ color: theme.textSoft }}>
                                  <code>{row.examplePayload}</code>
                                </pre>
                              </div>
                            )}
                          </article>
                        );
                      })
                    )}
                  </div>
                </>
              ) : (
                <div className="flex min-h-[300px] items-center justify-center text-sm" style={{ color: theme.textMute }}>
                  Nenhum módulo disponível.
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
