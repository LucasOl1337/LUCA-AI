import { useState, type FormEvent, type PointerEvent } from 'react';
import { CATALOGO, type GrupoCatalogo, type ItemCatalogo } from '../../../shared/stand/catalogo.ts';

/**
 * Menu fixo do Totem (grill Totem interativo r1, Q1/Q2/Q5/Q6): grupo → itens do
 * catálogo comum (`shared/stand/catalogo.ts`). Um toque executa; o resultado
 * (feito ou o motivo da falha) fica na tela. Vale com ou sem voz.
 */

export type EstadoItem = { item: string; fase: 'executando' | 'ok' | 'falha'; mensagem: string };

interface Props {
  aberto: boolean;
  grupo: string | null;
  status: EstadoItem | null;
  /** Motivo de o item não estar disponível agora; null = disponível. */
  indisponivel(item: ItemCatalogo): string | null;
  /** Texto livre ao assistente; null = sem caixa de texto (voz desligada no servidor). */
  motivoSemTexto: string | null;
  aoAbrirGrupo(id: string | null): void;
  aoFechar(): void;
  aoExecutar(item: ItemCatalogo): void;
  aoPerguntar(texto: string): void;
  catalogo?: readonly GrupoCatalogo[];
}

const parar = (evento: PointerEvent) => evento.stopPropagation();

export function MenuTotem({ aberto, grupo, status, indisponivel, motivoSemTexto, aoAbrirGrupo, aoFechar, aoExecutar, aoPerguntar, catalogo = CATALOGO }: Props) {
  const [texto, setTexto] = useState('');
  if (!aberto) return null;
  const atual = grupo ? catalogo.find((g) => g.id === grupo) : undefined;
  const ocupado = status?.fase === 'executando';
  const enviar = (evento: FormEvent) => {
    evento.preventDefault();
    const limpo = texto.trim();
    if (!limpo || motivoSemTexto) return;
    aoPerguntar(limpo.slice(0, 500));
    setTexto('');
  };
  return (
    <section className="stand-menu" role="dialog" aria-label="Menu do totem" data-grupo={atual?.id} onPointerDown={parar}>
      <header className="stand-menu-topo">
        {atual
          ? <button type="button" className="stand-menu-voltar" onClick={() => aoAbrirGrupo(null)}>‹ Todas as opções</button>
          : <p className="stand-menu-titulo">O que você quer ver?</p>}
        <button type="button" className="stand-menu-fechar" aria-label="Fechar o menu" onClick={aoFechar}>✕</button>
      </header>
      {atual && <p className="stand-menu-grupo">{atual.titulo} <span>· {atual.faz}</span></p>}
      <ul className="stand-menu-lista" data-nivel={atual ? 2 : 1}>
        {atual
          ? atual.itens.map((item) => {
            const motivo = indisponivel(item);
            const meu = status?.item === item.id ? status : null;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="stand-menu-item"
                  data-item={item.id}
                  data-fase={meu?.fase}
                  disabled={Boolean(motivo) || ocupado}
                  aria-describedby={motivo || item.detalhe ? `d-${item.id}` : undefined}
                  onClick={() => aoExecutar(item)}
                >
                  <span className="stand-menu-rotulo">{item.rotulo}</span>
                  {(motivo || item.detalhe) && <span id={`d-${item.id}`} className="stand-menu-detalhe">{motivo ?? item.detalhe}</span>}
                </button>
              </li>
            );
          })
          : catalogo.map((g) => (
            <li key={g.id}>
              <button type="button" className="stand-menu-item stand-menu-item-grupo" data-grupo={g.id} onClick={() => aoAbrirGrupo(g.id)}>
                <span className="stand-menu-rotulo">{g.titulo}</span>
                <span className="stand-menu-detalhe">{g.faz} · {g.itens.length} {g.itens.length === 1 ? 'opção' : 'opções'}</span>
              </button>
            </li>
          ))}
      </ul>
      {status && (
        <p className="stand-menu-status" role="status" data-fase={status.fase}>
          {status.fase === 'executando' ? 'Fazendo…' : status.fase === 'ok' ? `Feito: ${status.mensagem}` : `Não deu: ${status.mensagem}`}
        </p>
      )}
      {(!atual || atual.id === 'perguntar') && (
        <form className="stand-menu-texto" onSubmit={enviar}>
          <input
            type="text"
            value={texto}
            maxLength={500}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={motivoSemTexto ?? 'Escreva uma pergunta ao LUCA'}
            aria-label="Pergunta por escrito ao LUCA"
            disabled={Boolean(motivoSemTexto)}
          />
          <button type="submit" disabled={Boolean(motivoSemTexto) || !texto.trim()}>Perguntar</button>
        </form>
      )}
    </section>
  );
}
