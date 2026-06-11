import { useEffect, useMemo, useState } from 'react';
import { Bot, Braces, Cable, Copy, Loader2, Sparkles, Wrench } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

interface JsonSchema {
  type?: string;
  description?: string;
  enum?: string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
}

interface ToolInvoke {
  type?: string;
  method?: string;
  endpoint?: string;
  endpoints?: Record<string, string>;
}

interface ToolSpec {
  id: string;
  name: string;
  description: string;
  category: string;
  kind: string;
  provider: string;
  capabilities: string[];
  tags: string[];
  prompt_instruction: string;
  parameters: JsonSchema;
  invoke: ToolInvoke;
  executable?: boolean;
  availability?: 'both' | 'local' | 'cloud';
  source?: string;
  canonicalId?: string;
  project?: string;
  catalogPath?: string;
  advisory?: boolean;
}

interface RelatedCatalog {
  project: string;
  source?: string | null;
  catalogPath?: string;
  count: number;
  tools: ToolSpec[];
  errors: { file: string; error: string }[];
}

interface ToolsResponse {
  generatedAt: string;
  mode?: 'backend' | 'cloud';
  source?: string;
  tools: ToolSpec[];
  count?: number;
  advisoryTools?: ToolSpec[];
  advisoryCount?: number;
  relatedCatalogs?: RelatedCatalog[];
}

function sampleValue(name: string, schema: JsonSchema): string | number | boolean | string[] | Record<string, never> {
  if (schema.enum?.length) return schema.enum[0];
  if (schema.type === 'integer' || schema.type === 'number') return 1;
  if (schema.type === 'boolean') return true;
  if (schema.type === 'array') return [];
  if (schema.type === 'object' && !schema.properties) return {};
  const key = name.toLowerCase();
  if (key.includes('title')) return 'Missao assistida';
  if (key.includes('description')) return 'Analisar operacao e orientar proxima acao.';
  if (key.includes('success')) return 'Gerar proxima acao com criterio claro.';
  if (key.includes('content')) return 'Supervisor: registrar alinhamento operacional.';
  if (key.includes('agent')) return 'supervisor';
  if (key.includes('source')) return 'dashboard';
  if (key.includes('detail')) return 'Sinal detectado em tempo real.';
  if (key.includes('schedule')) return 'schedule-123';
  return `valor_${name}`;
}

function exampleInput(tool: ToolSpec) {
  const props = tool.parameters?.properties ?? {};
  const payload = Object.fromEntries(Object.entries(props).map(([name, schema]) => [name, sampleValue(name, schema)]));
  return JSON.stringify(payload, null, 2);
}

function invokeLabel(invoke: ToolInvoke) {
  if (invoke.type === 'http' && invoke.method && invoke.endpoint) return `${invoke.method} ${invoke.endpoint}`;
  if (invoke.type === 'http-multi' && invoke.endpoints) return Object.entries(invoke.endpoints).map(([mode, endpoint]) => `${mode}: ${endpoint}`).join('\n');
  return 'contrato documental';
}

export default function ToolsPage() {
  const theme = useTheme();
  const [catalog, setCatalog] = useState<ToolsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const allTools = useMemo(
    () => [...(catalog?.tools ?? []), ...(catalog?.advisoryTools ?? [])],
    [catalog],
  );

  useEffect(() => {
    let cancelled = false;
    fetch('/api/catalog/tools')
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<ToolsResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        setCatalog(data);
        setSelectedId(data.tools[0]?.id ?? data.advisoryTools?.[0]?.id ?? null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedTool = useMemo(
    () => allTools.find((tool) => tool.id === selectedId) ?? allTools[0] ?? null,
    [allTools, selectedId],
  );

  async function copyContract() {
    if (!selectedTool) return;
    const payload = [
      `tool_id: ${selectedTool.id}`,
      selectedTool.canonicalId ? `canonical_id: ${selectedTool.canonicalId}` : null,
      `provider: ${selectedTool.provider}`,
      `invoke: ${invokeLabel(selectedTool.invoke)}`,
      `payload: ${exampleInput(selectedTool)}`,
    ].filter(Boolean).join('\n');
    await navigator.clipboard.writeText(payload);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <div className="mx-auto max-w-[1240px] space-y-6">
        <header className="void-panel rounded-[28px] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em]" style={{ background: theme.goldSoft, color: theme.goldDeep }}>
                <Wrench className="h-3.5 w-3.5" />
                {catalog?.source === 'tars-tool-catalog-pattern' ? 'tool catalog adaptado do TARS' : 'tool catalog'}
              </div>
              <h1 className="void-title text-3xl">Ferramentas</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: theme.textMute }}>
                Catálogo operacional inspirado no arsenal do TARS, adaptado para as ações reais do runtime LUCA.
              </p>
            </div>
            <div className="rounded-2xl px-4 py-3" style={{ background: theme.surfaceHi, border: `1px solid ${theme.border}` }}>
              <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: theme.textGhost }}>gerado em</div>
              <div className="mt-1 text-xs font-mono" style={{ color: theme.textSoft }}>{catalog?.generatedAt ?? 'carregando'}</div>
              <div className="mt-2 text-[10px] uppercase tracking-[0.18em]" style={{ color: theme.textGhost }}>itens</div>
              <div className="mt-1 text-xs font-mono" style={{ color: theme.textSoft }}>{catalog?.count ?? 0}</div>
              <div className="mt-2 text-[10px] uppercase tracking-[0.18em]" style={{ color: theme.textGhost }}>módulos irmãos</div>
              <div className="mt-1 text-xs font-mono" style={{ color: theme.textSoft }}>{catalog?.advisoryCount ?? 0}</div>
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
              carregando ferramentas
            </div>
          </div>
        )}

        {catalog && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(440px,1.08fr)]">
            <section className="space-y-3">
              {allTools.map((tool) => {
                const active = tool.id === selectedTool?.id;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => setSelectedId(tool.id)}
                    className="void-panel w-full rounded-2xl p-5 text-left transition-all"
                    style={{
                      borderColor: active ? theme.borderActive : theme.border,
                      boxShadow: active ? `0 0 0 1px ${theme.goldSoft}` : undefined,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-lg font-semibold" style={{ color: theme.text }}>{tool.name}</div>
                        <p className="mt-1 text-sm leading-relaxed" style={{ color: theme.textMute }}>{tool.description}</p>
                      </div>
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: theme.goldSoft, border: `1px solid ${theme.border}` }}>
                        <Wrench className="h-5 w-5" style={{ color: theme.goldDeep }} />
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                      <span className="state-badge dormant">{tool.category}</span>
                      <span className={tool.executable ? 'state-badge ok' : 'state-badge warning'}>{tool.executable ? 'executável' : 'documental'}</span>
                      <span className="state-badge warning">{tool.provider}</span>
                      {tool.advisory && <span className="state-badge warning">{tool.project ?? 'irmão'}</span>}
                    </div>
                  </button>
                );
              })}
            </section>

            <section className="void-panel rounded-[28px] p-6">
              {selectedTool ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-semibold" style={{ color: theme.text }}>{selectedTool.name}</h2>
                      <p className="mt-2 text-sm leading-relaxed" style={{ color: theme.textMute }}>{selectedTool.prompt_instruction}</p>
                    </div>
                    <button className="btn-fleet inline-flex items-center gap-2" onClick={copyContract}>
                      <Copy className="h-4 w-4" />
                      {copied ? 'copiado' : 'copiar contrato'}
                    </button>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="rounded-2xl p-4" style={{ background: theme.input, border: `1px solid ${theme.border}` }}>
                      <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em]" style={{ color: theme.textGhost }}>
                        <Cable className="h-3.5 w-3.5" />
                        invoke
                      </div>
                      <pre className="whitespace-pre-wrap text-xs font-mono leading-relaxed" style={{ color: theme.textSoft }}>{invokeLabel(selectedTool.invoke)}</pre>
                    </div>
                    <div className="rounded-2xl p-4" style={{ background: theme.input, border: `1px solid ${theme.border}` }}>
                      <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em]" style={{ color: theme.textGhost }}>
                        <Sparkles className="h-3.5 w-3.5" />
                        capacidades
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedTool.capabilities.map((item) => <span key={item} className="state-badge dormant">{item}</span>)}
                      </div>
                    </div>
                    <div className="rounded-2xl p-4" style={{ background: theme.input, border: `1px solid ${theme.border}` }}>
                      <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em]" style={{ color: theme.textGhost }}>
                        <Bot className="h-3.5 w-3.5" />
                        contexto
                      </div>
                      <div className="space-y-1 text-xs" style={{ color: theme.textSoft }}>
                        <div>kind: <span className="font-mono">{selectedTool.kind}</span></div>
                        <div>provider: <span className="font-mono">{selectedTool.provider}</span></div>
                        <div>source: <span className="font-mono">{selectedTool.source ?? 'local'}</span></div>
                        {selectedTool.canonicalId && <div>canonical: <span className="font-mono">{selectedTool.canonicalId}</span></div>}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div className="rounded-2xl p-4" style={{ background: theme.input, border: `1px solid ${theme.border}` }}>
                      <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em]" style={{ color: theme.textGhost }}>
                        <Braces className="h-3.5 w-3.5" />
                        payload de exemplo
                      </div>
                      <pre className="overflow-auto text-xs font-mono leading-relaxed" style={{ color: theme.textSoft }}>{exampleInput(selectedTool)}</pre>
                    </div>
                    <div className="rounded-2xl p-4" style={{ background: theme.input, border: `1px solid ${theme.border}` }}>
                      <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em]" style={{ color: theme.textGhost }}>
                        <Braces className="h-3.5 w-3.5" />
                        schema
                      </div>
                      <pre className="overflow-auto text-xs font-mono leading-relaxed" style={{ color: theme.textSoft }}>
                        {JSON.stringify(selectedTool.parameters ?? {}, null, 2)}
                      </pre>
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl p-4" style={{ background: theme.surfaceHi, border: `1px solid ${theme.border}` }}>
                    <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: theme.textGhost }}>tags</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedTool.tags.map((tag) => <span key={tag} className="state-badge dormant">{tag}</span>)}
                    </div>
                  </div>

                  {catalog.relatedCatalogs && catalog.relatedCatalogs.length > 0 && (
                    <div className="mt-5 rounded-2xl p-4" style={{ background: theme.surfaceHi, border: `1px solid ${theme.border}` }}>
                      <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: theme.textGhost }}>catálogos irmãos detectados</div>
                      <div className="mt-3 space-y-2 text-xs" style={{ color: theme.textSoft }}>
                        {catalog.relatedCatalogs.map((entry) => (
                          <div key={entry.project}>
                            {entry.project}: <span className="font-mono">{entry.count}</span> item(ns) em <span className="font-mono">{entry.catalogPath}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex min-h-[300px] items-center justify-center text-sm" style={{ color: theme.textMute }}>
                  Nenhuma ferramenta disponível.
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
