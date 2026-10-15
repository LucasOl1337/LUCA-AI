// Rotas do cérebro de voz do stand (M1). Ficam atrás de requireUser: o PC do
// stand loga com uma conta demo. A chave da OpenAI fica só no servidor; o
// navegador recebe um token efêmero e fala com a Realtime por WebRTC.
// Nenhum áudio passa pelo Express nem é gravado.
import { FERRAMENTAS_STAND, executarFerramentaStand } from './ferramentas.js';
import { montarPromptBase } from './conhecimento.js';

export const LIMITES_STAND = Object.freeze({ silencio_s: 20, teto_s: 240, sessoes_por_hora: 30 });
const URL_TOKEN = 'https://api.openai.com/v1/realtime/client_secrets';
const UMA_HORA_MS = 60 * 60 * 1000;

export function configStand(env = process.env) {
  return {
    chave: String(env.OPENAI_API_KEY || '').trim(),
    modelo: String(env.LUCA_STAND_MODELO || 'gpt-realtime').trim(),
    voz: String(env.LUCA_STAND_VOZ || 'cedar').trim(),
  };
}

/** Corpo do pedido de token efêmero: a sessão já sai configurada do servidor. */
export function corpoDoToken({ modelo, voz }, instrucoes = montarPromptBase()) {
  return {
    expires_after: { anchor: 'created_at', seconds: 60 },
    session: {
      type: 'realtime',
      model: modelo,
      instructions: instrucoes,
      tools: FERRAMENTAS_STAND,
      tool_choice: 'auto',
      audio: {
        input: {
          transcription: { model: 'gpt-4o-mini-transcribe', language: 'pt' },
          turn_detection: { type: 'server_vad', silence_duration_ms: 500, interrupt_response: true, create_response: true },
          noise_reduction: { type: 'far_field' },
        },
        output: { voice: voz },
      },
    },
  };
}

/** Conta sessões por conta numa janela deslizante de 1 h, em memória. */
export function criarGuardaDeSessoes({ teto = LIMITES_STAND.sessoes_por_hora, agora = () => Date.now() } = {}) {
  const porConta = new Map();
  const recentes = (conta) => (porConta.get(conta) || []).filter((t) => agora() - t < UMA_HORA_MS);
  return {
    usadas: (conta) => recentes(conta).length,
    tentar(conta) {
      const lista = recentes(conta);
      if (lista.length >= teto) return false;
      lista.push(agora());
      porConta.set(conta, lista);
      return true;
    },
  };
}

export function registerStandRoutes(app, { env = process.env, fetchImpl = globalThis.fetch, guarda = criarGuardaDeSessoes() } = {}) {
  const conta = (req) => String(req.auth?.user?.id || '');

  app.get('/api/stand/status', (req, res) => {
    const { chave, modelo, voz } = configStand(env);
    res.json({ ok: true, ligado: Boolean(chave), modelo, voz, limites: LIMITES_STAND, sessoes_na_hora: guarda.usadas(conta(req)) });
  });

  app.post('/api/stand/sessao', async (req, res) => {
    const config = configStand(env);
    if (!config.chave) return res.status(503).json({ ok: false, error: 'stand_desligado' });
    if (!guarda.tentar(conta(req))) {
      res.setHeader('Retry-After', '600');
      return res.status(429).json({ ok: false, error: 'stand_teto_sessoes', limites: LIMITES_STAND });
    }
    try {
      const resposta = await fetchImpl(URL_TOKEN, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.chave}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(corpoDoToken(config)),
        signal: AbortSignal.timeout(10_000),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok || typeof dados?.value !== 'string') {
        console.warn(`[stand] token recusado pela OpenAI: HTTP ${resposta.status} ${dados?.error?.code || ''}`.trim());
        return res.status(502).json({ ok: false, error: 'stand_provedor_recusou', status: resposta.status });
      }
      res.json({ ok: true, token: dados.value, expira_em: dados.expires_at ?? null, modelo: config.modelo, limites: LIMITES_STAND });
    } catch (erro) {
      console.warn(`[stand] falha ao pedir token: ${erro?.name || 'erro'}`);
      res.status(502).json({ ok: false, error: 'stand_provedor_indisponivel' });
    }
  });

  app.post('/api/stand/ferramenta', async (req, res) => {
    const { nome, args } = req.body || {};
    const resultado = await executarFerramentaStand(nome, args);
    res.status(resultado.erro === 'ferramenta_desconhecida' ? 400 : 200).json(resultado);
  });
}
