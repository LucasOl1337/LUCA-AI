// Tool-calling agent loop used by persona-team runs.
import { call9RouterChat } from './router-client.js';
import {
  AGENT_TOOL_SPECS,
  executeAgentTool,
  extractUrlsFromText,
} from './agent-tools.js';

const DEFAULT_MAX_ROUNDS = Number(process.env.LUCA_AGENT_MAX_TOOL_ROUNDS || 3);

function safeJsonParse(value) {
  try {
    return JSON.parse(String(value || '{}'));
  } catch {
    return {};
  }
}

function summarizeToolResult(result) {
  if (!result || typeof result !== 'object') return String(result || '');
  if (result.tool === 'fetch_url') {
    return [
      `status=${result.status}`,
      result.title ? `title=${result.title}` : null,
      result.url ? `url=${result.url}` : null,
      result.ok === false ? `error=${result.error || 'fetch_failed'}` : null,
      result.text ? `text=${String(result.text).slice(0, 1600)}` : null,
    ].filter(Boolean).join('\n');
  }
  if (result.tool === 'http_get_json') {
    return [
      `status=${result.status}`,
      result.url ? `url=${result.url}` : null,
      result.parseError ? `parseError=${result.parseError}` : null,
      result.data ? `data=${JSON.stringify(result.data).slice(0, 1600)}` : `raw=${result.rawPreview || ''}`,
    ].filter(Boolean).join('\n');
  }
  return JSON.stringify(result).slice(0, 1800);
}

function buildOperationalSystemAddon() {
  return `

---
Capacidade operacional ativa neste runtime:
Voce pode e deve usar ferramentas quando a missao depender de fato externo (site, API, documentacao).
Ferramentas disponiveis:
- fetch_url: abre uma URL publica e devolve texto legivel
- http_get_json: GET JSON publico

Regras:
1. Se houver URL na missao, use fetch_url antes de concluir.
2. Nao diga que "nao consegue abrir o site" sem tentar a ferramenta.
3. Nao invente conteudo de pagina que voce nao leu.
4. Se a ferramenta falhar, diga o erro real e o que ainda e possivel fazer.
5. Depois das ferramentas, entregue a resposta final util ao operador.`;
}

export async function runAgentWithTools({
  system,
  user,
  model,
  agentId,
  maxTokens = 1200,
  maxRounds = DEFAULT_MAX_ROUNDS,
  tools = AGENT_TOOL_SPECS,
  executeTool = executeAgentTool,
  callChat = call9RouterChat,
} = {}) {
  const messages = [
    { role: 'system', content: `${String(system || '').trim()}${buildOperationalSystemAddon()}` },
    { role: 'user', content: String(user || '') },
  ];

  const toolTrace = [];
  const urlsInMission = extractUrlsFromText(user);
  let forcedBootstrap = false;

  for (let round = 0; round < Math.max(1, maxRounds); round += 1) {
    const response = await callChat({
      model,
      agentId: `${agentId}:r${round}`,
      messages,
      tools,
      toolChoice: 'auto',
      maxTokens,
      temperature: 0.2,
    });

    const toolCalls = Array.isArray(response.toolCalls) ? response.toolCalls : [];
    if (toolCalls.length) {
      messages.push({
        role: 'assistant',
        content: response.content || null,
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        const name = call?.function?.name || call?.name || '';
        const args = typeof call?.function?.arguments === 'string'
          ? safeJsonParse(call.function.arguments)
          : (call?.function?.arguments || call?.arguments || {});
        const result = await executeTool(name, args);
        toolTrace.push({
          id: call.id || `tool_${toolTrace.length + 1}`,
          name,
          args,
          result,
        });
        messages.push({
          role: 'tool',
          tool_call_id: call.id || `tool_${toolTrace.length}`,
          content: summarizeToolResult(result),
        });
      }
      continue;
    }

    // Bootstrap: if the model ignored an explicit URL, force one fetch once.
    if (!forcedBootstrap && urlsInMission.length && toolTrace.length === 0) {
      forcedBootstrap = true;
      const url = urlsInMission[0];
      const result = await executeTool('fetch_url', { url, max_chars: 10000 });
      toolTrace.push({
        id: `bootstrap_fetch_${toolTrace.length + 1}`,
        name: 'fetch_url',
        args: { url, max_chars: 10000 },
        result,
        forced: true,
      });
      messages.push({
        role: 'user',
        content: `Resultado operacional de fetch_url para ${url}:\n${summarizeToolResult(result)}\n\nCom base nisso, responda a missao. Nao peca print se o texto acima for suficiente.`,
      });
      continue;
    }

    return {
      content: String(response.content || '').trim() || 'Sem resposta textual da persona.',
      toolTrace,
      rounds: round + 1,
      finishReason: response.finishReason || null,
    };
  }

  // Final no-tools pass if we exhausted rounds mid-tooling.
  const final = await callChat({
    model,
    agentId: `${agentId}:final`,
    messages: [
      ...messages,
      {
        role: 'user',
        content: 'Encerre agora com a melhor resposta final possivel usando as evidencias ja obtidas. Nao chame mais ferramentas.',
      },
    ],
    tools: [],
    maxTokens,
    temperature: 0.2,
  });

  return {
    content: String(final.content || '').trim() || 'Sem resposta textual da persona.',
    toolTrace,
    rounds: Math.max(1, maxRounds),
    finishReason: final.finishReason || 'max_rounds',
  };
}
