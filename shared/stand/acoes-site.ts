/**
 * Ações do site (dono: M3). Lista fechada do que a IA do stand pode pedir para
 * o Executor do stand fazer no app, como uma pessoa clicando.
 *
 * Fluxo: o cérebro (M1) chama a ferramenta → emite `acao_site` → o `/stand`
 * executa `abrir_pagina`/`voltar_coruja` (iframe da página, mapa fechado) e
 * repassa os controles `<pagina>_<verbo>` no BroadcastChannel `CANAL_STAND` →
 * o Executor, dentro do iframe (`?stand=1`), valida de novo, clica e devolve.
 * Nada aqui grava: episódio, bancada de agentes e exemplos do Laboratório
 * ficam fora do totem (grill Totem-Site r1, Q8).
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

/**
 * Páginas que o totem pode mostrar (grill Totem-Site r1, Q4/Q7). O `/stand`
 * abre o caminho deste mapa num iframe; o modelo nunca manda URL.
 */
export const PAGINAS_SITE = Object.freeze({
  inicio: '/',
  luca_ai: '/luca-ai',
  sompo: '/sompo',
  laboratorio: '/laboratorio',
  sensor: '/sensor',
  sonolencia: '/sonolencia',
} as const);
export type PaginaSite = keyof typeof PAGINAS_SITE;
export const IDS_PAGINAS = Object.keys(PAGINAS_SITE) as PaginaSite[];

export type NomeAcaoSite =
  | 'abrir_pagina'
  | 'voltar_coruja'
  | 'abrir_simulacao'
  | 'sensor_escolher_veiculo'
  | 'sensor_rodar_ensaio'
  | 'sensor_ajustar'
  | 'sensor_pausar'
  | 'sensor_continuar'
  | 'sensor_mostrar_vista'
  | 'sonolencia_ligar_camera'
  | 'sonolencia_desligar_camera'
  | 'sonolencia_testar_som'
  | 'sonolencia_sensibilidade'
  | 'laboratorio_ver_demonstracao'
  | 'laboratorio_pausar'
  | 'laboratorio_continuar'
  | 'laboratorio_camera'
  | 'sompo_abrir_aba'
  | 'sompo_voltar_inicio'
  | 'sompo_abrir_caso'
  | 'sompo_rodar_cenario'
  | 'tour_iniciar';

export interface ArgAcaoSite {
  descricao: string;
  valores: readonly string[];
}

export interface AcaoSiteDef {
  nome: NomeAcaoSite;
  descricao: string;
  args: Readonly<Record<string, ArgAcaoSite>>;
  /** Página onde o controle vive; o `/stand` abre ela antes. `null` = a própria tela do stand. */
  pagina: PaginaSite | null;
}

const listar = (pares: readonly (readonly [string, string])[]) => pares.map(([id, nome]) => `${id} = ${nome}`).join('; ');
const SO_LEITURA = 'Só mostra; nada é gravado.';

export const ACOES_SITE: readonly AcaoSiteDef[] = Object.freeze(([
  {
    nome: 'abrir_pagina',
    pagina: null,
    descricao: 'Abre uma página do site no monitor do stand; a coruja fica pequena no canto e continua conversando. Diga em uma frase o que a página mostra.',
    args: {
      pagina: {
        descricao: 'inicio = apresentação do LUCA-AI; luca_ai = bancada de agentes (só olhar); sompo = painel SOMPO; laboratorio = laboratório 3D da fazenda; sensor = laboratório do sensor (caminhão e trator em ensaios); sonolencia = monitor de sonolência pela webcam.',
        valores: IDS_PAGINAS,
      },
    },
  },
  {
    nome: 'voltar_coruja',
    pagina: null,
    descricao: 'Fecha a página do site e volta a coruja para a tela cheia. Use quando a pessoa pedir pra voltar ou terminar a demonstração.',
    args: {},
  },
  {
    nome: 'abrir_simulacao',
    pagina: null,
    descricao: 'Abre a Simulação do stand: o simulador 3D do Trator MAX em tela cheia, para a pessoa dirigir no controle. Use sempre que ela quiser jogar, dirigir, pilotar ou testar o simulador, a simulação ou a gameplay. Diga antes, em uma frase curta, que vai abrir e que é só pegar o controle; a conversa por voz acaba quando a Simulação abre.',
    args: {},
  },
  {
    nome: 'sensor_escolher_veiculo',
    pagina: 'sensor',
    descricao: `No laboratório do sensor, troca o veículo da bancada 3D. ${SO_LEITURA}`,
    args: { veiculo: { descricao: 'caminhao = caminhão; trator = Trator MAX.', valores: ['caminhao', 'trator'] } },
  },
  {
    nome: 'sensor_rodar_ensaio',
    pagina: 'sensor',
    descricao: `No laboratório do sensor, escolhe um ensaio e roda desde o começo; as leituras de inclinação e aceleração mudam na tela. ${SO_LEITURA}`,
    args: { ensaio: { descricao: 'encosta = inclinação lateral; curva = curva (de talhão, no trator); frenada = frenada (parada diante de obstáculo, no trator); buraco = buraco ou solo irregular.', valores: ['encosta', 'curva', 'frenada', 'buraco'] } },
  },
  {
    nome: 'sensor_ajustar',
    pagina: 'sensor',
    descricao: `No laboratório do sensor, leva o parâmetro do ensaio atual (inclinação, velocidade, desaceleração ou profundidade) ao mínimo, ao padrão ou ao máximo. ${SO_LEITURA}`,
    args: { nivel: { descricao: 'minimo, padrao ou maximo do controle deslizante do ensaio.', valores: ['minimo', 'padrao', 'maximo'] } },
  },
  { nome: 'sensor_pausar', pagina: 'sensor', descricao: 'Pausa o ensaio do laboratório do sensor.', args: {} },
  { nome: 'sensor_continuar', pagina: 'sensor', descricao: 'Continua o ensaio pausado do laboratório do sensor.', args: {} },
  {
    nome: 'sensor_mostrar_vista',
    pagina: 'sensor',
    descricao: `No laboratório do sensor, muda a câmera 3D. chip, massa e dedos abrem "Por dentro do sensor" e mostram o acelerômetro MEMS por dentro. ${SO_LEITURA}`,
    args: { vista: { descricao: 'bancada = bancada inteira; veiculo = o veículo; chip = o chip do sensor; massa = a massa de prova; dedos = os dedos capacitivos.', valores: ['bancada', 'veiculo', 'chip', 'massa', 'dedos'] } },
  },
  {
    nome: 'sonolencia_ligar_camera',
    pagina: 'sonolencia',
    descricao: 'Liga a webcam do totem no monitor de sonolência: a pessoa fecha os olhos por 1 segundo e o alerta toca. A imagem é processada no próprio computador e não é gravada nem enviada. Se a câmera faltar, a ação devolve o erro: diga que a demonstração precisa da webcam e use sonolencia_testar_som.',
    args: {},
  },
  { nome: 'sonolencia_desligar_camera', pagina: 'sonolencia', descricao: 'Desliga a webcam do monitor de sonolência.', args: {} },
  { nome: 'sonolencia_testar_som', pagina: 'sonolencia', descricao: 'Toca o som de alerta do monitor de sonolência, para a pessoa ouvir como é (só com a câmera desligada).', args: {} },
  {
    nome: 'sonolencia_sensibilidade',
    pagina: 'sonolencia',
    descricao: 'Muda a sensibilidade do detector de olhos fechados (só com a câmera desligada). Alta conta o olho como fechado mesmo meio fechado; baixa só quando bem fechado. O tempo de 1 segundo não muda: não diga que o alerta fica mais rápido.',
    args: { nivel: { descricao: 'baixa, normal ou alta.', valores: ['baixa', 'normal', 'alta'] } },
  },
  {
    nome: 'laboratorio_ver_demonstracao',
    pagina: 'laboratorio',
    descricao: `No laboratório 3D, abre a demonstração do caminhão em movimento na fazenda (percurso sintético sobre área real). ${SO_LEITURA}`,
    args: {},
  },
  { nome: 'laboratorio_pausar', pagina: 'laboratorio', descricao: 'Pausa o replay do laboratório 3D.', args: {} },
  { nome: 'laboratorio_continuar', pagina: 'laboratorio', descricao: 'Continua o replay do laboratório 3D.', args: {} },
  {
    nome: 'laboratorio_camera',
    pagina: 'laboratorio',
    descricao: 'Muda a câmera do laboratório 3D (acompanhar só com a demonstração aberta).',
    args: { modo: { descricao: 'acompanhar = segue a máquina; superior = vista de cima; livre = câmera livre.', valores: ['acompanhar', 'superior', 'livre'] } },
  },
  {
    nome: 'sompo_abrir_aba',
    pagina: 'sompo',
    descricao: 'Abre uma área do painel SOMPO na tela, clicando como uma pessoa.',
    args: {
      aba: {
        descricao: 'telemetria = sinais do trator e simulador 3D; casos = casos agrícolas de exemplo; safra = desempenho da frota; veiculos = cadastro das máquinas.',
        valores: ABAS_SITE,
      },
    },
  },
  {
    nome: 'sompo_voltar_inicio',
    pagina: 'sompo',
    descricao: 'Volta para a tela de boas-vindas do painel SOMPO.',
    args: {},
  },
  {
    nome: 'sompo_abrir_caso',
    pagina: 'sompo',
    descricao: 'Abre um dos casos agrícolas de exemplo do painel SOMPO (dados didáticos, não são sinistros reais).',
    args: {
      id: {
        descricao: listar(SOMPO_EXAMPLE_CASES.map((item) => [item.id, item.title] as const)),
        valores: SOMPO_EXAMPLE_CASES.map((item) => item.id),
      },
    },
  },
  {
    nome: 'sompo_rodar_cenario',
    pagina: 'sompo',
    descricao: 'No painel SOMPO, coloca o trator no simulador 3D e roda um cenário de risco do stand (dados simulados).',
    args: {
      id: {
        descricao: listar(STAND_SCENARIOS.map((item) => [item.id, item.rotulo] as const)),
        valores: STAND_SCENARIOS.map((item) => item.id),
      },
    },
  },
  {
    nome: 'tour_iniciar',
    pagina: null,
    descricao: 'Tour guiado de menos de um minuto, com falas prontas: monitor de sonolência, laboratório do sensor com o Trator MAX na curva e volta pra coruja. Use quando a pessoa pedir pra ver tudo ("me mostra tudo", "o que tem aqui?") ou não souber o que perguntar. Não fale antes de chamar: o tour já se apresenta. A pessoa pode interromper falando.',
    args: {},
  },
] as AcaoSiteDef[]).map((item) => Object.freeze(item)));

/**
 * Ações que o próprio `/stand` executa (trocam a tela; `abrir_simulacao` vai pro
 * modo Simulação); o resto vai ao Executor
 * dentro do iframe. `tour_iniciar` roda no cérebro (falas prontas + ações do
 * `TOUR_STAND`); o `/stand` só recebe as ações do roteiro.
 */
export const ACOES_DO_STAND: readonly NomeAcaoSite[] = ['abrir_pagina', 'voltar_coruja', 'abrir_simulacao', 'tour_iniciar'];

export type PassoTour =
  | { fala: `tour_${number}`; texto: string }
  | { acao: Exclude<NomeAcaoSite, 'tour_iniciar'>; args: Record<string, string> };

/**
 * Roteiro fixo do tour (proposta Totem-Site item 2): coruja → sonolência →
 * sensor com o trator na curva → coruja. Cada ação entra quando a fala anterior
 * termina de soar; tudo só mostra (sem câmera ligada, gravação nem bancada).
 * ~600 caracteres de fala: menos de 60 s na voz do stand.
 */
export const TOUR_STAND: readonly PassoTour[] = Object.freeze(([
  { fala: 'tour_1', texto: 'Bora lá, vou te mostrar o LUCA em menos de um minuto. Primeiro, o monitor de sonolência.' },
  { acao: 'abrir_pagina', args: { pagina: 'sonolencia' } },
  { fala: 'tour_2', texto: 'Ele usa a webcam pra perceber quando o operador fecha os olhos por um segundo, e aí toca um alerta. Tudo roda aqui no computador, nada é gravado.' },
  { acao: 'sensor_escolher_veiculo', args: { veiculo: 'trator' } },
  { fala: 'tour_3', texto: 'Agora o laboratório do sensor, com o Trator MAX na bancada.' },
  { acao: 'sensor_rodar_ensaio', args: { ensaio: 'curva' } },
  { fala: 'tour_4', texto: 'Olha a curva de talhão: o sensor mede a inclinação e a força lateral que podem tombar a máquina, e é isso que alimenta o risco da operação.' },
  { acao: 'voltar_coruja', args: {} },
  { fala: 'tour_5', texto: 'Esse foi o tour. Pode me perguntar qualquer coisa sobre o que você viu.' },
] as PassoTour[]).map((passo) => Object.freeze(passo)));

export function paginaDaAcao(acao: string): PaginaSite | null {
  return ACOES_SITE.find((item) => item.nome === acao)?.pagina ?? null;
}

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
/**
 * Executor → página do stand. `mensagem` é em PT-BR, pronta pra IA falar.
 * `retrato`: o que a página mostra depois da ação (≤200 caracteres, uma linha).
 */
export interface AcaoSiteResultado { tipo: 'acao_site_resultado'; id: string; ok: boolean; mensagem: string; retrato?: string }
