// Provedor de voz xAI Grok Voice (Realtime por WebSocket, eventos no formato
// da OpenAI Realtime). Decisão do Lucas em 15/10 (m1-respostas-r2).
// Credencial: XAI_API_KEY; senão o campo `key` do auth file do Grok CLI
// (XAI_OAUTH_AUTH_FILE), lido na hora, sem copiar, cachear nem logar.
import fs from 'node:fs';

export const URL_TOKEN_XAI = 'https://api.x.ai/v1/realtime/client_secrets';
export const URL_WS_XAI = 'wss://api.x.ai/v1/realtime';

/** Devolve `{chave, origem}` ou `{motivo}` quando não há credencial usável. */
export function credencialXai(env = process.env, { lerArquivo = (p) => fs.readFileSync(p, 'utf8'), agora = () => Date.now() } = {}) {
  const chave = String(env.XAI_API_KEY || '').trim();
  if (chave) return { chave, origem: 'api_key' };
  const arquivo = String(env.XAI_OAUTH_AUTH_FILE || '').trim();
  if (!arquivo) return { motivo: 'sem_credencial' };
  let entrada;
  try {
    const dados = JSON.parse(lerArquivo(arquivo));
    entrada = Object.values(dados && typeof dados === 'object' ? dados : {}).find((v) => v && typeof v.key === 'string');
  } catch {
    return { motivo: 'auth_file_ilegivel' };
  }
  if (!entrada?.key) return { motivo: 'auth_file_sem_chave' };
  const expira = Date.parse(entrada.expires_at || '');
  if (Number.isFinite(expira) && expira <= agora() + 30_000) return { motivo: 'credencial_expirada' };
  return { chave: entrada.key, origem: 'oauth_grok' };
}

/** Configuração que o navegador manda em `session.update` logo após conectar. */
export function sessaoXai({ instrucoes, ferramentas, voz = 'Ara' }) {
  return {
    voice: voz,
    instructions: instrucoes,
    tools: ferramentas,
    turn_detection: { type: 'server_vad' },
    audio: {
      input: { format: { type: 'audio/pcm', rate: 24000 }, transcription: { model: 'grok-stt' } },
      output: { format: { type: 'audio/pcm', rate: 24000 } },
    },
  };
}

export const provedorXai = Object.freeze({
  nome: 'xai',
  vozPadrao: 'Ara',
  credencial: credencialXai,
  sessao: sessaoXai,
  async pedirToken({ chave, fetchImpl }) {
    const resposta = await fetchImpl(URL_TOKEN_XAI, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expires_after: { seconds: 60 } }),
      signal: AbortSignal.timeout(10_000),
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok || typeof dados?.value !== 'string') return { ok: false, status: resposta.status };
    return { ok: true, token: dados.value, expira_em: dados.expires_at ?? null };
  },
  /** Como o navegador abre o WebSocket: URL e subprotocolo com o token efêmero. */
  conexao: (token) => ({ transporte: 'websocket', url: URL_WS_XAI, protocolos: [`xai-client-secret.${token}`] }),
});
