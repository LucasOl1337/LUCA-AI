import { useEffect, useState } from 'react';
import { COMANDOS_CABINE as C } from './comandosCabine';
import { firstStandardPad } from '../sompo/gamepadLoop';
import { configurarPortaMicrofone } from '../../stand-voz/portaMicrofone';

export function useFalaCabine(simulacao: boolean) {
  const [segurando, setSegurando] = useState(false);
  useEffect(() => {
    let tecla = false;
    let frame = 0;
    let foco = true;
    const atualizar = () => {
      const pad = !!firstStandardPad()?.buttons[C.falar.botao]?.pressed;
      const ativo = simulacao && foco && (tecla || pad);
      configurarPortaMicrofone(simulacao, ativo);
      setSegurando(ativo);
    };
    const descer = (e: KeyboardEvent) => {
      if (!simulacao || !(C.falar.teclas as readonly string[]).includes(e.key.toLowerCase()) || e.ctrlKey || e.altKey || e.metaKey) return;
      tecla = true; atualizar();
    };
    const subir = (e: KeyboardEvent) => { if ((C.falar.teclas as readonly string[]).includes(e.key.toLowerCase())) { tecla = false; atualizar(); } };
    const soltar = () => { foco = false; tecla = false; configurarPortaMicrofone(simulacao, false); setSegurando(false); };
    const focar = () => { foco = true; atualizar(); };
    const ler = () => { atualizar(); frame = requestAnimationFrame(ler); };
    atualizar(); frame = requestAnimationFrame(ler);
    window.addEventListener('keydown', descer);
    window.addEventListener('keyup', subir);
    window.addEventListener('blur', soltar);
    window.addEventListener('focus', focar);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', descer);
      window.removeEventListener('keyup', subir);
      window.removeEventListener('blur', soltar);
      window.removeEventListener('focus', focar);
      configurarPortaMicrofone(false, false);
    };
  }, [simulacao]);
  return segurando;
}
