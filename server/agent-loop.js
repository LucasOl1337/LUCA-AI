// Tool-calling agent loop used by persona-team runs.
import { call9RouterChat } from './router-client.js';
import {
  AGENT_TOOL_SPECS,
  executeAgentTool,
  extractUrlsFromText,
} from './agent-tools.js';

const DEFAULT_MAX_ROUNDS = Number(process.env.LUCA_AGENT_MAX_TOOL_ROUNDS || 2);

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
  if (result.tool === 'web_search') {
    const results = Array.isArray(result.results) ? result.results : [];
    return [
      `query=${result.query || ''}`,
      `provider=${result.provider || 'unknown'}`,
      result.ok === false ? `error=${result.error || 'search_failed'}` : null,
      ...results.map((item, index) => [
        `${index + 1}. ${String(item?.title || '').slice(0, 240)}`,
        `url=${String(item?.url || '').slice(0, 500)}`,
        `snippet=${String(item?.snippet || '').slice(0, 500)}`,
      ].join('\n')),
    ].filter(Boolean).join('\n').slice(0, 3600);
  }
  if (result.tool === 'calc') {
    return [
      `expression=${result.expression || ''}`,
      result.ok === false ? `error=${result.error || 'calc_failed'}` : `value=${result.value}`,
    ].join('\n').slice(0, 1800);
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
- web_search: pesquisa a web e devolve titulo, URL e trecho dos melhores resultados
- calc: calcula expressoes aritmeticas com seguranca

Regras:
1. Se puder responder com o que ja tem, responda direto — ferramenta e excecao.
2. Ensaio sintetico/local ou dados ja fornecidos: NAO busque a web.
3. Se houver URL na missao, use fetch_url antes de concluir.
4. Se a missao depender de fato externo SEM URL conhecida, use web_search e depois abra 1 fonte com fetch_url.
5. Para aritmetica nao trivial use calc em vez de calcular de cabeca.
6. Nao diga que "nao consegue abrir o site" sem tentar a ferramenta.
7. Nao invente conteudo de pagina que voce nao leu.
8. Se a ferramenta falhar, diga o erro real e o que ainda e possivel fazer.
9. Depois das ferramentas, entregue a resposta final curta e util ao operador.`;
}

const MAX_INLINED_ATTACHMENT_CHARS = 120_000;

/**
 * Attachment blocks are NOT portable across the 9Router catalog: Claude silently
 * ignores `input_file` (the persona answers as if no file existed — worst case,
 * confident and wrong), while `image_url` works everywhere. Text-like files are
 * already plain text on our side, so we inline them into the prompt where every
 * model can read them, and keep only images as native multimodal parts.
 * Verified against cx/gpt-5.6-sol, gcli/grok-4.5 and cc/claude-fable-5.
 */
function buildUserContent(user, attachments = []) {
  const text = String(user || '');
  const list = Array.isArray(attachments) ? attachments : [];
  if (!list.length) return text;

  const nativeParts = [];
  const inlined = [];
  for (const part of list) {
    if (part?.type === 'image_url') {
      nativeParts.push(part);
      continue;
    }
    const fileData = String(part?.file_data || part?.file?.file_data || '');
    const filename = String(part?.filename || part?.file?.filename || 'arquivo');
    const base64 = fileData.includes(',') ? fileData.slice(fileData.indexOf(',') + 1) : '';
    if (!base64) continue;
    let decoded = '';
    try {
      decoded = Buffer.from(base64, 'base64').toString('utf8');
    } catch {
      decoded = '';
    }
    if (!decoded.trim() || decoded.includes('\u0000')) {
      // Binary we cannot read as text: say so instead of faking content.
      inlined.push(`### Anexo: ${filename}\n[conteudo binario nao extraido; peca ao operador o texto se precisar]`);
      continue;
    }
    // Truncar em silencio faria a persona concluir sobre um arquivo pela metade
    // achando que leu tudo. O corte precisa ser declarado no proprio prompt.
    const clipped = decoded.length > MAX_INLINED_ATTACHMENT_CHARS;
    const body = clipped ? decoded.slice(0, MAX_INLINED_ATTACHMENT_CHARS) : decoded;
    const notice = clipped
      ? `\n[TRUNCADO: exibindo ${MAX_INLINED_ATTACHMENT_CHARS} de ${decoded.length} caracteres. Diga que a leitura foi parcial ao concluir.]`
      : '';
    inlined.push(`### Anexo: ${filename}\n${body}${notice}`);
  }

  if (!nativeParts.length && !inlined.length) return text;
  const merged = inlined.length
    ? `${text}\n\n--- Arquivos anexados pelo operador ---\n${inlined.join('\n\n')}`
    : text;
  if (!nativeParts.length) return merged;
  return [{ type: 'text', text: merged }, ...nativeParts];
}

export function isAgentRouterUnreachableError(error) {
  return /9router_unreachable/i.test(String(error?.message || error || ''));
}

function retryMaxTokens(original) {
  const n = Math.max(1, Number(original) || 1200);
  if (n >= 1600) return Math.min(n, 1200);
  return Math.min(n, 480);
}

function truncatedReplyMode(content) {
  const text = String(content || '').trim();
  if (!text) return 'empty';
  const maybeJson = text.startsWith('{') || text.startsWith('[');
  if (maybeJson) return 'continue';
  if (text.length >= 500) return 'skip';
  return 'continue';
}

async function runAgentWithToolsOnce({
  system,
  user,
  attachments = [],
  model,
  agentId,
  maxTokens = 1200,
  maxRounds = DEFAULT_MAX_ROUNDS,
  toolsEnabled = true,
  tools = AGENT_TOOL_SPECS,
  executeTool = executeAgentTool,
  callChat = call9RouterChat,
} = {}) {
  const messages = [
    {
      role: 'system',
      content: `${String(system || '').trim()}${toolsEnabled ? buildOperationalSystemAddon() : ''}`,
    },
    {
      role: 'user',
      content: buildUserContent(user, attachments),
    },
  ];

  const toolTrace = [];
  const urlsInMission = toolsEnabled ? extractUrlsFromText(user) : [];
  let forcedBootstrap = false;
  let continuationUsed = false;
  let lastContent = '';
  let lastFinishReason = null;

  for (let round = 0; round < Math.max(1, maxRounds); round += 1) {
    const response = await callChat({
      model,
      agentId: `${agentId}:r${round}`,
      messages,
      maxTokens,
      temperature: 0.2,
      ...(toolsEnabled ? { tools, toolChoice: 'auto' } : {}),
    });

    lastContent = String(response.content || '').trim();
    lastFinishReason = response.finishReason || null;

    const toolCalls = toolsEnabled && Array.isArray(response.toolCalls) ? response.toolCalls : [];
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

    // Continuation: only recover empty/tiny length cuts. A long truncated
    // reply is already too verbose for the operator — publish it.
    if (response.finishReason === 'length' && !continuationUsed) {
      const mode = truncatedReplyMode(response.content);
      if (mode === 'skip') {
        return {
          content: lastContent || 'Sem resposta textual da persona.',
          toolTrace,
          rounds: round + 1,
          finishReason: 'length',
        };
      }
      continuationUsed = true;
      messages.push({
        role: 'assistant',
        content: response.content || '',
      });
      messages.push({
        role: 'user',
        content: mode === 'empty'
          ? 'O orcamento foi gasto sem texto util. Entregue AGORA a resposta em no maximo 6 bullets, direto ao ponto, sem preambulo e sem copiar o prompt.'
          : 'Sua resposta foi cortada. Conclua em no maximo 4 linhas, sem repetir o que ja escreveu e sem novas secoes.',
      });
      continue;
    }

    return {
      content: lastContent || 'Sem resposta textual da persona.',
      toolTrace,
      rounds: round + 1,
      finishReason: lastFinishReason,
    };
  }

  if (lastContent && lastFinishReason !== 'tool_calls') {
    return {
      content: lastContent,
      toolTrace,
      rounds: Math.max(1, maxRounds),
      finishReason: lastFinishReason || 'max_rounds',
    };
  }

  const final = await callChat({
    model,
    agentId: `${agentId}:final`,
    messages: [
      ...messages,
      {
        role: 'user',
        content: 'Encerre agora com a melhor resposta final possivel usando as evidencias ja obtidas. Nao chame mais ferramentas. No maximo 8 linhas.',
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

export async function runAgentWithTools(options = {}) {
  try {
    return await runAgentWithToolsOnce(options);
  } catch (error) {
    if (!isAgentRouterUnreachableError(error)) throw error;
    return runAgentWithToolsOnce({
      ...options,
      toolsEnabled: false,
      maxRounds: 1,
      maxTokens: retryMaxTokens(options.maxTokens),
    });
  }
}
