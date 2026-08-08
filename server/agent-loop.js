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
1. Se houver URL na missao, use fetch_url antes de concluir.
2. Se a missao depender de fato externo SEM URL conhecida, use web_search primeiro e depois abra as 1-2 melhores fontes com fetch_url.
3. Para aritmetica nao trivial use calc em vez de calcular de cabeca.
4. Nao diga que "nao consegue abrir o site" sem tentar a ferramenta.
5. Nao invente conteudo de pagina que voce nao leu.
6. Se a ferramenta falhar, diga o erro real e o que ainda e possivel fazer.
7. Depois das ferramentas, entregue a resposta final util ao operador.`;
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

export async function runAgentWithTools({
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

  for (let round = 0; round < Math.max(1, maxRounds); round += 1) {
    const response = await callChat({
      model,
      agentId: `${agentId}:r${round}`,
      messages,
      maxTokens,
      temperature: 0.2,
      ...(toolsEnabled ? { tools, toolChoice: 'auto' } : {}),
    });

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

    // Continuation: provider cut the reply at max_tokens; ask for the rest once
    // instead of publishing a truncated verdict as if it were complete.
    if (response.finishReason === 'length' && !continuationUsed) {
      continuationUsed = true;
      messages.push({
        role: 'assistant',
        content: response.content || '',
      });
      messages.push({
        role: 'user',
        content: 'Sua resposta foi cortada no limite de tokens. Continue exatamente de onde parou, sem repetir o que ja escreveu, e conclua todas as secoes pendentes.',
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
