/**
 * Ações do site (dono: M3). Lista fechada do que a IA do stand pode pedir para
 * o Executor do stand fazer no app, como uma pessoa clicando.
 *
 * Fluxo: o cérebro (M1) chama a ferramenta → emite `acao_site` → a página do
 * stand repassa no BroadcastChannel `CANAL_STAND` → o executor, aberto noutra
 * janela do app com `?stand=1`, valida de novo, clica e devolve o resultado.
 *
 * Só sintaxe apagável (tipos + funções puras): o Node importa direto, sem build.
 */
import { SOMPO_EXAMPLE_CASES } from '../../src/lib/sompo-cases.ts';
import { STAND_SCENARIOS } from '../../src/components/sompo/standScenarios.ts';

export const CANAL_STAND = 'luca-stand';

/** Veículo do cadastro (seed) que roda os Cenários do stand: o veículo vence o cenário. */
export const VEICULO_STAND = 'trator-0001';

export const ABAS_SITE = ['telemetria', 'casos', 'safra', 'veiculos'] as const;
export type AbaSite = (typeof ABAS_SITE)[number];

export type NomeAcaoSite =
  | 'abrir_aba'
  | 'voltar_inicio'
  | 'abrir_caso'
  | 'rodar_cenario'
  | 'gravar_episodio'
  | 'analisar_na_bancada';

export interface ArgAcaoSite {
  descricao: string;
  valores: readonly string[];
}

export interface AcaoSiteDef {
  nome: NomeAcaoSite;
  descricao: string;
  args: Readonly<Record<string, ArgAcaoSite>>;
}

const listar = (pares: readonly (readonly [string, string])[]) => pares.map(([id, nome]) => `${id} = ${nome}`).join('; ');

export const ACOES_SITE: readonly AcaoSiteDef[] = Object.freeze([
  {
    nome: 'abrir_aba',
    descricao: 'Abre uma área do painel SOMPO na tela, clicando como uma pessoa.',
    args: {
      aba: {
        descricao: 'telemetria = sinais do trator e simulador 3D; casos = casos agrícolas de exemplo; safra = desempenho da frota; veiculos = cadastro das máquinas.',
        valores: ABAS_SITE,
      },
    },
  },
  {
    nome: 'voltar_inicio',
    descricao: 'Volta para a tela de boas-vindas do painel SOMPO.',
    args: {},
  },
  {
    nome: 'abrir_caso',
    descricao: 'Abre um dos casos agrícolas de exemplo (dados didáticos, não são sinistros reais).',
    args: {
      id: {
        descricao: listar(SOMPO_EXAMPLE_CASES.map((item) => [item.id, item.title] as const)),
        valores: SOMPO_EXAMPLE_CASES.map((item) => item.id),
      },
    },
  },
  {
    nome: 'rodar_cenario',
    descricao: 'Coloca o trator no simulador 3D e roda um cenário de risco do stand (dados simulados).',
    args: {
      id: {
        descricao: listar(STAND_SCENARIOS.map((item) => [item.id, item.rotulo] as const)),
        valores: STAND_SCENARIOS.map((item) => item.id),
      },
    },
  },
  {
    nome: 'gravar_episodio',
    descricao: 'Grava o cenário que está na tela como episódio de telemetria (leva uns 20 segundos).',
    args: {},
  },
  {
    nome: 'analisar_na_bancada',
    descricao: 'Envia a telemetria da tela para a bancada de agentes analisar. Sai do painel e abre a bancada.',
    args: {},
  },
].map((item) => Object.freeze(item as AcaoSiteDef)));

export type ValidacaoAcaoSite =
  | { ok: true; acao: NomeAcaoSite; args: Record<string, string> }
  | { ok: false; motivo: string };

const NOMES = () => ACOES_SITE.map((item) => item.nome).join(', ');

export function validarAcaoSite(acao: unknown, args: unknown = {}): ValidacaoAcaoSite {
  const def = ACOES_SITE.find((item) => item.nome === acao);
  if (!def) return { ok: false, motivo: `Não posso fazer "${String(acao)}" no site. Consigo: ${NOMES()}.` };
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    return { ok: false, motivo: `Os argumentos de ${def.nome} precisam ser um objeto.` };
  }
  const recebidos = args as Record<string, unknown>;
  const extra = Object.keys(recebidos).find((chave) => !(chave in def.args));
  if (extra) return { ok: false, motivo: `${def.nome} não aceita "${extra}".` };
  const limpos: Record<string, string> = {};
  for (const [chave, arg] of Object.entries(def.args)) {
    const valor = recebidos[chave];
    if (valor === undefined || valor === '') return { ok: false, motivo: `${def.nome} precisa de "${chave}". Opções: ${arg.valores.join(', ')}.` };
    if (typeof valor !== 'string' || !arg.valores.includes(valor)) {
      return { ok: false, motivo: `Não existe ${chave} "${String(valor)}" para ${def.nome}. Opções: ${arg.valores.join(', ')}.` };
    }
    limpos[chave] = valor;
  }
  return { ok: true, acao: def.nome, args: limpos };
}

/** Uma ferramenta por ação, com enum. `realtime` = OpenAI Realtime/Responses; `chat` = /v1/chat/completions. */
export function ferramentasAcaoSite(formato: 'realtime' | 'chat' = 'realtime') {
  return ACOES_SITE.map((def) => {
    const parameters = {
      type: 'object',
      properties: Object.fromEntries(Object.entries(def.args).map(([chave, arg]) => [
        chave, { type: 'string', description: arg.descricao, enum: [...arg.valores] },
      ])),
      required: Object.keys(def.args),
      additionalProperties: false,
    };
    return formato === 'chat'
      ? { type: 'function' as const, function: { name: def.nome, description: def.descricao, parameters } }
      : { type: 'function' as const, name: def.nome, description: def.descricao, parameters };
  });
}

/** Página do stand → executor. `id` correlaciona com o resultado. */
export interface AcaoSiteEvento { tipo: 'acao_site'; id: string; acao: string; args: Record<string, unknown> }
/** Executor → página do stand. `mensagem` é em PT-BR, pronta pra IA falar. */
export interface AcaoSiteResultado { tipo: 'acao_site_resultado'; id: string; ok: boolean; mensagem: string }
