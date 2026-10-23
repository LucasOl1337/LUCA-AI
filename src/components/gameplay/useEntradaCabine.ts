import { useEffect, useState } from 'react';
import { firstStandardPad } from '../sompo/gamepadLoop';
import { familiaControle, type EntradaCabine } from './comandosCabine';

/** Conexão inicial escolhe o pad; depois só atividade real troca o dispositivo. */
export function useEntradaCabine() {
  const [entrada, setEntrada] = useState<EntradaCabine>(() => {
    const pad = firstStandardPad();
    return pad ? familiaControle(pad.id) : 'teclado';
  });
  useEffect(() => {
    let frame = 0;
    let retrato = '';
    const teclado = () => setEntrada('teclado');
    const conectar = () => { const p = firstStandardPad(); setEntrada(p ? familiaControle(p.id) : 'teclado'); };
    const ler = () => {
      const p = firstStandardPad();
      const atual = p ? JSON.stringify([p.axes.map(n => Math.abs(n) > .15 ? Math.round(n * 20) : 0), p.buttons.map(b => b.pressed || b.value > .1)]) : '';
      if (atual !== retrato) {
        if (!p) setEntrada('teclado');
        else if (p.buttons.some(b => b.pressed || b.value > .1) || p.axes.some(n => Math.abs(n) > .15)) setEntrada(familiaControle(p.id));
        retrato = atual;
      }
      frame = requestAnimationFrame(ler);
    };
    frame = requestAnimationFrame(ler);
    window.addEventListener('keydown', teclado);
    window.addEventListener('gamepadconnected', conectar);
    window.addEventListener('gamepaddisconnected', conectar);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', teclado);
      window.removeEventListener('gamepadconnected', conectar);
      window.removeEventListener('gamepaddisconnected', conectar);
    };
  }, []);
  return entrada;
}
