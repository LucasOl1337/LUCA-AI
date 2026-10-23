import { useEffect, useState } from 'react';
import { firstStandardPad } from '../sompo/gamepadLoop';
import './painelCabine.css';

/**
 * Legenda discreta de comandos da Simulação (/stand e /gameplay):
 * exibe ícones SVG nítidos de controle PS5 (DualSense) e de Teclado/Mouse
 * com os atalhos essenciais em pílulas compactas, posicionada acima do
 * cartão do sensor frontal (fora do para-brisa, da barra central, do
 * minimapa e do PIP da câmera).
 */
export function ComandosSimulacao() {
  const [controle, setControle] = useState(false);
  useEffect(() => {
    const conferir = () => setControle(!!firstStandardPad());
    conferir();
    const timer = window.setInterval(conferir, 1000);
    window.addEventListener('gamepadconnected', conferir);
    window.addEventListener('gamepaddisconnected', conferir);
    return () => { window.clearInterval(timer); window.removeEventListener('gamepadconnected', conferir); window.removeEventListener('gamepaddisconnected', conferir); };
  }, []);
  return (
    <aside
      className="gameplay-comandos"
      data-comandos-simulacao=""
      data-entrada={controle ? 'controle' : 'teclado'}
      aria-label="Comandos no controle PS5 e no teclado e mouse"
    >
      <div className="gameplay-comandos-linha" data-dispositivo="ps5">
        <svg
          className="gameplay-comandos-icone"
          data-icone="ps5"
          viewBox="0 0 28 20"
          fill="none"
          aria-hidden="true"
        >
          {/* Silhueta DualSense */}
          <path
            d="M6.4 3.2C8.1 2.4 10.2 2.2 14 2.2C17.8 2.2 19.9 2.4 21.6 3.2C23.6 4.1 25.1 6.7 25.7 10.6C26.2 13.8 25.4 16.8 23.6 17.5C22.1 18.1 20.6 16.7 19.3 14.6L18.4 13.2C17.9 12.4 17.1 12 16.1 12H11.9C10.9 12 10.1 12.4 9.6 13.2L8.7 14.6C7.4 16.7 5.9 18.1 4.4 17.5C2.6 16.8 1.8 13.8 2.3 10.6C2.9 6.7 4.4 4.1 6.4 3.2Z"
            stroke="currentColor"
            strokeWidth="1.55"
            strokeLinejoin="round"
          />
          {/* D-pad esquerdo */}
          <path
            d="M7.6 6.2V9.4M6 7.8H9.2"
            stroke="currentColor"
            strokeWidth="1.45"
            strokeLinecap="round"
          />
          {/* Botões de ação à direita */}
          <circle cx="20.4" cy="6.3" r="0.9" fill="currentColor" />
          <circle cx="20.4" cy="9.3" r="0.9" fill="currentColor" />
          <circle cx="18.9" cy="7.8" r="0.9" fill="currentColor" />
          <circle cx="21.9" cy="7.8" r="0.9" fill="currentColor" />
          {/* Analógicos L e R */}
          <circle cx="11.2" cy="10.1" r="1.45" stroke="currentColor" strokeWidth="1.35" />
          <circle cx="16.8" cy="10.1" r="1.45" stroke="currentColor" strokeWidth="1.35" />
        </svg>
        <span className="gameplay-comandos-rotulo">PS5</span>
        <span className="gameplay-comandos-itens">
          <span><kbd>R2 / RT</kbd> Acelerar · <kbd>L2 / LT</kbd> Frear</span>
          <i aria-hidden="true">·</i>
          <span><kbd>Analógico esquerdo</kbd> Virar</span>
          <i aria-hidden="true">·</i>
          <span><kbd>PS / Home</kbd> Coruja</span>
        </span>
      </div>
      <div className="gameplay-comandos-linha" data-dispositivo="teclado-mouse">
        <svg
          className="gameplay-comandos-icone"
          data-icone="teclado-mouse"
          viewBox="0 0 28 20"
          fill="none"
          aria-hidden="true"
        >
          {/* Teclado compacto */}
          <rect
            x="1.5"
            y="4.2"
            width="16.5"
            height="11.6"
            rx="2.2"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M4.3 7.4H5.7M7.4 7.4H8.8M10.5 7.4H11.9M13.6 7.4H15M4.3 10.1H5.7M7.4 10.1H8.8M10.5 10.1H11.9M13.6 10.1H15M5.8 13H13.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          {/* Mouse ao lado */}
          <rect
            x="20.2"
            y="3.6"
            width="6.3"
            height="12.8"
            rx="3.15"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M23.35 6.2V8.6"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
        <span className="gameplay-comandos-rotulo">Teclado/Mouse</span>
        <span className="gameplay-comandos-itens">
          <span><kbd>W / ↑</kbd> Acelerar · <kbd>S / ↓</kbd> Frear · <kbd>A D / ← →</kbd> Virar</span>
          <i aria-hidden="true">·</i>
          <span><kbd>Espaço</kbd> Freio</span>
          <i aria-hidden="true">·</i>
          <span><kbd>Esc</kbd> Voltar à Coruja no Totem</span>
        </span>
      </div>
    </aside>
  );
}
