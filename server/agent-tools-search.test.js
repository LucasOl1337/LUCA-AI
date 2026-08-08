import test from 'node:test';
import assert from 'node:assert/strict';

import { runAgentWithTools } from './agent-loop.js';
import { AGENT_TOOL_SPECS, executeAgentTool } from './agent-tools.js';

const originalFetch = globalThis.fetch;
const originalBraveKey = process.env.BRAVE_SEARCH_API_KEY;
const originalTavilyKey = process.env.TAVILY_API_KEY;

function setSearchEnv({ brave, tavily } = {}) {
  if (brave === undefined) delete process.env.BRAVE_SEARCH_API_KEY;
  else process.env.BRAVE_SEARCH_API_KEY = brave;
  if (tavily === undefined) delete process.env.TAVILY_API_KEY;
  else process.env.TAVILY_API_KEY = tavily;
}

function restoreSearchEnv() {
  globalThis.fetch = originalFetch;
  if (originalBraveKey === undefined) delete process.env.BRAVE_SEARCH_API_KEY;
  else process.env.BRAVE_SEARCH_API_KEY = originalBraveKey;
  if (originalTavilyKey === undefined) delete process.env.TAVILY_API_KEY;
  else process.env.TAVILY_API_KEY = originalTavilyKey;
}

test.afterEach(restoreSearchEnv);

test('catalogo expoe web_search e calc com os parametros operacionais', () => {
  const specs = new Map(AGENT_TOOL_SPECS.map((entry) => [entry.function.name, entry.function]));

  assert.deepEqual(specs.get('web_search')?.parameters.required, ['query']);
  assert.equal(specs.get('web_search')?.parameters.properties.max_results.maximum, 8);
  assert.deepEqual(specs.get('calc')?.parameters.required, ['expression']);
});

test('calc respeita precedencia, parenteses, divisao e potencia associativa a direita', async () => {
  const cases = [
    ['2 + 3 * 4', 14],
    ['(2 + 3) * 4', 20],
    ['18 / 3 / 2', 3],
    ['2 ^ 3 ^ 2', 512],
    ['-2 ^ 2 + 10 % 4', -2],
  ];

  for (const [expression, expected] of cases) {
    const result = await executeAgentTool('calc', { expression });
    assert.deepEqual(result, {
      ok: true,
      tool: 'calc',
      expression,
      value: expected,
    });
  }
});

test('calc rejeita expressoes invalidas sem executar codigo', async () => {
  for (const expression of ['2 + process.exit()', '2 ** 3', '1 / 0', '2 +', '']) {
    const result = await executeAgentTool('calc', { expression });
    assert.equal(result.ok, false, expression);
    assert.equal(result.tool, 'calc');
    assert.equal(result.expression, expression);
    assert.equal(result.value, null);
    assert.ok(result.error);
  }
});

test('web_search usa Brave quando a chave existe e normaliza resultados', async () => {
  setSearchEnv({ brave: 'brave-secret', tavily: 'tavily-secret' });
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin + parsed.pathname, 'https://api.search.brave.com/res/v1/web/search');
    assert.equal(parsed.searchParams.get('q'), 'previdencia complementar');
    assert.equal(parsed.searchParams.get('count'), '8');
    assert.equal(options.headers['X-Subscription-Token'], 'brave-secret');
    return new Response(JSON.stringify({
      web: {
        results: [
          { title: 'Fonte Brave', url: 'https://example.com/brave', description: 'Resumo da fonte.' },
        ],
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const result = await executeAgentTool('web_search', {
    query: 'previdencia complementar',
    max_results: 99,
  });

  assert.deepEqual(result, {
    ok: true,
    tool: 'web_search',
    query: 'previdencia complementar',
    provider: 'brave',
    results: [{ title: 'Fonte Brave', url: 'https://example.com/brave', snippet: 'Resumo da fonte.' }],
  });
});

test('web_search usa Tavily quando Brave nao esta configurado', async () => {
  setSearchEnv({ tavily: 'tavily-secret' });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.tavily.com/search');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), {
      api_key: 'tavily-secret',
      query: 'taxa atuarial',
      max_results: 5,
    });
    return new Response(JSON.stringify({
      results: [
        { title: 'Fonte Tavily', url: 'https://example.com/tavily', content: 'Trecho Tavily.' },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const result = await executeAgentTool('web_search', { query: 'taxa atuarial' });

  assert.equal(result.ok, true);
  assert.equal(result.provider, 'tavily');
  assert.deepEqual(result.results, [
    { title: 'Fonte Tavily', url: 'https://example.com/tavily', snippet: 'Trecho Tavily.' },
  ]);
});

test('web_search faz fallback para DuckDuckGo HTML e interpreta redirect e entidades', async () => {
  setSearchEnv();
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin + parsed.pathname, 'https://html.duckduckgo.com/html/');
    assert.equal(parsed.searchParams.get('q'), 'renda fixa 2026');
    assert.match(options.headers['User-Agent'], /Mozilla\/5\.0/);
    return new Response(`
      <html><body>
        <div class="result results_links results_links_deep web-result">
          <h2 class="result__title">
            <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fum&amp;rut=x">Resultado &amp; Um</a>
          </h2>
          <a class="result__snippet" href="https://example.com/um">Primeiro <b>trecho</b> &amp; contexto.</a>
        </div>
        <div class="result results_links results_links_deep web-result">
          <h2 class="result__title">
            <a class="result__a" href="https://example.org/dois">Resultado Dois</a>
          </h2>
          <div class="result__snippet">Segundo trecho.</div>
        </div>
      </body></html>
    `, { status: 200, headers: { 'content-type': 'text/html' } });
  };

  const result = await executeAgentTool('web_search', { query: 'renda fixa 2026', max_results: 2 });

  assert.deepEqual(result, {
    ok: true,
    tool: 'web_search',
    query: 'renda fixa 2026',
    provider: 'duckduckgo',
    results: [
      {
        title: 'Resultado & Um',
        url: 'https://example.com/um',
        snippet: 'Primeiro trecho & contexto.',
      },
      {
        title: 'Resultado Dois',
        url: 'https://example.org/dois',
        snippet: 'Segundo trecho.',
      },
    ],
  });
});

test('loop orienta pesquisa e calculo e resume os novos resultados para a persona', async () => {
  const requests = [];
  let round = 0;
  const result = await runAgentWithTools({
    system: 'Voce e um analista.',
    user: 'Compare um fato recente e calcule o retorno.',
    model: 'test/model',
    agentId: 'search-calc-agent',
    callChat: async (request) => {
      requests.push(request);
      round += 1;
      if (round === 1) {
        return {
          content: '',
          finishReason: 'tool_calls',
          toolCalls: [
            {
              id: 'search_1',
              function: { name: 'web_search', arguments: '{"query":"fato recente"}' },
            },
            {
              id: 'calc_1',
              function: { name: 'calc', arguments: '{"expression":"7 * 8"}' },
            },
          ],
        };
      }
      return { content: 'Analise concluida.', finishReason: 'stop', toolCalls: [] };
    },
    executeTool: async (name) => name === 'web_search'
      ? {
        ok: true,
        tool: 'web_search',
        query: 'fato recente',
        provider: 'duckduckgo',
        results: [{
          title: 'Fonte principal',
          url: 'https://example.com/fonte',
          snippet: 'Trecho factual que deve aparecer no contexto.',
        }],
      }
      : { ok: true, tool: 'calc', expression: '7 * 8', value: 56 },
  });

  const system = requests[0].messages[0].content;
  assert.match(system, /web_search/);
  assert.match(system, /calc/);
  assert.match(system, /SEM URL conhecida.*web_search primeiro.*1-2 melhores fontes.*fetch_url/is);
  assert.match(system, /aritmetica nao trivial.*calc.*calcular de cabeca/is);
  assert.match(requests[1].messages[3].content, /Fonte principal[\s\S]*https:\/\/example\.com\/fonte[\s\S]*Trecho factual/);
  assert.match(requests[1].messages[4].content, /expression=7 \* 8[\s\S]*value=56/);
  assert.equal(result.content, 'Analise concluida.');
});
