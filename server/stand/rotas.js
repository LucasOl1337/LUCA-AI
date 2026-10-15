// Rotas do cérebro de voz do stand (M1). Ficam atrás de requireUser: o PC do
// stand loga com uma conta demo. A credencial do provedor fica só no servidor;
// o navegador recebe um token efêmero e a configuração da sessão, e fala com o
// provedor direto. Nenhum áudio passa pelo Express nem é gravado.
import { FERRAMENTAS_STAND, executarFerramentaStand, videoPublicado } from './ferramentas.js';
import { montarPromptBase } from './conhecimento.js';
import { provedorXai } from './provedor-xai.js';

export const LIMITES_STAND = Object.freeze({ silencio_s: 20, teto_s: 240, sessoes_por_hora: 30 });
const UMA_HORA_MS = 60 * 60 * 1000;

// Plano B (ElevenLabs, agente conversacional) entra aqui com a mesma forma:
// {nome, vozPadrao, credencial(env), sessao({instrucoes, ferramentas, voz}), pedirToken, conexao}.
export const PROVEDORES_VOZ = Object.freeze({ xai: provedorXai });

export function configStand(env = process.env, provedores = PROVEDORES_VOZ) {
  const nome = String(env.STAND_VOZ_PROVEDOR || 'xai').trim();
  const provedor = provedores[nome];
  if (!provedor) return { nome, motivo: 'provedor_desconhecido' };
  const credencial = provedor.credencial(env);
  return {
    nome,
    provedor,
    voz: String(env.LUCA_STAND_VOZ || provedor.vozPadrao).trim(),
    chave: credencial.chave || '',
    motivo: credencial.chave ? null : credencial.motivo,
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

async function roteadorPadrao() {
  const { criarRoteador } = await import('./roteador-video.js');
  return criarRoteador();
}

export function registerStandRoutes(app, {
  env = process.env,
  fetchImpl = globalThis.fetch,
  guarda = criarGuardaDeSessoes(),
  provedores = PROVEDORES_VOZ,
  criarRoteador = roteadorPadrao,
  instrucoes = () => montarPromptBase(),
  publicado = videoPublicado,
} = {}) {
  const conta = (req) => String(req.auth?.user?.id || '');
  let roteador = null;
  const obterRoteador = () => (roteador ??= criarRoteador().catch((erro) => {
    roteador = null;
    throw erro;
  }));

  app.get('/api/stand/status', (req, res) => {
    const config = configStand(env, provedores);
    res.json({
      ok: true,
      ligado: Boolean(config.chave),
      provedor: config.nome,
      motivo: config.motivo,
      voz: config.voz ?? null,
      limites: LIMITES_STAND,
      sessoes_na_hora: guarda.usadas(conta(req)),
    });
  });

  app.post('/api/stand/sessao', async (req, res) => {
    const config = configStand(env, provedores);
    if (!config.chave) return res.status(503).json({ ok: false, error: 'stand_desligado', motivo: config.motivo });
    if (!guarda.tentar(conta(req))) {
      res.setHeader('Retry-After', '600');
      return res.status(429).json({ ok: false, error: 'stand_teto_sessoes', limites: LIMITES_STAND });
    }
    // Aquece o cache de embeddings do roteador enquanto o navegador conecta.
    obterRoteador().then((r) => r.preaquecer()).catch(() => {});
    try {
      const token = await config.provedor.pedirToken({ chave: config.chave, fetchImpl });
      if (!token.ok) {
        console.warn(`[stand] token recusado por ${config.nome}: HTTP ${token.status}`);
        return res.status(502).json({ ok: false, error: 'stand_provedor_recusou', status: token.status });
      }
      res.json({
        ok: true,
        provedor: config.nome,
        token: token.token,
        expira_em: token.expira_em,
        conexao: config.provedor.conexao(token.token),
        sessao: config.provedor.sessao({ instrucoes: instrucoes(), ferramentas: FERRAMENTAS_STAND, voz: config.voz }),
        limites: LIMITES_STAND,
      });
    } catch (erro) {
      console.warn(`[stand] falha ao pedir token a ${config.nome}: ${erro?.name || 'erro'}`);
      res.status(502).json({ ok: false, error: 'stand_provedor_indisponivel' });
    }
  });

  app.post('/api/stand/ferramenta', async (req, res) => {
    const { nome, args } = req.body || {};
    const resultado = await executarFerramentaStand(nome, args);
    res.status(resultado.erro === 'ferramenta_desconhecida' ? 400 : 200).json(resultado);
  });

  // Pergunta transcrita → decisão de vídeo da M7 ({id, confianca, decisao} ou null).
  // Vídeo sem mp4 publicado vira null: a IA responde ao vivo em vez de prometer
  // um vídeo que `tocar_video` recusaria.
  app.post('/api/stand/rotear', async (req, res) => {
    const texto = String(req.body?.texto || '').trim().slice(0, 500);
    if (!texto) return res.status(400).json({ ok: false, error: 'texto_vazio' });
    try {
      const decisao = await (await obterRoteador()).rotearPergunta(texto);
      res.json({ ok: true, decisao: decisao && publicado(decisao.id) ? decisao : null });
    } catch {
      res.json({ ok: true, decisao: null });
    }
  });
}
