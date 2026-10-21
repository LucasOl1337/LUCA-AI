// `luca feira checar`: o dia da feira conferido só com GET e sem sessão.
// Um asset que volta com o tamanho do index.html é o fallback SPA, ou seja,
// release errada; o tamanho vem de uma sonda, não de um número fixo.
export const PAGINAS_DA_FEIRA = Object.freeze({ stand: ['/stand/', 'StandPage'], gameplay: ['/gameplay', 'GameplayPage'], operador: ['/operador', 'OperadorPage'], totem: ['/totem', 'TotemPage'] });
export const CORUJA_GLB = '/stand/avatar/coruja-3d/coruja-3d.glb';
// GLB da cabine do gameplay pelo nome fixo: a URL antiga segue servida (release anterior).
export const CABINE_GLB = '/models/gameplay/max-tractor-cabine.glb';
// O plano lista o nome fixo; na checagem vale o nome com hash achado no chunk do stand.
const SONDA = '/assets/feira-checar-sonda-inexistente.js';

export function planoDaFeira(origem) {
  return [`${origem}/api/health`, `${origem}/api/state`, `${origem}${SONDA}`, `${origem}/`, ...Object.values(PAGINAS_DA_FEIRA).map(([caminho]) => `${origem}${caminho}`), `${origem}${CORUJA_GLB}`, `${origem}${CABINE_GLB}`];
}

export async function checarFeira(origem, { timeout = 15000 } = {}) {
  const checks = [];
  const anota = (id, ok, detalhe = {}) => { checks.push({ id, ok, ...detalhe }); return ok; };
  const pega = async caminho => {
    const res = await fetch(`${origem}${caminho}`, { redirect: 'manual', signal: AbortSignal.timeout(timeout), headers: { 'cache-control': 'no-cache' } });
    const corpo = Buffer.from(await res.arrayBuffer());
    return { status: res.status, tipo: res.headers.get('content-type') || '', headers: res.headers, corpo };
  };
  const tenta = async (id, fn) => { try { return await fn(); } catch (error) { anota(id, false, { erro: error.name === 'TimeoutError' ? `timeout ${timeout} ms` : error.cause?.code || error.message }); return null; } };

  let versao = null;
  await tenta('health', async () => {
    const r = await pega('/api/health');
    let json = null;
    try { json = JSON.parse(r.corpo.toString()); } catch { /* corpo inválido */ }
    versao = json?.version ?? null;
    anota('health', r.status === 200 && json?.ok === true && typeof versao === 'string', { status: r.status, versao });
  });
  await tenta('state-sem-login', async () => {
    const r = await pega('/api/state');
    anota('state-sem-login', r.status === 401, { status: r.status, esperado: 401 });
  });
  let fallback = null;
  await tenta('fallback-spa', async () => {
    const r = await pega(SONDA);
    fallback = r.status === 200 && r.tipo.includes('text/html') ? r.corpo.length : null;
    anota('fallback-spa', true, { status: r.status, bytes: fallback });
  });
  const asset = async caminho => tenta(`asset ${caminho}`, async () => {
    const r = await pega(caminho);
    const spa = r.tipo.includes('text/html') || (fallback !== null && r.corpo.length === fallback);
    anota(`asset ${caminho}`, r.status === 200 && !spa && r.corpo.length > 0, { status: r.status, bytes: r.corpo.length, tipo: r.tipo, ...(spa ? { motivo: 'fallback SPA: release errada' } : {}) });
    return r.status === 200 && !spa ? r.corpo.toString() : null;
  });

  const indice = await tenta('index.html', async () => {
    const r = await pega('/');
    const entrada = r.corpo.toString().match(/src="(\/assets\/index-[\w-]+\.js)"/)?.[1];
    anota('index.html', r.status === 200 && Boolean(entrada), { status: r.status, bytes: r.corpo.length, entrada: entrada || null });
    return entrada;
  });
  const entrada = indice ? await asset(indice) : null;
  const vistos = new Set();
  // GLB da coruja com hash (`?url` do Vite): o nome está num chunk do stand.
  let corujaComHash = null;
  const procuraCoruja = codigo => { corujaComHash ??= (codigo || '').match(/\/assets\/coruja-3d-[\w-]+\.glb/)?.[0] ?? null; };
  // GLBs do gameplay com hash: o mapa `/models/gameplay/x.glb` → `/assets/x-<hash>.glb` está num chunk do palco.
  const gameplayComHash = new Map();
  const procuraMapa = codigo => { for (const m of (codigo || '').matchAll(/"(\/models\/gameplay\/[\w.-]+\.glb)":"(\/assets\/[\w.-]+\.glb)"/g)) gameplayComHash.set(m[1], m[2]); };
  const imports = codigo => [...new Set([...(codigo || '').matchAll(/["'(]\.\/([\w.-]+\.(?:js|css))["')]/g)].map(m => m[1]))];
  for (const [pagina, [caminho, chunk]] of Object.entries(PAGINAS_DA_FEIRA)) {
    await tenta(`pagina ${pagina}`, async () => {
      const r = await pega(caminho);
      const politica = r.headers.get('permissions-policy');
      const detalhe = { status: r.status, permissionsPolicy: politica };
      let ok = r.status === 200 && r.tipo.includes('text/html') && Boolean(politica);
      if (pagina === 'stand') ok &&= /microphone=\((?:[^)]*\bself\b[^)]*)\)|microphone=\*/.test(politica);
      if (pagina === 'stand') detalhe.esperado = 'microphone=(self)';
      anota(`pagina ${pagina}`, ok, detalhe);
    });
    const nome = entrada?.match(new RegExp(`assets/(${chunk}-[\\w-]+\\.js)`))?.[1];
    if (!nome) { if (entrada) anota(`chunk ${pagina}`, false, { motivo: `${chunk} não aparece no index` }); continue; }
    const codigo = await asset(`/assets/${nome}`);
    procuraCoruja(codigo);
    for (const css of new Set(entrada.match(new RegExp(`assets/${chunk}-[\\w-]+\\.css`, 'g')) || [])) await asset(`/${css}`);
    // Dois níveis de imports do chunk: pega release pela metade e acha o mapa do palco
    // (GameplayPage → GameplayComCabine → restoreSompoTextures).
    let fila = imports(codigo);
    for (let nivel = 0; nivel < 2 && fila.length; nivel++) {
      const proxima = [];
      for (const dep of fila) {
        if (vistos.has(dep) || dep === indice.slice(8)) continue;
        vistos.add(dep);
        const dependencia = await asset(`/assets/${dep}`);
        procuraCoruja(dependencia);
        procuraMapa(dependencia);
        proxima.push(...imports(dependencia));
      }
      fila = proxima;
    }
  }
  await tenta('coruja-3d.glb', async () => {
    const caminho = corujaComHash || CORUJA_GLB;
    const r = await pega(caminho);
    const glb = r.status === 200 && r.corpo.subarray(0, 4).toString() === 'glTF';
    const ausente = r.status === 404 || r.tipo.includes('text/html');
    // Pedido pelo chunk do stand e ausente é release pela metade; só o nome fixo vira aviso.
    const aviso = ausente && !corujaComHash;
    anota('coruja-3d.glb', glb || aviso, { status: r.status, caminho, bytes: r.corpo.length, presente: glb, cacheControl: r.headers.get('cache-control'), ...(aviso ? { aviso: 'GLB ausente; o stand usa a Coruja A' } : {}), ...(ausente && corujaComHash ? { motivo: 'o stand pede este GLB e ele não está no servidor' } : {}) });
  });
  // Cada GLB do gameplay: o nome com hash que o palco pede (falha se faltar) e o nome
  // fixo, que segue servido para a release anterior. Release sem o mapa: só o fixo.
  const glbsDoGameplay = gameplayComHash.size ? [...gameplayComHash] : [[CABINE_GLB, null]];
  for (const [fixo, comHash] of glbsDoGameplay) {
    const id = `gameplay ${fixo.split('/').pop()}`;
    await tenta(id, async () => {
      const ehGlb = r => r.status === 200 && r.corpo.subarray(0, 4).toString() === 'glTF';
      const antigo = await pega(fixo);
      const novo = comHash ? await pega(comHash) : null;
      const ok = ehGlb(antigo) && (!novo || ehGlb(novo));
      anota(id, ok, {
        caminho: comHash || fixo, status: (novo || antigo).status, cacheControl: (novo || antigo).headers.get('cache-control'),
        nomeFixo: { status: antigo.status, presente: ehGlb(antigo) },
        ...(novo && !ehGlb(novo) ? { motivo: 'o gameplay pede este GLB e ele não está no servidor' } : {}),
        ...(!ehGlb(antigo) ? { motivo: 'URL antiga sem hash sumiu: aba da release anterior quebra' } : {}),
      });
    });
  }
  const falhas = checks.filter(c => !c.ok).map(c => c.id);
  return { ok: falhas.length === 0, url: origem, versao, verificadoEm: new Date().toISOString(), falhas, checks };
}
