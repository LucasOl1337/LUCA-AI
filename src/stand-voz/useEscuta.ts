import { useCallback, useEffect, useRef, useState } from 'react';
import { abrirAudio, type AudioStand } from './audioStand';
import { criarDespertador, pausaAposFalsos, PRE_ROLAGEM_BLOCOS } from './escuta';
import type { Emprestimo } from './sessaoTurnos';
import type { FimDeSessao } from './useSessaoVoz';

/** Depois de uma conversa, a escuta espera isto antes de poder despertar (cauda da voz do LUCA). */
const REFRATARIO_MS = 2500;
/** Teto do áudio guardado entre o despertar e a sessão pronta (8 s, o prazo de conexão). */
const MAX_BLOCOS_GUARDADOS = 160;

/**
 * `ouvindo`: microfone aberto, esperando alguém falar.
 * `precisa_toque`: o navegador não liberou o áudio sem gesto (1º toque do dia).
 * `conversa`: a sessão está com o microfone.
 */
export type EstadoEscuta = 'desligada' | 'abrindo' | 'precisa_toque' | 'ouvindo' | 'pausada' | 'conversa' | 'erro';

export interface UsoEscuta {
  estado: EstadoEscuta;
  /** Toque na tela: libera o áudio (se faltava) e devolve o empréstimo para uma conversa com saudação. */
  aoTocar: () => Emprestimo | null;
}

interface Opcoes {
  /** Coruja na Atração, voz ligada e escuta ligada no servidor. */
  ativa: boolean;
  /** Há sessão de voz (aberta pela escuta ou por toque). */
  emConversa: boolean;
  fim: FimDeSessao | null;
  despertar: (emprestimo: Emprestimo) => void;
}

/**
 * Escuta do stand: microfone aberto na Coruja e conversa aberta pela voz, sem
 * toque. Só o volume é medido no navegador; nada vai ao Scribe antes do despertar.
 */
export function useEscuta({ ativa, emConversa, fim, despertar }: Opcoes): UsoEscuta {
  const [estado, setEstado] = useState<EstadoEscuta>('desligada');
  const audio = useRef<AudioStand | null>(null);
  /** Um por microfone: o piso de ruído aprendido sobrevive às conversas. */
  const despertador = useRef(criarDespertador());
  const guardados = useRef<Int16Array[]>([]);
  const acordada = useRef(false);
  const pausaAte = useRef(0);
  const falsos = useRef(0);
  /** Microfone da escuta que saiu da Coruja no meio de uma conversa: fecha quando ela acabar. */
  const pendenteFechar = useRef<AudioStand | null>(null);
  const despertarRef = useRef(despertar);
  despertarRef.current = despertar;
  const conversaRef = useRef(emConversa);
  conversaRef.current = emConversa;

  const emprestimo = useCallback((saudar: boolean): Emprestimo | null => {
    const a = audio.current;
    if (!a || a.contexto.state === 'closed') return null;
    acordada.current = true;
    return {
      audio: a,
      saudar,
      drenar: () => {
        const blocos = guardados.current;
        guardados.current = [];
        return saudar ? [] : blocos;
      },
    };
  }, []);

  /** Volta a ouvir: liga o despertador ao microfone. */
  const armar = useCallback((a: AudioStand) => {
    guardados.current = [];
    acordada.current = false;
    a.ouvir((pcm, nivel) => {
      const lista = guardados.current;
      lista.push(pcm);
      if (acordada.current) {
        if (lista.length > MAX_BLOCOS_GUARDADOS) lista.shift();
        return;
      }
      if (lista.length > PRE_ROLAGEM_BLOCOS) lista.shift();
      // Na pausa o piso continua aprendendo o ruído; só não desperta.
      const passou = despertador.current.alimentar(nivel, 50);
      if (!passou || conversaRef.current || Date.now() < pausaAte.current) return;
      const e = emprestimo(false);
      if (e) despertarRef.current(e);
    });
  }, [emprestimo]);

  // Abre o microfone ao entrar na Coruja com voz; fecha ao sair.
  useEffect(() => {
    if (!ativa) {
      setEstado('desligada');
      return undefined;
    }
    let vivo = true;
    setEstado('abrindo');
    abrirAudio().then((a) => {
      if (!vivo) return a.fechar();
      audio.current = a;
      despertador.current = criarDespertador();
      armar(a);
      const atualizar = () => { if (vivo && !conversaRef.current) setEstado(a.contexto.state === 'running' ? 'ouvindo' : 'precisa_toque'); };
      a.contexto.addEventListener('statechange', atualizar);
      atualizar();
    }).catch((erro) => {
      console.warn('[stand] escuta sem microfone:', erro instanceof Error ? erro.message : erro);
      if (vivo) setEstado('erro');
    });
    return () => {
      vivo = false;
      // Com conversa em andamento, quem fecha o microfone é o fim da sessão.
      const a = audio.current;
      audio.current = null;
      if (a && !conversaRef.current) a.fechar();
      else if (a) pendenteFechar.current = a;
    };
  }, [ativa, armar]);

  // Conversa começou ou acabou: a escuta empresta e retoma o microfone.
  useEffect(() => {
    if (emConversa) {
      if (audio.current) setEstado('conversa');
      return;
    }
    const sobra = pendenteFechar.current;
    pendenteFechar.current = null;
    sobra?.fechar();
    const a = audio.current;
    if (!a) return;
    if (fim?.detalhe === 'sem_fala') falsos.current += 1;
    else if (fim) falsos.current = 0;
    pausaAte.current = Date.now() + Math.max(REFRATARIO_MS, pausaAposFalsos(falsos.current));
    armar(a);
    setEstado(pausaAposFalsos(falsos.current) > 0 ? 'pausada' : a.contexto.state === 'running' ? 'ouvindo' : 'precisa_toque');
  }, [emConversa, fim, armar]);

  // Pausa por despertares falsos: volta a "ouvindo" quando acaba.
  useEffect(() => {
    if (estado !== 'pausada') return undefined;
    const relogio = window.setTimeout(() => setEstado('ouvindo'), Math.max(0, pausaAte.current - Date.now()));
    return () => window.clearTimeout(relogio);
  }, [estado]);

  const aoTocar = useCallback((): Emprestimo | null => {
    const a = audio.current;
    if (!a || conversaRef.current) return null;
    if (a.contexto.state === 'suspended') void a.contexto.resume();
    falsos.current = 0;
    return emprestimo(true);
  }, [emprestimo]);

  return { estado, aoTocar };
}
