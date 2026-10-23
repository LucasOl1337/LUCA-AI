import { useEffect, useRef, useState } from 'react';
import { downloadFile, labRequest, type SavedCase } from '@/lib/lab-client';
import { metricasCircuito } from './circuito';
import type { RelatorioCircuito } from './sessaoCircuito';
import './circuito.css';
export const CHAVE_CHAT_CIRCUITO = 'luca.circuito.chat.v1';
interface Turno { pergunta: string; analiseId: string }
interface ConversaCircuito { relatorio: RelatorioCircuito; casoId: string | null; turnos: Turno[] }
export function guardarConversaCircuito(conversa: ConversaCircuito) {
  try { sessionStorage.setItem(CHAVE_CHAT_CIRCUITO, JSON.stringify(conversa)); } catch { /* Falta de cota não apaga a run em memória. */ }
}
export function descartarConversaCircuito() {
  try { sessionStorage.removeItem(CHAVE_CHAT_CIRCUITO); } catch { /* Sem storage, não há o que descartar. */ }
}
export function recuperarConversaCircuito(): ConversaCircuito | null {
  try {
    const texto = sessionStorage.getItem(CHAVE_CHAT_CIRCUITO);
    if (!texto) return null;
    const c = JSON.parse(texto);
    return c?.relatorio?.registro?.versao === 1 && typeof c.relatorio.caso?.rawCsv === 'string' && Array.isArray(c.turnos) ? c : null;
  } catch { return null; }
}
export function focoCircuito(relatorio: RelatorioCircuito, pergunta: string) {
  const r = relatorio.registro;
  return `Circuito contínuo SIMULAÇÃO, sem reposicionamentos. Avalie tempo ativo em ms, desfecho, sinistros evitados por heurística (não acidentes reais), reações pós-aviso e ausências. Não inferir risco de seguro, culpa ou lesão. Trace integral no campo telemetry.circuito, derivado do manifesto validado.\n${JSON.stringify({ runId: r.runId, resultado: r.resultado, metricas: metricasCircuito(r) })}\nPergunta do visitante: ${pergunta}`;
}
/** Página própria sem importar o palco. Só o gesto de enviar consulta os agentes existentes do Laboratório. */
export default function ChatCircuito({ inicial, aoNovo }: { inicial: ConversaCircuito; aoNovo(): void }) {
  const [conversa, setConversa] = useState(inicial);
  const [caso, setCaso] = useState<SavedCase | null>(null);
  const [texto, setTexto] = useState('Avalie minha run: tempo, desfecho, sinistros evitados e resposta aos sensores.');
  const [ocupado, setOcupado] = useState(!!inicial.casoId);
  const [erro, setErro] = useState('');
  const vivo = useRef(true);
  const timer = useRef<number>(0);
  const r = conversa.relatorio.registro, m = metricasCircuito(r);
  useEffect(() => { guardarConversaCircuito(conversa); }, [conversa]);
  useEffect(() => {
    vivo.current = true;
    if (inicial.casoId) void labRequest<{ case: SavedCase }>(`/${inicial.casoId}`).then((d) => { if (vivo.current) { setCaso(d.case); setOcupado(false); } }, (e) => { if (vivo.current) { setErro(e.message); setOcupado(false); } });
    return () => { vivo.current = false; window.clearTimeout(timer.current); };
  }, [inicial.casoId]);
  async function enviar() {
    if (ocupado || !texto.trim()) return;
    setOcupado(true); setErro(''); const pergunta = texto.trim();
    try {
      let salvo = caso;
      if (!salvo && conversa.casoId) salvo = (await labRequest<{ case: SavedCase }>(`/${conversa.casoId}`)).case;
      if (!salvo) {
        const resultado = await labRequest<{ case: SavedCase }>('', conversa.relatorio.caso);
        salvo = resultado.case;
        if (!vivo.current) return;
        setCaso(salvo); setConversa((c) => ({ ...c, casoId: resultado.case.id }));
      }
      const id = salvo.id;
      // Reusa análise persistida ao recarregar, nunca duplica uma rodada em andamento.
      const existente = salvo.analyses.find((a) => a.status === 'running');
      if (existente) { acompanhar(id, existente.id, pergunta); return; }
      const antes = new Set(salvo.analyses.map((a) => a.id));
      void labRequest<{ case: SavedCase }>(`/${id}/analyses`, { focus: focoCircuito(conversa.relatorio, pergunta) })
        .then((d) => { if (vivo.current) setCaso(d.case); })
        .catch((e: Error) => { if (vivo.current) { setErro(e.message); setOcupado(false); window.clearTimeout(timer.current); } });
      acompanhar(id, null, pergunta, antes);
    } catch (e) { if (vivo.current) { setErro(e instanceof Error ? e.message : 'Não foi possível consultar os agentes.'); setOcupado(false); } }
  }
  function acompanhar(id: string, analiseId: string | null, pergunta: string, antes = new Set<string>(), inicio = performance.now()) {
    timer.current = window.setTimeout(() => {
      void labRequest<{ case: SavedCase }>(`/${id}`).then((d) => {
        if (!vivo.current) return;
        setCaso(d.case);
        const a = d.case.analyses.find((a) => analiseId ? a.id === analiseId : !antes.has(a.id));
        if (a && a.status !== 'running') {
          setConversa((c) => ({ ...c, casoId: id, turnos: c.turnos.some((t) => t.analiseId === a.id) ? c.turnos : [...c.turnos, { pergunta, analiseId: a.id }] }));
          setOcupado(false); setTexto(''); return;
        }
        if (performance.now() - inicio >= 240_000) { setErro('A análise segue salva no Laboratório. Reabra esta página para recuperar; não reenviamos automaticamente.'); setOcupado(false); return; }
        acompanhar(id, a?.id ?? analiseId, pergunta, antes, inicio);
      }).catch((e: Error) => { if (vivo.current) { setErro(e.message); setOcupado(false); } });
    }, 1500);
  }
  const analises = caso?.analyses ?? [];
  return <section className="circuito-chat" data-chat-circuito data-run-id={r.runId} aria-label="Chat dos agentes do Laboratório">
    <header><small>LUCA · Laboratório / SIMULAÇÃO</small><h1>Converse sobre sua run</h1><p>O simulador foi encerrado. O registro e a conversa ficam nesta aba; os pareceres são salvos na sua conta.</p><button onClick={aoNovo}>Voltar · iniciar nova run</button><a href="#circuito-pergunta">Perguntar aos agentes ↓</a></header>
    <article className="circuito-relatorio"><h2>Relatório do circuito</h2><p>Run: {r.runId} · {r.resultado?.motivo ?? 'sem desfecho'}</p>
      <dl><dt>Tempo ativo</dt><dd>{(m.elapsedMs / 1000).toFixed(1)} s</dd><dt>Sinistros evitados (heurística)</dt><dd>{m.sinistrosEvitados}</dd><dt>Reação média após aviso</dt><dd>{m.reacaoMediaMs === null ? 'N/A' : `${m.reacaoMediaMs} ms`}</dd><dt>Episódios sem resposta</dt><dd>{m.semResposta}</dd></dl>
      <p>Reação: nova frenagem ou esterço após o aviso. Evitado: exposição, resposta e saída segura por 1 s — estimativa do jogo, não acidente real.</p>
      <details><summary>Regras, limites e trace temporal</summary><p>{r.regras}</p><pre>{JSON.stringify(r, null, 2)}</pre></details>
      <button onClick={() => downloadFile(JSON.stringify(conversa.relatorio, null, 2), `${r.runId}.json`, 'application/json')}>Baixar registro da run</button>
    </article>
    <div role="log" aria-live="polite" aria-label="Diálogo com os agentes">{analises.map((a) => <article key={a.id} className="circuito-turno"><p><b>Você:</b> {conversa.turnos.find((t) => t.analiseId === a.id)?.pergunta ?? a.focus?.split('Pergunta do visitante: ')[1] ?? 'Avaliar run'}</p>
      {a.axes.map((eixo) => <section key={eixo.id}><h3>{eixo.title}</h3><p>{eixo.summary || (eixo.status === 'completed' ? 'Sem hipótese sustentada.' : 'Resposta indisponível.')}</p>{eixo.hypotheses.map((h) => <div key={h.id}><b>{h.title}</b><p>{h.explanation}</p>{h.evidence.map((e, i) => <p key={i}>{(e.elapsedMs / 1000).toFixed(1)} s — {e.description}</p>)}</div>)}{eixo.limitations.map((l, i) => <p key={i}>Limite: {l}</p>)}</section>)}
      {a.status === 'running' && <p>Agentes investigando o registro…</p>}{a.error && <p role="status">{a.error}</p>}
    </article>)}</div>
    {!analises.length && <p>Nenhuma resposta gerada ainda. Enviar consulta os agentes reais do Laboratório; sem resposta válida não mostramos avaliação inventada.</p>}
    {erro && <p role="alert">{erro}</p>}
    <form onSubmit={(e) => { e.preventDefault(); void enviar(); }}><label htmlFor="circuito-pergunta">Pergunte aos agentes</label><textarea id="circuito-pergunta" maxLength={800} value={texto} onChange={(e) => setTexto(e.target.value)} disabled={ocupado} /><button disabled={ocupado || !texto.trim()}>{ocupado ? 'Aguardando agentes…' : 'Enviar para análise'}</button></form>
  </section>;
}
