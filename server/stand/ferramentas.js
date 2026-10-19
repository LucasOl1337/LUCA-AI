// Ferramentas da sessão de voz do stand (M1). Formato de tool da OpenAI
// Realtime ({type, name, description, parameters}) e executor no servidor.
// O navegador recebe a chamada da IA, repassa a /api/stand/ferramenta e
// devolve o resultado à sessão; `evento` (quando houver) vai pra página.
// As ações do site são uma ferramenta por ação, com enum, vindas da M3
// (`shared/stand/acoes-site.ts`), e passam pelo validador dela.
import { ferramentasAcaoSite, validarAcaoSite } from '../../shared/stand/acoes-site.ts';
import { executeAgentTool } from '../agent-tools.js';
import { buscarNoRepo, RAIZ_REPO, videoTemArquivo } from './conhecimento.js';
import { carregarManifesto } from './roteador-video.js';

export const FERRAMENTAS_STAND = Object.freeze([
  {
    type: 'function',
    name: 'buscar_no_repo',
    description: 'Busca trechos da documentação de produto do LUCA-AI (telemetria, simulador, score de risco, bancada de agentes, Sompo). Use antes de afirmar um detalhe do sistema.',
    parameters: {
      type: 'object',
      properties: { consulta: { type: 'string', description: 'Palavras-chave da dúvida, em português' } },
      required: ['consulta'],
    },
  },
  {
    type: 'function',
    name: 'pesquisar_web',
    description: 'Pesquisa na internet fatos de fora do sistema (mercado, seguro rural, notícias). Com url, lê a página.',
    parameters: {
      type: 'object',
      properties: {
        consulta: { type: 'string', description: 'Termos da pesquisa' },
        url: { type: 'string', description: 'Opcional: URL http(s) para ler direto' },
      },
      required: ['consulta'],
    },
  },
  {
    type: 'function',
    name: 'tocar_video',
    description: 'Toca no monitor um vídeo pré-gravado do stand. Só use ids da lista de vídeos disponíveis. Fale o resumo antes.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Id do vídeo, por exemplo pipeline-completo' } },
      required: ['id'],
    },
  },
  ...ferramentasAcaoSite('realtime'),
]);

const NOMES = new Set(FERRAMENTAS_STAND.map((f) => f.name));
const ACOES = new Set(ferramentasAcaoSite('realtime').map((f) => f.name));

function erro(ferramenta, codigo) {
  return { ok: false, ferramenta, erro: codigo };
}

/** O vídeo existe no manifesto da M7 e o mp4 já está publicado? */
export function videoPublicado(id, { lerManifesto = () => carregarManifesto(), raiz = RAIZ_REPO } = {}) {
  try {
    const video = lerManifesto().find((item) => item.id === id);
    return Boolean(video && videoTemArquivo(video.arquivo, raiz));
  } catch {
    return false;
  }
}

/**
 * Executa uma ferramenta pedida pela IA. Nunca lança: erro vira `{ok:false}`
 * para a IA explicar em voz alta. `deps` existe para os testes.
 */
export async function executarFerramentaStand(nome, args = {}, deps = {}) {
  const {
    executarAgente = executeAgentTool,
    lerManifesto = () => carregarManifesto(),
    raiz = RAIZ_REPO,
    buscar = buscarNoRepo,
  } = deps;
  const ferramenta = String(nome || '');
  if (!NOMES.has(ferramenta)) return erro(ferramenta, 'ferramenta_desconhecida');
  const entrada = args && typeof args === 'object' && !Array.isArray(args) ? args : {};

  if (ferramenta === 'buscar_no_repo') {
    const consulta = String(entrada.consulta || '').trim().slice(0, 300);
    if (!consulta) return erro(ferramenta, 'consulta_vazia');
    return { ok: true, ferramenta, resultados: buscar(consulta) };
  }

  if (ferramenta === 'pesquisar_web') {
    const consulta = String(entrada.consulta || '').trim().slice(0, 300);
    if (entrada.url) {
      const pagina = await executarAgente('fetch_url', { url: String(entrada.url), max_chars: 3000 });
      if (!pagina.ok) return erro(ferramenta, pagina.error || 'pagina_indisponivel');
      return { ok: true, ferramenta, url: pagina.url, titulo: pagina.title, texto: pagina.text };
    }
    if (!consulta) return erro(ferramenta, 'consulta_vazia');
    const busca = await executarAgente('web_search', { query: consulta, max_results: 4 });
    if (!busca.ok) return erro(ferramenta, busca.error || 'busca_indisponivel');
    return {
      ok: true,
      ferramenta,
      resultados: busca.results.map((r) => ({ titulo: r.title, url: r.url, trecho: r.snippet })),
    };
  }

  if (ferramenta === 'tocar_video') {
    const id = String(entrada.id || '').trim();
    let manifesto;
    try {
      manifesto = lerManifesto();
    } catch {
      return erro(ferramenta, 'video_indisponivel');
    }
    const video = manifesto.find((item) => item.id === id);
    if (!video) return erro(ferramenta, 'video_desconhecido');
    if (!videoTemArquivo(video.arquivo, raiz)) return erro(ferramenta, 'video_sem_arquivo');
    return { ok: true, ferramenta, id, titulo: video.titulo, evento: { tipo: 'tocar_video', id } };
  }

  // Ação do site (M3): valida aqui e a página/executor valida de novo.
  // O tour roda no cérebro em turnos (falas prontas); o Realtime não tem.
  if (ferramenta === 'tour_iniciar') return { ...erro(ferramenta, 'tour_indisponivel'), mensagem: 'O tour guiado só roda na voz em turnos; mostre as páginas uma a uma.' };
  if (ACOES.has(ferramenta)) {
    const validacao = validarAcaoSite(ferramenta, entrada);
    if (!validacao.ok) return { ...erro(ferramenta, 'acao_invalida'), mensagem: validacao.motivo };
    return { ok: true, ferramenta, evento: { tipo: 'acao_site', acao: validacao.acao, args: validacao.args } };
  }
  return erro(ferramenta, 'ferramenta_desconhecida');
}
