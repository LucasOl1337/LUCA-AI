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

// ---- Texto para leigo (laudo PDF e WhatsApp): determinístico, não depende do modelo. ----
/** "9.616,67" | "9616,67" | "6066.67" | "6.066" → número. */
function numeroPt(t) {
  if (t.includes(',')) return Number(t.replace(/\./g, '').replace(',', '.'));
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''));
  return Number(t);
}
/** Segundos com 1 casa, sem ",0": 3033,33 ms → "3 s"; 766,67 ms → "0,8 s". */
export function segundos(ms) {
  const s = Math.round(ms / 100) / 10;
  return `${s.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`;
}
const NUM = String.raw`\d[\d.]*(?:,\d+)?`;
const JARGAO = [
  [/\b(d|n)?as amostras\b/gi, (_m, p) => `${p ? `${p}os` : 'os'} registros`], [/\b(d|n)?a amostra\b/gi, (_m, p) => `${p ? `${p}o` : 'o'} registro`],
  [/\buma amostra\b/gi, 'um registro'], [/\bamostras\b/gi, 'registros'], [/\bamostra\b/gi, 'registro'],
  [/\b(?:base|série) amostra(?:l|da)\b/gi, 'série registrada'], [/\bamostragem\b/gi, 'frequência de registro'], [/\bamostrad([ao]s?)\b/gi, 'registrad$1'],
  [/\b(?:pela|a|da) heurística\b/gi, (m) => `${m.split(' ')[0]} regra do simulador`], [/\bheurística\b/gi, 'regra do simulador'],
  [/\bbrake_pressed(?:\s*(?:=|:)?\s*)true\b/g, 'freio acionado'], [/\bbrake_pressed(?:\s*(?:=|:)?\s*)false\b/g, 'freio solto'], [/\bbrake_pressed\b/g, 'freio'],
  [/\bsonolencia\b/g, 'sonolência'], [/«([^»]{1,30})»/g, '$1'], [/\bcollision_warning_active\b/g, 'aviso de colisão'], [/\binclination_warning_active\b/g, 'aviso de inclinação'],
  [/\bobstacle_distance_cm\b/g, 'distância frontal'], [/\bground_speed_kmh\b/g, 'velocidade'], [/\b(?:elapsedMs|sampleIndex|tempoMs)\b/g, 'instante'],
];
/**
 * Reescreve texto do modelo para leigo: ms → segundos (1 casa), horário de relógio do caso → "aos X s"
 * (precisa de `inicioMs`; sem ele só corta os milissegundos), decimais longos arredondados e jargão trocado.
 */
export function paraLeigo(texto, { inicioMs = null } = {}) {
  if (typeof texto !== 'string' || !texto) return '';
  let t = texto;
  // Horário do relógio (UTC do caso): "Às 11:40:03.217" → "Aos 3,2 s".
  t = t.replace(/(?<![\p{L}\d])([Àà]s\s+)?(\d{2}):(\d{2}):(\d{2})(?:[.,](\d{1,3}))?(\s*UTC)?/gu, (m, as, h, mi, se, frac = '', _utc) => {
    if (Number.isFinite(inicioMs)) {
      const d = new Date(inicioMs);
      const alvo = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), +h, +mi, +se, Number((frac + '00').slice(0, 3)));
      const rel = alvo - inicioMs;
      if (rel >= 0 && rel <= 6 * 3600_000) return `${as ? (as[0] === 'À' ? 'Aos ' : 'aos ') : ''}${segundos(rel)}`;
    }
    return `${as || ''}${h}:${mi}:${se}`;
  });
  // Faixas: "entre 3033,33 e 9616,67 ms" → "entre 3 e 9,6 s".
  t = t.replace(new RegExp(`(${NUM})\\s*(e|a|até|–|-)\\s*(${NUM})\\s*ms\\b`, 'g'), (_m, a, sep, b) => `${segundos(numeroPt(a)).slice(0, -2)} ${sep === '-' ? '–' : sep} ${segundos(numeroPt(b))}`);
  t = t.replace(new RegExp(`(${NUM})\\s*(?:ms|milissegundos?)\\b`, 'g'), (_m, n) => segundos(numeroPt(n)));
  // Decimais longos: "9,62 segundos" → "9,6 segundos"; "11,34 km/h" → "11,3 km/h".
  t = t.replace(/\b(\d+),(\d{2,})\b/g, (_m, i, d) => Number(`${i}.${d}`).toLocaleString('pt-BR', { maximumFractionDigits: 1 }));
  for (const [re, sub] of JARGAO) t = t.replace(re, (...args) => {
    const m = args[0];
    const out = typeof sub === 'function' ? sub(...args) : m.replace(re instanceof RegExp ? new RegExp(re.source, re.flags.replace('g', '')) : re, sub);
    return /^[A-ZÀ-Ú]/.test(m) ? out[0].toUpperCase() + out.slice(1) : out;
  });
  return t.replace(/[ \t]{2,}/g, ' ');
}

/** Mesmo texto para leigo aplicado a um veredicto já gravado (casos salvos antes da regra; laudo e tela). Idempotente. */
export function veredictoEmLeigo(v, { inicioMs = null } = {}) {
  if (!v || typeof v !== 'object') return v;
  const l = (x) => (typeof x === 'string' ? paraLeigo(x, { inicioMs }) : x);
  const f = v.impacto_financeiro;
  return {
    ...v, porque: l(v.porque), hipotese: l(v.hipotese),
    evidencias: Array.isArray(v.evidencias) ? v.evidencias.map((e) => ({ ...e, descricao: l(e.descricao) })) : v.evidencias,
    fatores_contribuintes: Array.isArray(v.fatores_contribuintes) ? v.fatores_contribuintes.map(l) : v.fatores_contribuintes,
    prevencao: Array.isArray(v.prevencao) ? v.prevencao.map((p) => ({ ...p, acao: l(p.acao), ...(p.prazo ? { prazo: l(p.prazo) } : {}) })) : v.prevencao,
    ...(f ? { impacto_financeiro: { ...f, premissas: Array.isArray(f.premissas) ? f.premissas.map(l) : f.premissas } } : {}),
  };
}

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
Público: leigo, lendo no WhatsApp e num laudo de 1 página. Frases curtas. Tempo SEMPRE em segundos com no máximo 1 casa, contado do início ("aos 3 s", "6,1 s"); nunca ms, milissegundos, horário de relógio ou nomes de campo; números arredondados ("9,6 s", "11 km/h"). Não use as palavras amostra, heurística, episódio, flag.
porque: 1–3 frases curtas. hipotese: o que provavelmente aconteceu, 3–5 frases curtas.
evidencias: até 5, cada uma presa a um instante registrado: ${ev}. fatores_contribuintes: até 6 frases curtas.
prevencao: 1–5 ações concretas para a próxima vez, com responsavel (ex.: operador, gestor da frota, oficina) e prazo opcional.
impacto: NÃO escreva valores em reais. Escolha itens desta tabela (chave e, quando aceitar, quantidade): ${chaves}. Use sem_dano se nada foi danificado. premissas: até 4 frases do que você assumiu.
Retorne apenas JSON: {"culpado":"...","confianca":0.5,"porque":"...","hipotese":"...","evidencias":[${ev}],"fatores_contribuintes":["..."],"prevencao":[{"acao":"...","responsavel":"...","prazo":"..."}],"impacto":{"itens":[{"chave":"sem_dano","quantidade":1}],"premissas":["..."]}}`;
}

/**
 * Valida a resposta do modelo. `resolverAmostra(i)` devolve {elapsedMs} ou null (Laboratório);
 * sem ele, aceita elapsedMs (0..duracaoMs) e frame (inteiro em `frames`).
 */
export function lerVeredicto(obj, { resolverAmostra = null, duracaoMs = Infinity, frames = null, modelo = '', sintetico = false, exigeInstante = true, inicioMs = null } = {}) {
  const leigo = (v, max) => limpa(paraLeigo(typeof v === 'string' ? v : '', { inicioMs }), max);
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('invalid_verdict');
  const emLeigo = (arr) => (Array.isArray(arr) ? arr.map((x) => paraLeigo(typeof x === 'string' ? x : '', { inicioMs })) : arr);
  let culpado = Object.hasOwn(CULPADOS, obj.culpado) ? obj.culpado : null;
  if (!culpado) throw new Error('invalid_verdict_culpado');
  const conf = Number(obj.confianca);
  if (!Number.isFinite(conf)) throw new Error('invalid_verdict_confianca');
  const porque = leigo(obj.porque, 600);
  if (!porque) throw new Error('invalid_verdict_porque');
  const evidencias = [];
  for (const e of Array.isArray(obj.evidencias) ? obj.evidencias.slice(0, 5) : []) {
    const descricao = leigo(e?.descricao, 400);
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
  if (culpado !== 'indeterminado' && !sustentado) culpado = 'indeterminado';
  // Confiança é no culpado escolhido: indeterminado nunca passa de 0.3.
  if (culpado === 'indeterminado') confianca = Math.min(confianca, 0.3);
  const prevencao = (Array.isArray(obj.prevencao) ? obj.prevencao : []).slice(0, 5).map((p) => ({
    acao: leigo(p?.acao, 300), responsavel: limpa(p?.responsavel, 80) || 'gestor da operação', ...(leigo(p?.prazo, 80) ? { prazo: leigo(p.prazo, 80) } : {}),
  })).filter((p) => p.acao);
  return {
    versao: VEREDICTO_VERSAO, status: 'concluido', culpado, culpadoRotulo: CULPADOS[culpado], confianca: Math.round(confianca * 100) / 100,
    porque, hipotese: leigo(obj.hipotese, 900), evidencias,
    fatores_contribuintes: lista(emLeigo(obj.fatores_contribuintes), 300, 6), prevencao,
    impacto_financeiro: calcularImpacto(obj.impacto?.itens, { premissas: emLeigo(obj.impacto?.premissas), sintetico }),
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
