import { textoFaixa, type Veredicto } from '../../../shared/veredicto.js';
import './veredicto.css';

const tempo = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
const nivel = (c: number) => (c >= 0.75 ? 'forte' : c >= 0.5 ? 'moderada' : c > 0 ? 'fraca' : 'sem base');

/**
 * Bloco "Veredicto" (pedido do Lucas, 24/10): culpado provável + confiança, como prevenir e impacto financeiro.
 * Mesmo componente no simulador, no Laboratório e na bancada SOMPO. `compacto` esconde a lista de componentes.
 */
export function VeredictoBloco({ veredicto, compacto = false, aoBuscar }: { veredicto: Veredicto | null | undefined; compacto?: boolean; aoBuscar?: (ms: number) => void }) {
  if (!veredicto) return null;
  const v = veredicto;
  const f = v.impacto_financeiro;
  const pct = Math.round(v.confianca * 100);
  return (
    <section className="veredicto-bloco" data-veredicto={v.culpado} data-veredicto-status={v.status} aria-label="Veredicto final">
      <header>
        <small>VEREDICTO FINAL · ESTIMATIVA</small>
        <h3><span>Provável culpado:</span> <b>{v.culpadoRotulo}</b></h3>
        <div className="veredicto-confianca" title={`Confiança ${pct}%`}>
          <i style={{ width: `${pct}%` }} />
          <span>Confiança {pct}% · {nivel(v.confianca)}</span>
        </div>
      </header>
      <p className="veredicto-porque">{v.porque}</p>
      {v.hipotese && <p className="veredicto-hipotese"><b>O que provavelmente aconteceu:</b> {v.hipotese}</p>}
      {v.evidencias.length > 0 && <ul className="veredicto-evidencias">{v.evidencias.map((e, i) => (
        <li key={i}>{e.elapsedMs != null && (aoBuscar
          ? <button type="button" onClick={() => aoBuscar(e.elapsedMs!)}>{tempo(e.elapsedMs)}</button>
          : <b>{tempo(e.elapsedMs)}</b>)}{e.frame != null && <b>quadro {e.frame}</b>} {e.descricao}</li>
      ))}</ul>}
      {v.prevencao.length > 0 && <div className="veredicto-secao"><h4>Como prevenir</h4><ul>{v.prevencao.map((p, i) => (
        <li key={i}>{p.acao} <small>· {p.responsavel}{p.prazo ? ` · ${p.prazo}` : ''}</small></li>
      ))}</ul></div>}
      <div className="veredicto-secao veredicto-impacto">
        <h4>Impacto financeiro possível <small>({f.rotulo})</small></h4>
        <strong>{textoFaixa(f)}</strong>
        {!compacto && f.componentes.length > 0 && <ul>{f.componentes.map((c) => <li key={c.chave}>{c.item}: {textoFaixa({ ...f, faixa_min_brl: c.valor_min_brl, faixa_max_brl: c.valor_max_brl })} <small>· {c.base}</small></li>)}</ul>}
        {!compacto && f.premissas.length > 0 && <details><summary>Premissas</summary>{f.premissas.map((p, i) => <p key={i}>{p}</p>)}</details>}
      </div>
      {!compacto && v.fatores_contribuintes.length > 0 && <details className="veredicto-fatores"><summary>Fatores contribuintes</summary><ul>{v.fatores_contribuintes.map((x, i) => <li key={i}>{x}</li>)}</ul></details>}
      <p className="veredicto-aviso">{v.aviso}</p>
    </section>
  );
}
