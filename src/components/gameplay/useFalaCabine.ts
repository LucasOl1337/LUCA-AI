import { useEffect, useState } from 'react';
import { COMANDOS_CABINE as C } from './comandosCabine';
import { firstStandardPad } from '../sompo/gamepadLoop';
import { botaoPtt, configurarPortaMicrofone } from '../../stand-voz/portaMicrofone';

/** Campo de texto com foco (pergunta digitada no menu): V é letra, não gesto. */
const digitando = (e: KeyboardEvent) => e.target instanceof Element && Boolean(e.target.closest('input, textarea, [contenteditable]'));

/**
 * Gesto PTT (L1 ou V; com o PTT do Totem, o botão escolhido no /totem, e o L1
 * continua valendo na corrida). Na corrida o portão do microfone sempre exige o gesto;
 * com o PTT do Totem (`ptt`), em todos os modos, mas só com controle conectado:
 * sem ele, ninguém conseguiria falar, então volta a voz livre. O controle vale
 * mesmo com o foco num iframe (modo Site); só a tecla depende do foco da janela.
 */
export function useFalaCabine(simulacao: boolean, ptt = false) {
  const [segurando, setSegurando] = useState(false);
  useEffect(() => {
    let tecla = false;
    let frame = 0;
    let foco = true;
    const botao = ptt ? botaoPtt() : C.falar.botao;
    const atualizar = () => {
      const controle = firstStandardPad();
      const pad = !!controle?.buttons[botao]?.pressed || (simulacao && !!controle?.buttons[C.falar.botao]?.pressed);
      const portao = simulacao || (ptt && !!controle);
      const ativo = portao && ((foco && tecla) || pad);
      configurarPortaMicrofone(portao, ativo);
      setSegurando(ativo);
    };
    const descer = (e: KeyboardEvent) => {
      if (!(simulacao || ptt) || !(C.falar.teclas as readonly string[]).includes(e.key.toLowerCase()) || e.ctrlKey || e.altKey || e.metaKey || digitando(e)) return;
      tecla = true; atualizar();
    };
    const subir = (e: KeyboardEvent) => { if ((C.falar.teclas as readonly string[]).includes(e.key.toLowerCase())) { tecla = false; atualizar(); } };
    const soltar = () => { foco = false; tecla = false; atualizar(); };
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
  }, [simulacao, ptt]);
  return segurando;
}
