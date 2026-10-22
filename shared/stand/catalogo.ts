/**
 * Catálogo do Totem (dono: Frente A, contrato em CONTRATO-CATALOGO.md).
 *
 * Menu fixo de dois níveis: grupo (o mesmo id de `COMANDOS_VOZ`) → itens. Cada
 * item aponta para o que já existe: uma Ação do site (`ACOES_SITE`, com args
 * válidos), um vídeo do manifesto, uma pergunta pronta ao assistente ou o tour.
 * Toque, texto e voz levam à mesma ação; o menu não inventa função.
 *
 * Só sintaxe apagável (tipos + funções puras): o Node importa direto, sem build.
 */
import { ACOES_SITE, IDS_PAGINAS, validarAcaoSite, type NomeAcaoSite, type PaginaSite } from './acoes-site.ts';
import { COMANDOS_VOZ } from './comandos-voz.ts';
import { SOMPO_EXAMPLE_CASES } from '../../src/lib/sompo-cases.ts';
import { STAND_SCENARIOS } from '../../src/components/sompo/standScenarios.ts';
import manifesto from './videos.json' with { type: 'json' };

export type AlvoItem =
  | { tipo: 'acao'; acao: NomeAcaoSite; args: Record<string, string> }
  | { tipo: 'video'; id: string }
  | { tipo: 'pergunta'; texto: string }
  | { tipo: 'tour' };

export type Requisito = 'voz' | 'webcam';

export interface ItemCatalogo {
  id: string;
  rotulo: string;
  detalhe?: string;
  alvo: AlvoItem;
  requer?: readonly Requisito[];
}

export interface GrupoCatalogo {
  id: string;
  titulo: string;
  faz: string;
  itens: readonly ItemCatalogo[];
}

const acao = (id: string, rotulo: string, nome: NomeAcaoSite, args: Record<string, string> = {}, extra: Partial<ItemCatalogo> = {}): ItemCatalogo =>
  ({ id, rotulo, alvo: { tipo: 'acao', acao: nome, args }, ...extra });

const ROTULO_PAGINA: Record<PaginaSite, string> = {
  inicio: 'Apresentação do LUCA-AI',
  luca_ai: 'Bancada de agentes (só olhar)',
  sompo: 'Painel SOMPO',
  laboratorio: 'Laboratório 3D da fazenda',
  sensor: 'Laboratório do sensor',
  sonolencia: 'Monitor de sonolência',
  gameplay: 'Gameplay (página)',
  operador: 'Painel do operador',
};

const ENSAIOS: Record<string, string> = { encosta: 'Encosta', curva: 'Curva', frenada: 'Frenada', buraco: 'Buraco' };
const VISTAS: Record<string, string> = { bancada: 'Bancada inteira', veiculo: 'Veículo', chip: 'Chip do sensor', massa: 'Massa de prova', dedos: 'Dedos capacitivos' };
const NIVEIS: Record<string, string> = { minimo: 'mínimo', padrao: 'padrão', maximo: 'máximo' };
const ABAS: Record<string, string> = { telemetria: 'Telemetria', casos: 'Casos agrícolas', safra: 'Safra', veiculos: 'Veículos' };
const CAMERAS: Record<string, string> = { acompanhar: 'Acompanhar a máquina', superior: 'Vista de cima', livre: 'Câmera livre' };
const videos = manifesto as Array<{ id: string; titulo: string }>;

/** Perguntas prontas: o mesmo turno de texto que a voz faria (vai pela sessão do assistente). */
export const PERGUNTAS_PRONTAS: readonly string[] = Object.freeze([
  'O que é o LUCA-AI?',
  'O que a seguradora ganha com isso?',
  'Como o sensor mede o risco de tombar?',
  'Como funciona o alerta de sonolência?',
]);

export const CATALOGO: readonly GrupoCatalogo[] = Object.freeze(([
  {
    id: 'simulacao', titulo: 'Dirigir o trator', faz: 'Simulação: você dirige o Trator MAX',
    itens: [
      acao('simulacao', 'Abrir a Simulação no totem', 'abrir_simulacao', {}, { detalhe: 'Percurso guiado (fardo, encosta, área alagada) ou condução livre; pegue o controle' }),
      acao('gameplay', 'Página do Gameplay', 'abrir_pagina', { pagina: 'gameplay' }, { detalhe: 'Instruções e cabine jogável' }),
      acao('operador', 'Painel do operador', 'abrir_pagina', { pagina: 'operador' }, { detalhe: 'O gameplay ao vivo, como no tablet' }),
    ],
  },
  {
    id: 'tour', titulo: 'Ver tudo', faz: 'Tour guiado de 1 minuto',
    itens: [{ id: 'tour', rotulo: 'Começar o tour', detalhe: 'Sonolência, sensor na curva e volta', alvo: { tipo: 'tour' } }],
  },
  {
    id: 'sonolencia', titulo: 'Teste de sono', faz: 'Webcam vê olho fechado e o alerta toca',
    itens: [
      acao('sono-abrir', 'Abrir o monitor', 'abrir_pagina', { pagina: 'sonolencia' }),
      acao('sono-camera', 'Ligar a webcam', 'sonolencia_ligar_camera', {}, { requer: ['webcam'], detalhe: 'Feche os olhos 1 s e o alerta toca' }),
      acao('sono-desligar', 'Desligar a webcam', 'sonolencia_desligar_camera'),
      acao('sono-som', 'Ouvir o alerta', 'sonolencia_testar_som'),
      ...['baixa', 'normal', 'alta'].map((n) => acao(`sono-sens-${n}`, `Sensibilidade ${n}`, 'sonolencia_sensibilidade', { nivel: n })),
    ],
  },
  {
    id: 'sensor', titulo: 'Sensor em ação', faz: 'Trator em curva, encosta, frenada, buraco',
    itens: [
      acao('sensor-trator', 'Trator MAX na bancada', 'sensor_escolher_veiculo', { veiculo: 'trator' }),
      acao('sensor-caminhao', 'Caminhão na bancada', 'sensor_escolher_veiculo', { veiculo: 'caminhao' }),
      ...Object.entries(ENSAIOS).map(([id, nome]) => acao(`sensor-ensaio-${id}`, `Ensaio: ${nome}`, 'sensor_rodar_ensaio', { ensaio: id })),
      ...Object.entries(NIVEIS).map(([id, nome]) => acao(`sensor-ajuste-${id}`, `Parâmetro no ${nome}`, 'sensor_ajustar', { nivel: id })),
      acao('sensor-pausar', 'Pausar o ensaio', 'sensor_pausar'),
      acao('sensor-continuar', 'Continuar o ensaio', 'sensor_continuar'),
      ...Object.entries(VISTAS).map(([id, nome]) => acao(`sensor-vista-${id}`, `Vista: ${nome}`, 'sensor_mostrar_vista', { vista: id })),
    ],
  },
  {
    id: 'fazenda', titulo: 'Fazenda em 3D', faz: 'Caminhão rodando numa fazenda em 3D',
    itens: [
      acao('fazenda-abrir', 'Abrir o laboratório 3D', 'abrir_pagina', { pagina: 'laboratorio' }),
      acao('fazenda-demo', 'Ver a demonstração', 'laboratorio_ver_demonstracao'),
      acao('fazenda-pausar', 'Pausar o replay', 'laboratorio_pausar'),
      acao('fazenda-continuar', 'Continuar o replay', 'laboratorio_continuar'),
      ...Object.entries(CAMERAS).map(([id, nome]) => acao(`fazenda-camera-${id}`, nome, 'laboratorio_camera', { modo: id })),
    ],
  },
  {
    id: 'sompo', titulo: 'Painel da Sompo', faz: 'O que a seguradora vê: casos e riscos',
    itens: [
      ...Object.entries(ABAS).map(([id, nome]) => acao(`sompo-aba-${id}`, `Aba ${nome}`, 'sompo_abrir_aba', { aba: id })),
      ...STAND_SCENARIOS.map((c) => acao(`sompo-cenario-${c.id}`, `Cenário: ${c.rotulo}`, 'sompo_rodar_cenario', { id: c.id }, { detalhe: 'Dados simulados' })),
      ...SOMPO_EXAMPLE_CASES.map((c) => acao(`sompo-caso-${c.id}`, `Caso: ${c.title}`, 'sompo_abrir_caso', { id: c.id }, { detalhe: 'Exemplo didático' })),
      acao('sompo-inicio', 'Voltar ao início do SOMPO', 'sompo_voltar_inicio'),
    ],
  },
  {
    id: 'site', titulo: 'Abrir o site', faz: 'Abre uma página do LUCA-AI na tela',
    itens: IDS_PAGINAS.map((p) => acao(`site-${p}`, ROTULO_PAGINA[p], 'abrir_pagina', { pagina: p })),
  },
  {
    id: 'video', titulo: 'Ver um vídeo', faz: 'Toca o vídeo que explica o assunto',
    itens: videos.map((v) => ({ id: `video-${v.id}`, rotulo: v.titulo, alvo: { tipo: 'video', id: v.id } })),
  },
  {
    id: 'perguntar', titulo: 'Tirar dúvidas', faz: 'Responde sobre o projeto e pesquisa na web',
    itens: PERGUNTAS_PRONTAS.map((texto, i) => ({ id: `pergunta-${i + 1}`, rotulo: texto, alvo: { tipo: 'pergunta', texto }, requer: ['voz'] })),
  },
  {
    id: 'voltar', titulo: 'Voltar', faz: 'Fecha a página e volta pra coruja',
    itens: [acao('voltar', 'Voltar pra coruja', 'voltar_coruja')],
  },
] as GrupoCatalogo[]).map((g) => Object.freeze({ ...g, itens: Object.freeze(g.itens.map((i) => Object.freeze(i))) })));

/** Ações que ficam fora do menu, com motivo (o teste exige motivo para cada uma). */
export const FORA_DO_MENU: Readonly<Record<string, string>> = Object.freeze({
  tour_iniciar: 'o menu roda o roteiro TOUR_STAND direto (item tour), com ou sem voz',
});

export function grupoDoCatalogo(id: string): GrupoCatalogo | undefined {
  return CATALOGO.find((g) => g.id === id);
}

export function itemDoCatalogo(id: string): ItemCatalogo | undefined {
  for (const g of CATALOGO) {
    const item = g.itens.find((i) => i.id === id);
    if (item) return item;
  }
  return undefined;
}

/** Confere o catálogo contra as ações reais; devolve os problemas (vazio = ok). */
export function conferirCatalogo(catalogo: readonly GrupoCatalogo[] = CATALOGO): string[] {
  const problemas: string[] = [];
  const ids = new Set<string>();
  const usadas = new Set<string>();
  const grupos = new Set(COMANDOS_VOZ.map((c) => c.id));
  for (const g of catalogo) {
    if (!grupos.has(g.id)) problemas.push(`grupo ${g.id} não existe em COMANDOS_VOZ`);
    if (!g.itens.length) problemas.push(`grupo ${g.id} vazio`);
    for (const item of g.itens) {
      if (ids.has(item.id)) problemas.push(`item repetido ${item.id}`);
      ids.add(item.id);
      if (item.alvo.tipo === 'acao') {
        const v = validarAcaoSite(item.alvo.acao, item.alvo.args);
        if (!v.ok) problemas.push(`${item.id}: ${v.motivo}`);
        usadas.add(item.alvo.acao);
      }
      if (item.alvo.tipo === 'video' && !videos.some((v) => v.id === (item.alvo as { id: string }).id)) problemas.push(`${item.id}: vídeo inexistente`);
    }
  }
  for (const def of ACOES_SITE) {
    if (!usadas.has(def.nome) && !FORA_DO_MENU[def.nome]) problemas.push(`ação ${def.nome} fora do menu sem motivo`);
  }
  return problemas;
}
