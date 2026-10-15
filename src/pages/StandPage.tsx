import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useAppLocation } from '@/hooks/useAppLocation';
import '@/stand.css';

/** Margem segura padrão (% de cada lado): a moldura de MDF come as bordas. */
export const MARGEM_PADRAO = 6;

export interface AtalhosStand {
  encerrar(): void;
  reiniciar(): void;
  pularVideo(): void;
  demonstrar(): void;
  alternarGrade(): void;
  sair(): void;
}

/** Atalhos da equipe do stand. Devolve true quando a tecla foi usada. */
export function tratarTecla(evento: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>, atalhos: AtalhosStand): boolean {
  if (evento.ctrlKey || evento.metaKey || evento.altKey) return false;
  const tecla = evento.key.toLowerCase();
  if (tecla === 'escape') atalhos.encerrar();
  else if (tecla === 'q' && evento.shiftKey) atalhos.sair();
  else if (evento.shiftKey) return false;
  else if (tecla === 'r') atalhos.reiniciar();
  else if (tecla === 'n') atalhos.pularVideo();
  else if (tecla === 'd') atalhos.demonstrar();
  else if (tecla === 'g') atalhos.alternarGrade();
  else if (tecla === 'f') alternarTelaCheia();
  else return false;
  return true;
}

function alternarTelaCheia() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => undefined);
}

export default function StandPage() {
  const { location, navigate } = useAppLocation();
  const margem = location.margem ? Number(location.margem) : MARGEM_PADRAO;
  const [grade, setGrade] = useState(false);

  const sair = useCallback(() => navigate({ page: 'inicio' }, 'push'), [navigate]);

  useEffect(() => {
    const atalhos: AtalhosStand = {
      encerrar: () => undefined,
      reiniciar: () => undefined,
      pularVideo: () => undefined,
      demonstrar: () => undefined,
      alternarGrade: () => setGrade((g) => !g),
      sair,
    };
    const aoTeclar = (evento: KeyboardEvent) => {
      if (tratarTecla(evento, atalhos)) evento.preventDefault();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [sair]);

  return (
    <main className="stand" style={{ '--stand-margem': `${margem}%` } as CSSProperties} data-grade={grade || undefined} data-margem={`${margem}%`}>
      <div className="stand-seguro">
        <p className="stand-selo" aria-label="Assistente de IA">Assistente de IA</p>
      </div>
    </main>
  );
}
