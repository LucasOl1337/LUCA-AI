import { useCallback, useEffect, useRef, useState } from 'react';
import { physicalRiskBands } from '../../../shared/sompo-physical-interactions.js';
import { amostraDoPercurso, manifestoDoPercurso, mapaDoPercurso, PERCURSO_HZ, registroDoPercurso } from '../../../shared/percurso-lab.js';
import { firstStandardPad } from '../sompo/gamepadLoop';
import { ABERTURA_MS, MOTIVO_FIM, RASTRO_VAZIO, eventoDesafio, passoDesafio, type ResultadoDesafio as Resultado, type RastroDesafio } from './desafios';
import type { CanalGameplay, EstadoGameplay } from './estadoGameplay';
import { ENCOSTA_TALHAO, TALHAO, ZONAS_TALHAO } from './geofenceTalhao';
import { PainelCabine } from './PainelCabine';
import { REGRAS_NOTA, TRANSICAO_MS, TRECHOS_PERCURSO, resumoPercurso } from './percurso';
import { AberturaDesafio } from './ResultadoDesafio';
import { analisarPercurso, FOCO_ANALISE, type CasoPercurso, type EstadoAnalise } from './analisePercurso';
import { EnviarBancada } from './EnviarBancada';
import { EVENTO_EM_USO } from './eventoEmUso';

type Etapa =
  | { tipo: 'abertura'; trecho: number }
  | { tipo: 'dirigindo'; trecho: number }
  | { tipo: 'transicao'; trecho: number }
  | { tipo: 'resumo' };

type Amostra = ReturnType<typeof amostraDoPercurso>;



/**
 * Percurso guiado (estande aberto): fardo → encosta → área alagada, no mesmo motor.
 * Cada trecho mede como o DesafioCabine; o registro do percurso inteiro (5 Hz, relógio
 * contínuo) vira o caso do Laboratório se a pessoa pedir a análise dos agentes.
 * O resumo fica até a pessoa escolher: nada reinicia sozinho.
 */
export function PercursoCabine({ canal, som = true, aoSair }: { canal: CanalGameplay; som?: boolean; aoSair: () => void }) {
  const [etapa, setEtapa] = useState<Etapa>({ tipo: 'abertura', trecho: 0 });
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [analise, setAnalise] = useState<EstadoAnalise>({ tipo: 'parada' });
  const rastro = useRef<RastroDesafio>(RASTRO_VAZIO);
  const amostras = useRef<Amostra[]>([]);
  const deslocamentoMs = useRef(0);
  const inicioIso = useRef(new Date().toISOString());
  const ultimaAmostra = useRef(-Infinity);
  const cancelarAnalise = useRef<() => void>(() => {});
  const trecho = etapa.tipo === 'resumo' ? null : TRECHOS_PERCURSO[etapa.trecho];

  const recomecar = useCallback(() => {
    cancelarAnalise.current();
    amostras.current = []; deslocamentoMs.current = 0; ultimaAmostra.current = -Infinity;
    inicioIso.current = new Date().toISOString();
    setResultados([]); setAnalise({ tipo: 'parada' });
    setEtapa({ tipo: 'abertura', trecho: 0 });
  }, []);

  useEffect(() => () => cancelarAnalise.current(), []);

  // Abertura do trecho: posiciona e some em 4 s ou na primeira aceleração.
  useEffect(() => {
    if (etapa.tipo !== 'abertura' || !trecho) return;
    rastro.current = RASTRO_VAZIO;
    canal.reiniciar(trecho.inicio);
    const saida = window.setTimeout(() => setEtapa({ tipo: 'dirigindo', trecho: etapa.trecho }), ABERTURA_MS);
    const cancelar = canal.assinar(() => { if (canal.ler().fase === 'dirigindo') setEtapa({ tipo: 'dirigindo', trecho: etapa.trecho }); });
    return () => { window.clearTimeout(saida); cancelar(); };
  }, [etapa, canal, trecho]);

  // Condução: mede o trecho e grava a amostra a 5 Hz no relógio contínuo do percurso.
  useEffect(() => {
    if ((etapa.tipo !== 'abertura' && etapa.tipo !== 'dirigindo') || !trecho) return;
    const indice = etapa.trecho;
    const gravar = (estado: EstadoGameplay) => {
      if (estado.fase !== 'dirigindo') return;
      const t = deslocamentoMs.current + estado.tempoMs;
      if (t - ultimaAmostra.current < 1000 / PERCURSO_HZ) return;
      ultimaAmostra.current = t;
      const inclinado = physicalRiskBands({ pitch: estado.atitude.arfagemGraus, roll: estado.atitude.rolagemGraus }).inclination;
      amostras.current.push({ ...amostraDoPercurso(estado, { inclinado }), tempoMs: t });
    };
    const semMudanca = canal.assinar(() => {
      const estado = canal.ler();
      gravar(estado);
      rastro.current = passoDesafio(rastro.current, estado, trecho);
      const fim = rastro.current.resultado;
      if (!fim) return;
      canal.encerrar(MOTIVO_FIM[fim.desfecho]);
      deslocamentoMs.current += estado.tempoMs + 1000;
      setResultados((lista) => [...lista.slice(0, indice), fim]);
      setEtapa(indice + 1 < TRECHOS_PERCURSO.length ? { tipo: 'transicao', trecho: indice } : { tipo: 'resumo' });
    });
    const semEvento = canal.aoEvento((evento) => { rastro.current = eventoDesafio(rastro.current, evento, canal.ler(), trecho); });
    return () => { semMudanca(); semEvento(); };
  }, [etapa, canal, trecho]);

  // Cartão entre trechos: 3 s e segue (não é o fim de nada; o percurso continua).
  useEffect(() => {
    if (etapa.tipo !== 'transicao') return;
    const seguir = window.setTimeout(() => setEtapa({ tipo: 'abertura', trecho: etapa.trecho + 1 }), TRANSICAO_MS);
    return () => window.clearTimeout(seguir);
  }, [etapa]);

  /** Caso do Laboratório com o registro do percurso inteiro; null sem amostras suficientes. */
  const casoDoPercurso = useCallback((): CasoPercurso | null => {
    const lista = amostras.current;
    if (lista.length < 2) return null;
    const registro = registroDoPercurso(lista, inicioIso.current);
    const alagado = ZONAS_TALHAO[0].poligono.rings[0];
    return {
      rawCsv: registro.csv,
      sourceName: 'percurso-totem.csv',
      name: `Percurso do totem · ${new Date(inicioIso.current).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
      metadata: manifestoDoPercurso({ amostras: registro.amostras, duracaoMs: registro.duracaoMs }),
      map: mapaDoPercurso({ talhao: TALHAO, alagado, encosta: ENCOSTA_TALHAO.rings[0] }),
    };
  }, []);

  const analisar = useCallback(() => {
    if (analise.tipo === 'enviando' || analise.tipo === 'analisando') return;
    const caso = casoDoPercurso();
    if (!caso) { setAnalise({ tipo: 'falha', mensagem: 'O percurso não gravou amostras suficientes para analisar.' }); return; }
    cancelarAnalise.current = analisarPercurso(caso, setAnalise);
  }, [analise.tipo, casoDoPercurso]);

  const resumo = etapa.tipo === 'resumo' ? resumoPercurso(resultados) : null;
  const transicao = etapa.tipo === 'transicao' ? resumoPercurso(resultados).trechos[etapa.trecho] : null;

  // Controle no resumo: ✕ pede a análise (Options já recomeça pelo GameplayKiosk).
  useEffect(() => {
    if (etapa.tipo !== 'resumo') return;
    let segurado = true;
    const relogio = window.setInterval(() => {
      const apertado = !!firstStandardPad()?.buttons[0]?.pressed;
      if (apertado && !segurado) analisar();
      segurado = apertado;
    }, 120);
    return () => window.clearInterval(relogio);
  }, [etapa.tipo, analisar]);

  // Quem espera os agentes está usando o totem: avisa o /stand para não contar como parado.
  useEffect(() => {
    if (analise.tipo !== 'enviando' && analise.tipo !== 'analisando' && analise.tipo !== 'pronta') return;
    window.dispatchEvent(new Event(EVENTO_EM_USO));
    if (analise.tipo === 'pronta') return;
    const relogio = window.setInterval(() => window.dispatchEvent(new Event(EVENTO_EM_USO)), 15_000);
    return () => window.clearInterval(relogio);
  }, [analise.tipo]);

  return (
    <div className="gameplay-desafio gameplay-percurso" data-etapa={etapa.tipo} data-percurso-trecho={etapa.tipo === 'resumo' ? 'fim' : TRECHOS_PERCURSO[etapa.trecho].id} data-analise={analise.tipo}>
      <PainelCabine canal={canal} som={som && etapa.tipo === 'dirigindo'} />
      {etapa.tipo !== 'resumo' && (
        <ol className="gameplay-percurso-trechos" aria-label="Trechos do percurso">
          {TRECHOS_PERCURSO.map((t, i) => <li key={t.id} data-estado={i < etapa.trecho || (etapa.tipo === 'transicao' && i === etapa.trecho) ? 'feito' : i === etapa.trecho ? 'atual' : 'depois'}>{t.titulo}</li>)}
        </ol>
      )}
      {etapa.tipo === 'abertura' && trecho && <AberturaDesafio texto={`${etapa.trecho + 1}/${TRECHOS_PERCURSO.length} · ${trecho.abertura}`} />}
      {transicao && etapa.tipo === 'transicao' && (
        <section className="gameplay-abertura" aria-live="polite">
          <span className="gameplay-painel-selo">SIMULAÇÃO</span>
          <p>{transicao.titulo}: {transicao.resultado}</p>
          <small>Próximo trecho: {TRECHOS_PERCURSO[etapa.trecho + 1].titulo}</small>
        </section>
      )}
      {resumo && (
        <section className="gameplay-resultado gameplay-percurso-resumo" aria-label="Resultado do percurso" aria-live="polite">
          <span className="gameplay-painel-selo">SIMULAÇÃO · dados calculados pelo jogo</span>
          <h2>{resumo.nota === null ? 'Percurso sem nota' : `Nota de condução: ${resumo.nota}`}</h2>
          <ul>
            {resumo.trechos.map((t) => (
              <li key={t.titulo}><b>{t.titulo}:</b> {t.resultado}{t.nota === null ? '' : ` (${t.nota})`}<small>{t.linhas.join(' · ')}</small></li>
            ))}
          </ul>
          <details className="gameplay-percurso-regras"><summary>Como a nota é calculada</summary><ul>{REGRAS_NOTA.map((r) => <li key={r}>{r}</li>)}</ul><p>Nota do percurso simulado: não é risco de seguro nem avaliação da pessoa.</p></details>
          <AnaliseAgentes analise={analise} />
          <div className="gameplay-percurso-acoes">
            <button type="button" data-acao="analisar" onClick={analisar} disabled={analise.tipo === 'enviando' || analise.tipo === 'analisando'}>
              <kbd>✕</kbd> {analise.tipo === 'pronta' || analise.tipo === 'falha' ? 'Analisar de novo' : 'Analisar com os agentes'}
            </button>
            <button type="button" data-acao="repetir" onClick={recomecar}><kbd>Options</kbd> Repetir percurso</button>
            {/* key: percurso novo começa com o botão limpo. */}
            <EnviarBancada key={inicioIso.current} montar={() => {
              const caso = casoDoPercurso();
              return caso && { caso, foco: FOCO_ANALISE, corrida: { veiculo: 'trator', cenario: 'percurso', nota: resumo?.nota ?? null, desfechoTitulo: resumo ? (resumo.nota === null ? 'Percurso sem nota' : `Nota de condução: ${resumo.nota}`) : null } };
            }} />
            <button type="button" data-acao="livre" onClick={aoSair}>Dirigir livre</button>
          </div>
        </section>
      )}
    </div>
  );
}

export function AnaliseAgentes({ analise }: { analise: EstadoAnalise }) {
  if (analise.tipo === 'parada') return <p className="gameplay-percurso-analise">Os agentes do Laboratório podem analisar o registro deste percurso, com o instante de cada evidência.</p>;
  if (analise.tipo === 'enviando') return <p className="gameplay-percurso-analise" role="status">Enviando o registro do percurso ao Laboratório…</p>;
  if (analise.tipo === 'falha') return <p className="gameplay-percurso-analise" data-falha="" role="alert">{analise.mensagem}</p>;
  if (analise.tipo === 'analisando') {
    return (
      <div className="gameplay-percurso-analise" role="status">
        <p>Agentes analisando há {analise.segundos} s ({analise.amostras} amostras). Operação, Mecânica e Ambiente em paralelo; depois a Revisão.</p>
      </div>
    );
  }
  return (
    <div className="gameplay-percurso-analise" data-pronta="">
      <p><b>{analise.titulo}</b> {analise.resumo}</p>
      <ul>{analise.achados.map((a) => <li key={a}>{a}</li>)}</ul>
      <p className="gameplay-percurso-caso">Caso completo no Laboratório: {analise.caso}</p>
    </div>
  );
}
