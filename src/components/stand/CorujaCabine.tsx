import { useEffect, useRef } from 'react';
import AvatarLuca from './AvatarLuca';
import type { EstadoVoz } from './canal';
import { atalhoFalaCabine } from '../gameplay/comandosCabine';
import { useEntradaCabine } from '../gameplay/useEntradaCabine';
import './corujaCabine.css';

export function CorujaCabine({ voz, legenda, nivel, segurando, disponivel }: {
  voz: EstadoVoz; legenda: string; nivel: { current: number }; segurando: boolean; disponivel: boolean;
}) {
  const entrada = useEntradaCabine();
  const atalho = atalhoFalaCabine(entrada);
  const legendaRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const elemento = legendaRef.current;
    if (elemento) elemento.scrollTop = elemento.scrollHeight;
  }, [legenda]);
  const estado = !disponivel ? 'Voz indisponível' : voz === 'falando' ? 'Falando' : voz === 'pensando' ? 'Pensando' : segurando ? 'Ouvindo' : 'Segure para falar';
  return <aside className="coruja-cabine" aria-label="Coruja na cabine" data-estado={estado}>
    <AvatarLuca variante="coruja-a" voz={voz} nivel={nivel} className="coruja-cabine-avatar" />
    <div><strong>LUCA <span>{estado}</span></strong><p ref={legendaRef}>{legenda || 'Estou aqui para ajudar no percurso.'}</p>
      <small>{disponivel ? `Segure ${atalho} e pergunte` : 'Continue dirigindo normalmente'}</small></div>
  </aside>;
}
