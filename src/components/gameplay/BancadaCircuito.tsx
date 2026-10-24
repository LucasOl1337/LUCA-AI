import { useEffect } from 'react';
import { IconePad } from '../stand/IconePad';
import { EVENTO_EM_USO } from './eventoEmUso';
import type { BancadaCircuito as Sessao } from './missaoCircuito';
import './circuito.css';

/** Caminho da bancada com a sessão da corrida (mesma página que o SOMPO abre). */
export function caminhoDaBancada(sessao: string) {
  return `/luca-ai?sessao=${encodeURIComponent(sessao)}`;
}

/**
 * Página própria sem importar o palco: a bancada de agentes do LUCA-AI num iframe da
 * mesma origem (como o modo Site do stand), com a sessão da corrida já rodando.
 * O relatório da bancada aparece aqui mesmo, no totem, e fica salvo na conta.
 * Enquanto está aberta, avisa o /stand que alguém está usando (a equipe demora minutos).
 */
export default function BancadaCircuito({ sessao, aoNovo }: { sessao: Sessao; aoNovo(): void }) {
  useEffect(() => {
    window.dispatchEvent(new Event(EVENTO_EM_USO));
    const relogio = window.setInterval(() => window.dispatchEvent(new Event(EVENTO_EM_USO)), 15_000);
    return () => window.clearInterval(relogio);
  }, []);
  return <section className="circuito-bancada" data-bancada-circuito data-run-id={sessao.runId} data-sessao={sessao.sessao} aria-label="Bancada de agentes do LUCA-AI" data-foco-escopo="">
    <header>
      <div><small>LUCA · Bancada de agentes / SIMULAÇÃO</small><h1>Relatório da sua corrida</h1><p>O simulador foi encerrado. A equipe de agentes está analisando o registro; o relatório aparece abaixo e fica salvo na sua conta.</p></div>
      <button type="button" data-pad-voltar="" onClick={aoNovo}><IconePad botao="bola" />Voltar · nova corrida</button>
    </header>
    <iframe className="circuito-bancada-frame" src={caminhoDaBancada(sessao.sessao)} title="Bancada de agentes do LUCA-AI" allow="autoplay; fullscreen" />
  </section>;
}
