// `luca feira checar`: o dia da feira conferido só com GET e sem sessão.
// Um asset que volta com o tamanho do index.html é o fallback SPA, ou seja,
// release errada; o tamanho vem de uma sonda, não de um número fixo.
export const PAGINAS_DA_FEIRA = Object.freeze({ stand: ['/stand/', 'StandPage'], gameplay: ['/gameplay', 'GameplayPage'], operador: ['/operador', 'OperadorPage'], totem: ['/totem', 'TotemPage'] });
export const CORUJA_GLB = '/stand/avatar/coruja-3d/coruja-3d.glb';
const SONDA = '/assets/feira-checar-sonda-inexistente.js';

export function planoDaFeira(origem) {
  return [`${origem}/api/health`, `${origem}/api/state`, `${origem}${SONDA}`, `${origem}/`, ...Object.values(PAGINAS_DA_FEIRA).map(([caminho]) => `${origem}${caminho}`), `${origem}${CORUJA_GLB}`];
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
    for (const css of new Set(entrada.match(new RegExp(`assets/${chunk}-[\\w-]+\\.css`, 'g')) || [])) await asset(`/${css}`);
    // Um nível de imports diretos do chunk: pega release pela metade.
    for (const dep of new Set([...(codigo || '').matchAll(/["'(]\.\/([\w.-]+\.(?:js|css))["')]/g)].map(m => m[1]))) {
      if (vistos.has(dep) || dep === indice.slice(8)) continue;
      vistos.add(dep);
      await asset(`/assets/${dep}`);
    }
  }
  await tenta('coruja-3d.glb', async () => {
    const r = await pega(CORUJA_GLB);
    const glb = r.status === 200 && r.corpo.subarray(0, 4).toString() === 'glTF';
    const ausente = r.status === 404 || r.tipo.includes('text/html');
    anota('coruja-3d.glb', glb || ausente, { status: r.status, bytes: r.corpo.length, presente: glb, ...(ausente ? { aviso: 'GLB ausente; o stand usa a Coruja A' } : {}) });
  });
  const falhas = checks.filter(c => !c.ok).map(c => c.id);
  return { ok: falhas.length === 0, url: origem, versao, verificadoEm: new Date().toISOString(), falhas, checks };
}
