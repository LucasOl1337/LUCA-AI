/**
 * Veredicto final (pedido do Lucas, 24/10): provável culpado, como prevenir e impacto financeiro.
 * É ESTIMATIVA com confiança, nunca acusação. O modelo escolhe itens da tabela versionada abaixo;
 * os valores em R$ saem só daqui, com a base declarada. Contrato: veredicto/CONTRATO.md do relatório.
 */
export const VEREDICTO_VERSAO = 1;
export const TABELA_PREMISSAS = 'premissas-v1';
export const VALOR_TRATOR_BRL = 400_000; // já no app: src/lib/sompo-stories.ts ("Um trator tombado vale R$ 400 mil")

export const CULPADOS = Object.freeze({
  operador: 'Operador humano', maquina: 'Máquina', manutencao: 'Manutenção',
  ambiente: 'Ambiente', terceiro: 'Terceiro', indeterminado: 'Indeterminado',
});

const ILUSTRATIVA = 'estimativa ilustrativa';
const pctTrator = (min, max) => ({ min: Math.round(VALOR_TRATOR_BRL * min), max: Math.round(VALOR_TRATOR_BRL * max), base: `${min * 100}%–${max * 100}% do valor de referência do trator (R$ 400 mil, referência do app)` });

/** Tabela versionada de premissas. `porUnidade` multiplica pela quantidade (1..maxQtd). */
export const PREMISSAS_IMPACTO = Object.freeze({
  sem_dano: { item: 'Sem dano material registrado', min: 0, max: 0, base: 'nenhum contato ou perda registrado' },
  reparo_frontal_leve: { item: 'Reparo frontal leve do trator', ...pctTrator(0.02, 0.08) },
  reparo_frontal_grave: { item: 'Reparo frontal/estrutural grave do trator', ...pctTrator(0.1, 0.25) },
  tombamento_perda_parcial: { item: 'Tombamento com perda parcial do trator', ...pctTrator(0.25, 0.6) },
  perda_total_trator: { item: 'Perda total do trator', ...pctTrator(0.75, 1) },
  atolamento_resgate: { item: 'Resgate de atolamento (guincho/trator auxiliar)', min: 1_500, max: 6_000, base: ILUSTRATIVA },
  parada_maquina_dia: { item: 'Máquina parada (por dia)', min: 1_000, max: 3_000, base: `${ILUSTRATIVA}, por dia`, porUnidade: true, maxQtd: 30 },
  fardo_perdido: { item: 'Fardo de feno perdido (por unidade)', min: 150, max: 400, base: `${ILUSTRATIVA}, por fardo`, porUnidade: true, maxQtd: 50 },
  caminhao_reparo_freio: { item: 'Reparo do sistema de freio do caminhão', min: 3_000, max: 12_000, base: ILUSTRATIVA },
  caminhao_colisao_reparo: { item: 'Reparo de colisão do caminhão', min: 15_000, max: 80_000, base: ILUSTRATIVA },
  danos_terceiros_materiais: { item: 'Danos materiais a terceiros', min: 5_000, max: 50_000, base: ILUSTRATIVA },
});

const PREMISSAS_FIXAS = [
  `Valores da tabela ${TABELA_PREMISSAS}; trator de referência R$ 400 mil (referência do app). Demais itens são estimativas ilustrativas.`,
  'Danos pessoais não são estimados.',
];

const limpa = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const lista = (v, max, n) => (Array.isArray(v) ? v.map((x) => limpa(x, max)).filter(Boolean).slice(0, n) : []);

/** Veredicto sem conclusão (modelo falhou ou não houve eixo concluído). */
export function veredictoIndeterminado(motivo, { modelo = '', sintetico = false } = {}) {
  return {
    versao: VEREDICTO_VERSAO, status: 'indeterminado_por_falha', culpado: 'indeterminado', culpadoRotulo: CULPADOS.indeterminado,
    confianca: 0, porque: limpa(motivo, 600) || 'Os agentes não concluíram o veredicto.', hipotese: '',
    evidencias: [], fatores_contribuintes: [], prevencao: [],
    impacto_financeiro: { faixa_min_brl: null, faixa_max_brl: null, componentes: [], premissas: sintetico ? ['Corrida simulada: valores ilustrativos, não sinistro real.'] : [], rotulo: 'estimativa', tabela: TABELA_PREMISSAS },
    aviso: 'Estimativa com confiança, não acusação nem laudo pericial.', geradoEm: new Date().toISOString(), modelo,
  };
}

/** Calcula a faixa só pela tabela. Itens desconhecidos são descartados. */
export function calcularImpacto(itens, { premissas = [], sintetico = false } = {}) {
  const componentes = [];
  for (const it of Array.isArray(itens) ? itens.slice(0, 8) : []) {
    const p = PREMISSAS_IMPACTO[it?.chave];
    if (!p || componentes.some((c) => c.chave === it.chave)) continue;
    const qtd = p.porUnidade ? Math.min(p.maxQtd, Math.max(1, Math.round(Number(it.quantidade) || 1))) : 1;
    const min = p.min * qtd; const max = p.max * qtd;
    componentes.push({ chave: it.chave, item: qtd > 1 ? `${p.item} × ${qtd}` : p.item, valor_min_brl: min, valor_max_brl: max, valor_brl: Math.round((min + max) / 2), base: p.base });
  }
  return {
    faixa_min_brl: componentes.length ? componentes.reduce((s, c) => s + c.valor_min_brl, 0) : null,
    faixa_max_brl: componentes.length ? componentes.reduce((s, c) => s + c.valor_max_brl, 0) : null,
    componentes,
    premissas: [...(sintetico ? ['Corrida simulada: valores ilustrativos, não sinistro real.'] : []), ...PREMISSAS_FIXAS, ...lista(premissas, 300, 4)],
    rotulo: 'estimativa', tabela: TABELA_PREMISSAS,
  };
}

/** Texto do contrato pedido ao modelo (mesmo para Laboratório e SOMPO). */
export function instrucoesVeredicto({ evidenciaPorAmostra = true } = {}) {
  const chaves = Object.entries(PREMISSAS_IMPACTO).map(([k, p]) => `${k} (${p.item}${p.porUnidade ? ', aceita quantidade' : ''})`).join('; ');
  const ev = evidenciaPorAmostra
    ? '{"descricao":"...","sampleIndex":0}'
    : '{"descricao":"...","elapsedMs":0,"frame":1}';
  return `Dê o VEREDICTO FINAL como ESTIMATIVA com confiança, nunca como acusação, culpa jurídica, negligência ou laudo pericial.
culpado: o fator mais provável entre operador (decisão/reação do condutor), maquina (falha do equipamento em si), manutencao (falta/erro de manutenção), ambiente (terreno, clima, obstáculo natural), terceiro (outra pessoa/veículo) ou indeterminado. Sem evidência suficiente use indeterminado; inconclusivo é válido.
confianca: número de 0 a 1 (0.3 = fraca, 0.6 = moderada, 0.85 = forte). Nunca acima de 0.9 com dados simulados.
porque: 1–3 frases em linguagem de leigo. hipotese: o que provavelmente aconteceu, 3–5 linhas, para um laudo de uma página.
evidencias: até 5, cada uma presa a um instante registrado: ${ev}. fatores_contribuintes: até 6 frases curtas.
prevencao: 1–5 ações concretas para a próxima vez, com responsavel (ex.: operador, gestor da frota, oficina) e prazo opcional.
impacto: NÃO escreva valores em reais. Escolha itens desta tabela (chave e, quando aceitar, quantidade): ${chaves}. Use sem_dano se nada foi danificado. premissas: até 4 frases do que você assumiu.
Retorne apenas JSON: {"culpado":"...","confianca":0.5,"porque":"...","hipotese":"...","evidencias":[${ev}],"fatores_contribuintes":["..."],"prevencao":[{"acao":"...","responsavel":"...","prazo":"..."}],"impacto":{"itens":[{"chave":"sem_dano","quantidade":1}],"premissas":["..."]}}`;
}

/**
 * Valida a resposta do modelo. `resolverAmostra(i)` devolve {elapsedMs} ou null (Laboratório);
 * sem ele, aceita elapsedMs (0..duracaoMs) e frame (inteiro em `frames`).
 */
export function lerVeredicto(obj, { resolverAmostra = null, duracaoMs = Infinity, frames = null, modelo = '', sintetico = false, exigeInstante = true } = {}) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('invalid_verdict');
  let culpado = Object.hasOwn(CULPADOS, obj.culpado) ? obj.culpado : null;
  if (!culpado) throw new Error('invalid_verdict_culpado');
  const conf = Number(obj.confianca);
  if (!Number.isFinite(conf)) throw new Error('invalid_verdict_confianca');
  const porque = limpa(obj.porque, 600);
  if (!porque) throw new Error('invalid_verdict_porque');
  const evidencias = [];
  for (const e of Array.isArray(obj.evidencias) ? obj.evidencias.slice(0, 5) : []) {
    const descricao = limpa(e?.descricao, 400);
    if (!descricao) continue;
    const item = { descricao };
    if (resolverAmostra) {
      const s = Number.isInteger(e.sampleIndex) ? resolverAmostra(e.sampleIndex) : null;
      if (!s) continue; // instante inventado não vira evidência
      item.elapsedMs = s.elapsedMs;
    } else {
      if (Number.isFinite(e.elapsedMs) && e.elapsedMs >= 0 && e.elapsedMs <= duracaoMs) item.elapsedMs = Math.round(e.elapsedMs);
      if (Number.isInteger(e.frame) && (!frames || frames.has(e.frame))) item.frame = e.frame;
    }
    evidencias.push(item);
  }
  let confianca = Math.min(sintetico ? 0.9 : 0.95, Math.max(0, conf));
  // Sem evidência (temporal, quando há série) válida não há culpado estimado.
  const sustentado = exigeInstante ? evidencias.some((e) => e.elapsedMs != null || e.frame != null) : evidencias.length > 0;
  if (culpado !== 'indeterminado' && !sustentado) { culpado = 'indeterminado'; confianca = Math.min(confianca, 0.3); }
  const prevencao = (Array.isArray(obj.prevencao) ? obj.prevencao : []).slice(0, 5).map((p) => ({
    acao: limpa(p?.acao, 300), responsavel: limpa(p?.responsavel, 80) || 'gestor da operação', ...(limpa(p?.prazo, 80) ? { prazo: limpa(p.prazo, 80) } : {}),
  })).filter((p) => p.acao);
  return {
    versao: VEREDICTO_VERSAO, status: 'concluido', culpado, culpadoRotulo: CULPADOS[culpado], confianca: Math.round(confianca * 100) / 100,
    porque, hipotese: limpa(obj.hipotese, 900), evidencias,
    fatores_contribuintes: lista(obj.fatores_contribuintes, 300, 6), prevencao,
    impacto_financeiro: calcularImpacto(obj.impacto?.itens, { premissas: obj.impacto?.premissas, sintetico }),
    aviso: 'Estimativa com confiança, não acusação nem laudo pericial.', geradoEm: new Date().toISOString(), modelo,
  };
}

/** Resumo curto para tabelas (Fila): culpado, confiança e faixa. */
export function resumoVeredicto(v) {
  if (!v) return null;
  const f = v.impacto_financeiro || {};
  return { culpado: v.culpado, rotulo: v.culpadoRotulo, confianca: v.confianca, faixaMinBrl: f.faixa_min_brl ?? null, faixaMaxBrl: f.faixa_max_brl ?? null };
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
/** "R$ 8.000 – R$ 32.000" ou "sem estimativa". */
export function textoFaixa(f) {
  if (!f || f.faixa_min_brl == null) return 'sem estimativa';
  if (f.faixa_max_brl === 0) return 'sem dano material estimado';
  return f.faixa_min_brl === f.faixa_max_brl ? brl.format(f.faixa_min_brl) : `${brl.format(f.faixa_min_brl)} – ${brl.format(f.faixa_max_brl)}`;
}
