/**
 * Endereço da interface autenticada.
 * Path = página. Query só carrega o que alguém colaria: busca, filtro, aba, item.
 * Valor padrão some da barra. Path desconhecido cai em início sem quebrar `/`.
 */

export const APP_PAGES = Object.freeze([
  'inicio',
  'luca-ai',
  'personas',
  'configuracao',
  'sompo',
  'laboratorio',
  'admin',
]);

export const PAGE_PATHS = Object.freeze({
  inicio: '/',
  'luca-ai': '/luca-ai',
  personas: '/personas',
  configuracao: '/configuracao',
  sompo: '/sompo',
  laboratorio: '/laboratorio',
  admin: '/admin',
});

// 'principais' e 'ativadas' ficam só por compatibilidade com links antigos.
export const PERSONA_FILTRO = Object.freeze(['all', 'visiveis', 'ocultas', 'editadas', 'principais', 'ativadas']);
export const SOMPO_ABA = 'casos';
export const SOMPO_TELEMETRY_ABA = 'telemetria';
export const LUCA_ABA = 'atividade';
export const ADMIN_ABAS = Object.freeze(['personas', 'configuracao']);
export const CONFIG_TIPO = Object.freeze(['team', 'individual']);

export const ORDEM_PARAM = Object.freeze({
  recente: 'activity_desc',
  prompts: 'runs_desc',
  rodadas: 'requests_desc',
  logins: 'logins_desc',
  cadastro: 'created_desc',
});

export const ORDEM_API = Object.freeze({
  activity_desc: 'recente',
  runs_desc: 'prompts',
  requests_desc: 'rodadas',
  logins_desc: 'logins',
  created_desc: 'cadastro',
});

export const PRODUTO_PARAM = Object.freeze({
  'agricola-produtividade': 'produtividade',
  'agricola-custeio': 'custeio',
  'penhor-rural': 'penhor',
  carteira: 'carteira',
});

export const PRODUTO_VALUE = Object.freeze({
  produtividade: 'agricola-produtividade',
  custeio: 'agricola-custeio',
  penhor: 'penhor-rural',
  carteira: 'carteira',
  'agricola-produtividade': 'agricola-produtividade',
  'agricola-custeio': 'agricola-custeio',
  'penhor-rural': 'penhor-rural',
});

export const GRAVIDADE_VALUES = Object.freeze(['critica', 'alta', 'media', 'baixa']);

const EMPTY_QUERY = Object.freeze({
  busca: '',
  filtro: 'all',
  aba: '',
  tipo: 'team',
  modelo: '',
  novo: false,
  produto: '',
  gravidade: '',
  caso: '',
  sessao: '',
  conta: '',
  ordem: '',
  fonte: '',
  modo: '',
  cenario: '',
  desfecho: '',
});

export function emptyAppLocation() {
  return {
    kind: 'app',
    page: 'inicio',
    authMode: 'login',
    leituraToken: '',
    ...EMPTY_QUERY,
  };
}

export function isAppPage(value) {
  return APP_PAGES.includes(value);
}

function cleanPath(pathname) {
  const raw = String(pathname || '/');
  if (raw === '/') return '/';
  return raw.replace(/\/+$/, '') || '/';
}

function readParam(search, key) {
  const value = search.get(key);
  return value == null ? '' : String(value);
}

function parseQuery(search) {
  const filtroRaw = readParam(search, 'filtro');
  const filtro = PERSONA_FILTRO.includes(filtroRaw) ? filtroRaw : 'all';
  const tipoRaw = readParam(search, 'tipo');
  const tipo = CONFIG_TIPO.includes(tipoRaw) ? tipoRaw : 'team';
  const produtoRaw = readParam(search, 'produto');
  const produto = PRODUTO_VALUE[produtoRaw] ? PRODUTO_PARAM[PRODUTO_VALUE[produtoRaw]] : '';
  const gravidadeRaw = readParam(search, 'gravidade');
  const gravidade = GRAVIDADE_VALUES.includes(gravidadeRaw) ? gravidadeRaw : '';
  const ordemRaw = readParam(search, 'ordem');
  const ordem = ORDEM_PARAM[ordemRaw] || ORDEM_API[ordemRaw]
    ? (ORDEM_PARAM[ordemRaw] ? ordemRaw : ORDEM_API[ordemRaw])
    : '';
  const abaRaw = readParam(search, 'aba');
  const aba = [SOMPO_ABA, SOMPO_TELEMETRY_ABA, LUCA_ABA, ...ADMIN_ABAS].includes(abaRaw) ? abaRaw : '';

  return {
    busca: readParam(search, 'busca'),
    filtro,
    aba,
    tipo,
    modelo: readParam(search, 'modelo'),
    novo: readParam(search, 'novo') === '1',
    produto,
    gravidade,
    caso: readParam(search, 'caso'),
    sessao: readParam(search, 'sessao'),
    conta: readParam(search, 'conta'),
    ordem,
    // '' = simulador (padrão); 'simulacao' = link legado; 'firebase' = gêmeo físico.
    fonte: ['simulacao', 'firebase'].includes(readParam(search, 'fonte'))
      ? readParam(search, 'fonte')
      : '',
    modo: readParam(search, 'modo') === 'individual' ? 'individual' : '',
    cenario: readParam(search, 'cenario'),
    desfecho: readParam(search, 'desfecho'),
  };
}

export function parseAppLocation(href) {
  const url = new URL(String(href || '/'), 'http://luca.local');
  const path = cleanPath(url.pathname);
  const query = parseQuery(url.searchParams);
  const base = emptyAppLocation();

  const leitura = path.match(/^\/leitura\/([^/]+)$/);
  if (leitura) {
    let token = leitura[1];
    try {
      token = decodeURIComponent(token);
    } catch {
      // keep raw segment
    }
    return { ...base, kind: 'leitura', leituraToken: token };
  }

  if (path === '/cadastro') {
    return { ...base, kind: 'auth', authMode: 'register' };
  }
  if (path === '/entrar') {
    return { ...base, kind: 'auth', authMode: 'login' };
  }

  const page = path === '/inicio'
    ? 'inicio'
    : Object.keys(PAGE_PATHS).find((id) => PAGE_PATHS[id] === path) || 'inicio';

  return {
    ...base,
    kind: 'app',
    page,
    ...query,
  };
}

function setIfPresent(params, key, value) {
  const text = String(value || '').trim();
  if (text) params.set(key, text);
}

export function formatAppUrl(location) {
  const loc = { ...emptyAppLocation(), ...location };

  if (loc.kind === 'leitura' && loc.leituraToken) {
    return `/leitura/${encodeURIComponent(loc.leituraToken)}`;
  }
  if (loc.kind === 'auth' && loc.authMode === 'register') {
    return '/cadastro';
  }
  if (loc.kind === 'auth') {
    return '/';
  }

  const page = isAppPage(loc.page) ? loc.page : 'inicio';
  const path = PAGE_PATHS[page];
  const params = new URLSearchParams();

  if (page === 'personas') {
    setIfPresent(params, 'busca', loc.busca);
    if (loc.filtro && loc.filtro !== 'all') params.set('filtro', loc.filtro);
  }

  if (page === 'configuracao') {
    if (loc.tipo === 'individual') params.set('tipo', 'individual');
    setIfPresent(params, 'modelo', loc.modelo);
    if (loc.novo) params.set('novo', '1');
  }

  if (page === 'sompo') {
    if (loc.aba === SOMPO_ABA) params.set('aba', SOMPO_ABA);
    if (loc.aba === SOMPO_TELEMETRY_ABA) params.set('aba', SOMPO_TELEMETRY_ABA);
    setIfPresent(params, 'busca', loc.busca);
    setIfPresent(params, 'produto', loc.produto);
    setIfPresent(params, 'gravidade', loc.gravidade);
    setIfPresent(params, 'caso', loc.caso);
    setIfPresent(params, 'cenario', loc.cenario);
    setIfPresent(params, 'desfecho', loc.desfecho);
    if (loc.aba !== SOMPO_ABA && loc.fonte === 'simulacao') params.set('fonte', 'simulacao');
    if (loc.aba !== SOMPO_ABA && loc.fonte === 'firebase') params.set('fonte', 'firebase');
  }

  if (page === 'admin') {
    setIfPresent(params, 'busca', loc.busca);
    if (loc.ordem && loc.ordem !== 'recente') params.set('ordem', loc.ordem);
    setIfPresent(params, 'conta', loc.conta);
    setIfPresent(params, 'sessao', loc.sessao);
    if (ADMIN_ABAS.includes(loc.aba)) params.set('aba', loc.aba);
    if (loc.aba === 'personas' && loc.filtro && loc.filtro !== 'all') params.set('filtro', loc.filtro);
    if (loc.aba === 'configuracao') {
      if (loc.tipo === 'individual') params.set('tipo', 'individual');
      setIfPresent(params, 'modelo', loc.modelo);
      if (loc.novo) params.set('novo', '1');
    }
  }

  if (page === 'luca-ai') {
    setIfPresent(params, 'sessao', loc.sessao);
    if (loc.aba === LUCA_ABA) params.set('aba', LUCA_ABA);
    if (loc.modo === 'individual') params.set('modo', 'individual');
  }

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function mergeAppLocation(current, patch) {
  const now = { ...emptyAppLocation(), ...current };
  const next = { ...patch };

  if (next.kind === 'leitura' || next.kind === 'auth') {
    return { ...emptyAppLocation(), ...next, kind: next.kind };
  }

  if (next.page && next.page !== now.page) {
    return {
      ...emptyAppLocation(),
      ...next,
      kind: 'app',
      page: next.page,
    };
  }

  return { ...now, ...next, kind: next.kind || now.kind || 'app' };
}

/** A entrada fica em /sompo; links compartilhados continuam abrindo a área escolhida. */
export function getSompoView(location) {
  if (location.aba === SOMPO_ABA) return 'cases';
  if (location.aba === SOMPO_TELEMETRY_ABA || location.fonte) return 'telemetry';
  if (location.caso || location.produto || location.gravidade || location.busca) return 'cases';
  return 'welcome';
}
