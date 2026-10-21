// Provedor de voz ElevenLabs do stand (decisão do Lucas, 19/10; docs/stand-voz.md).
// Diferente da Grok, a conversa anda em turnos: o navegador manda o microfone
// direto ao Scribe v2 Realtime com um token de uso único gerado aqui, e a
// transcrição fechada volta ao servidor (`POST /api/stand/turno`), que roda o
// cérebro (cerebro.js) e sintetiza a resposta com a voz do Lucas.
// Credencial: ELEVENLABS_API_KEY, só no servidor; nunca vai ao navegador.

export const URL_API_ELEVENLABS = 'https://api.elevenlabs.io';
export const URL_WS_SCRIBE = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime';
export const HZ_STAND = 24000;
export const TTS_MODELO_PADRAO = 'eleven_turbo_v2_5';
export const VOZ_PADRAO_ELEVENLABS = 'Lucas Oliveira';
const VOZ_ID = /^[A-Za-z0-9]{20}$/;

/**
 * Vozes que o Totem deixa escolher antes da conversa (Lucas, 21/10). Lista
 * branca: o navegador manda só a chave; nome e voice_id ficam aqui. `lucas`
 * segue `LUCA_STAND_VOZ` (padrão "Lucas Oliveira"). A Andrea é voz pública da
 * Voice Library (rate 1,0: custa o mesmo crédito por caractere); só funciona
 * depois de adicionada à conta, por isso `verificarVoz` confere antes de usar.
 */
export const VOZ_STAND_PADRAO = 'lucas';
export const VOZES_STAND = Object.freeze({
  lucas: Object.freeze({ rotulo: 'Lucas Oliveira', voz: null }),
  andrea: Object.freeze({ rotulo: 'Andrea Lot', voz: 'HOfBIVLhom4mc9WvXfyH' }),
});

/** Chave pedida pelo navegador → chave da lista branca (qualquer outra coisa vira o padrão). */
export function chaveVozStand(pedido) {
  const chave = String(pedido ?? '').trim().toLowerCase();
  return Object.hasOwn(VOZES_STAND, chave) ? chave : VOZ_STAND_PADRAO;
}

/** Nome ou voice_id da voz de uma chave; `lucas` usa a voz configurada no servidor. */
export function vozDaChave(chave, vozPadrao = VOZ_PADRAO_ELEVENLABS) {
  return VOZES_STAND[chaveVozStand(chave)].voz || vozPadrao;
}
const MODELO_TTS = /^eleven_[a-z0-9_]+$/;

// Medido em 19/10 (`entregas/totem-voz-rastro.md`): 0,6 s de silêncio fecha a
// fala 0,7 s depois do fim; o padrão (1 s+) levava 1,7 s.
export const SCRIBE = Object.freeze({
  model_id: 'scribe_v2_realtime',
  audio_format: `pcm_${HZ_STAND}`,
  language_code: 'por',
  commit_strategy: 'vad',
  vad_silence_threshold_secs: '0.6',
});

// Créditos do plano: TTS cobra por caractere (Flash/Turbo pela metade); o
// Scribe Realtime custou 31 créditos em 53 s de sessão (19/10), ~35/min.
export const CREDITOS_STT_POR_MINUTO = 36;
export function fatorCreditosTts(modelo) {
  return /flash|turbo/.test(String(modelo)) ? 0.5 : 1;
}

/** Devolve `{chave}` ou `{motivo}` quando falta a credencial. */
export function credencialElevenlabs(env = process.env) {
  const chave = String(env.ELEVENLABS_API_KEY || '').trim();
  return chave ? { chave, origem: 'api_key' } : { motivo: 'sem_credencial' };
}

export function modeloTtsStand(env = process.env) {
  const pedido = String(env.STAND_TTS_MODELO || '').trim();
  return MODELO_TTS.test(pedido) ? pedido : TTS_MODELO_PADRAO;
}

const vozesResolvidas = new Map();

/**
 * Nome da voz → voice_id, confirmado na conta (como a skill `elevenlabs-voz`).
 * Um id de 20 caracteres passa direto. Fica em memória depois da 1ª vez.
 */
export async function resolverVoz({ chave, voz, fetchImpl = globalThis.fetch, cache = vozesResolvidas }) {
  const pedido = String(voz || VOZ_PADRAO_ELEVENLABS).trim();
  if (VOZ_ID.test(pedido)) return pedido;
  if (cache.has(pedido)) return cache.get(pedido);
  const url = `${URL_API_ELEVENLABS}/v2/voices?${new URLSearchParams({ search: pedido, page_size: '100' })}`;
  const resposta = await fetchImpl(url, { headers: { 'xi-api-key': chave }, signal: AbortSignal.timeout(8000) });
  if (!resposta.ok) throw new Error(`elevenlabs_vozes_${resposta.status}`);
  const dados = await resposta.json();
  const iguais = (dados?.voices || []).filter((v) => String(v.name || '').trim().toLowerCase() === pedido.toLowerCase());
  if (iguais.length !== 1) throw new Error(iguais.length ? 'voz_ambigua' : 'voz_nao_encontrada');
  cache.set(pedido, iguais[0].voice_id);
  return iguais[0].voice_id;
}

export const VERIFICACAO_VOZ_MS = 10 * 60 * 1000;
const vozesVerificadas = new Map();

/**
 * A voz existe e a chave pode usá-la? Nome: resolve em /v2/voices. voice_id:
 * GET /v1/voices/{id} (voz da biblioteca não adicionada responde 404). O
 * resultado fica 10 min em memória, então uma voz adicionada depois volta sozinha.
 */
export async function verificarVoz({ chave, voz, fetchImpl = globalThis.fetch, cache = vozesVerificadas, agora = Date.now() }) {
  const pedido = String(voz || VOZ_PADRAO_ELEVENLABS).trim();
  const salvo = cache.get(pedido);
  if (salvo && agora - salvo.em < VERIFICACAO_VOZ_MS) return salvo.ok;
  let ok = false;
  try {
    if (VOZ_ID.test(pedido)) {
      const resposta = await fetchImpl(`${URL_API_ELEVENLABS}/v1/voices/${encodeURIComponent(pedido)}`, { headers: { 'xi-api-key': chave }, signal: AbortSignal.timeout(8000) });
      ok = resposta.ok;
    } else {
      ok = Boolean(await resolverVoz({ chave, voz: pedido, fetchImpl, cache: new Map() }));
    }
  } catch {
    ok = false;
  }
  cache.set(pedido, { ok, em: agora });
  return ok;
}

/**
 * TTS em streaming (PCM16 mono 24 kHz). Gera Buffers de tamanho par: um byte
 * solto no fim de um pedaço vai pro começo do próximo.
 */
export async function* sintetizarElevenlabs({ chave, vozId, texto, modelo = TTS_MODELO_PADRAO, anterior = '', sinal, fetchImpl = globalThis.fetch }) {
  // Turbo e multilingual aceitam os dois campos (testado em 19/10).
  const corpo = { text: texto, model_id: modelo, language_code: 'pt' };
  if (anterior) corpo.previous_text = anterior;
  const url = `${URL_API_ELEVENLABS}/v1/text-to-speech/${encodeURIComponent(vozId)}/stream?output_format=pcm_${HZ_STAND}`;
  const resposta = await fetchImpl(url, {
    method: 'POST',
    headers: { 'xi-api-key': chave, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
    signal: sinal,
  });
  if (!resposta.ok || !resposta.body) throw new Error(`elevenlabs_tts_${resposta.status}`);
  let sobra = null;
  for await (const pedaco of resposta.body) {
    let bytes = Buffer.from(pedaco);
    if (sobra) { bytes = Buffer.concat([sobra, bytes]); sobra = null; }
    if (bytes.length % 2) { sobra = bytes.subarray(bytes.length - 1); bytes = bytes.subarray(0, bytes.length - 1); }
    if (bytes.length) yield bytes;
  }
}

export const provedorElevenlabs = Object.freeze({
  nome: 'elevenlabs',
  vozPadrao: VOZ_PADRAO_ELEVENLABS,
  /** A conversa roda em turnos pelo servidor (`/api/stand/turno`). */
  turnos: true,
  credencial: credencialElevenlabs,
  /** O navegador só precisa saber o formato do áudio: prompt e ferramentas ficam aqui. */
  sessao: () => ({ modo: 'turnos', entrada_hz: HZ_STAND, saida_hz: HZ_STAND }),
  async pedirToken({ chave, fetchImpl }) {
    const resposta = await fetchImpl(`${URL_API_ELEVENLABS}/v1/single-use-token/realtime_scribe`, {
      method: 'POST',
      headers: { 'xi-api-key': chave },
      signal: AbortSignal.timeout(10_000),
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok || typeof dados?.token !== 'string') return { ok: false, status: resposta.status };
    return { ok: true, token: dados.token, expira_em: null };
  },
  /** Scribe Realtime: o token de uso único vai na query; sem subprotocolo. */
  conexao: (token) => ({
    transporte: 'scribe',
    url: `${URL_WS_SCRIBE}?${new URLSearchParams({ ...SCRIBE, token })}`,
    protocolos: [],
  }),
});
