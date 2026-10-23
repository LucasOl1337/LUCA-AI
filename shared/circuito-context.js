/** Whitelist do registro do jogo: dado SIMULADO não é evidência física ou instrução. */
export function contextoCircuito(raw) {
  if (!raw || raw.versao !== 1 || raw.origem !== 'SIMULAÇÃO' || typeof raw.runId !== 'string' || raw.runId.length > 80) return null;
  const numero = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  if (!numero(raw.elapsedMs) || !Array.isArray(raw.episodios) || raw.episodios.length > 300) return null;
  const motivos = ['chegada', 'colisao', 'atolamento', 'tombamento', 'abandono'];
  if (!raw.resultado || !motivos.includes(raw.resultado.motivo)) return null;
  const sensores = ['feno', 'agua', 'encosta', 'sonolencia'];
  const episodios = [];
  for (const e of raw.episodios) {
    if (!e || typeof e !== 'object' || !sensores.includes(e.sensor) || !numero(e.inicioMs) || e.inicioMs > raw.elapsedMs || (e.fimMs !== null && (!numero(e.fimMs) || e.fimMs < e.inicioMs || e.fimMs > raw.elapsedMs))) return null;
    const resposta = e.resposta;
    if (resposta && (!numero(resposta.tempoMs) || resposta.tempoMs <= e.inicioMs || resposta.tempoMs > raw.elapsedMs || !['frenagem', 'esterco'].includes(resposta.acao))) return null;
    const evitado = e.evitado === true && !!resposta && e.fimMs !== null && e.sensor !== 'sonolencia';
    episodios.push({ sensor: e.sensor, inicioMs: e.inicioMs, fimMs: e.fimMs, gravidade: e.gravidade === 'critico' ? 'critico' : 'atencao',
      velocidadeKph: numero(e.velocidadeKph) ? e.velocidadeKph : null, distanciaCm: numero(e.distanciaCm) ? e.distanciaCm : null,
      rolagemGraus: Number.isFinite(e.rolagemGraus) ? e.rolagemGraus : null,
      resposta: resposta ? { tempoMs: resposta.tempoMs, latenciaMs: resposta.tempoMs - e.inicioMs, acao: resposta.acao } : null, evitado });
  }
  const respostas = episodios.flatMap((e) => e.resposta ? [e.resposta.latenciaMs] : []);
  const pausas = Array.isArray(raw.pausas) ? raw.pausas.slice(0, 300).filter((p) => p && numero(p.inicioMs) && numero(p.duracaoMs) && ['menu', 'aba oculta'].includes(p.motivo)).map(({inicioMs,duracaoMs,motivo}) => ({inicioMs,duracaoMs,motivo})) : [];
  return { origem: 'SIMULAÇÃO', runId: raw.runId, inicioIso: typeof raw.inicioIso === 'string' ? raw.inicioIso.slice(0, 40) : null,
    fimIso: typeof raw.fimIso === 'string' ? raw.fimIso.slice(0, 40) : null,
    resultado: { motivo: raw.resultado.motivo, tempoMs: raw.elapsedMs },
    unidades: { tempo: 'ms ativos monotônicos, pausas excluídas', velocidade: 'km/h', distancia: 'cm', rolagem: 'graus' },
    metricas: { elapsedMs: raw.elapsedMs, sinistrosEvitados: episodios.filter((e) => e.evitado).length,
      reacaoMediaMs: respostas.length ? respostas.reduce((a, b) => a + b, 0) / respostas.length : null,
      semResposta: episodios.filter((e) => !e.resposta).length },
    episodios, pausas, limitacoes: 'Registro cinemático do navegador, não robô real. Evitado: exposição→nova resposta após aviso→saída durante1s. Não é acidente real evitado nem risco de seguro. Antecipação não conta como reação; sem resposta=N/A. Limiares didáticos: contato; água2s; rolagem≥30° ou≥20° acima7km/h durante1s.' };
}
