/**
 * Ícone do botão do DualSense ao lado de cada atalho do Totem (Lucas, 24/10:
 * "com ícone do atalho"). SVG próprio, nas cores dos símbolos do PlayStation.
 */

import './iconePad.css';

export type BotaoPad = 'cruz' | 'bola' | 'triangulo' | 'quadrado' | 'ps' | 'options' | 'dpad' | 'l1' | 'r1' | 'l2' | 'r2';

const NOME: Record<BotaoPad, string> = {
  cruz: 'botão X', bola: 'botão bola', triangulo: 'botão triângulo', quadrado: 'botão quadrado',
  ps: 'botão PS', options: 'botão Options', dpad: 'setas', l1: 'botão L1', r1: 'botão R1', l2: 'gatilho L2', r2: 'gatilho R2',
};

function Simbolo({ botao }: { botao: BotaoPad }) {
  switch (botao) {
    case 'cruz': return <path d="M7 7l10 10M17 7L7 17" stroke="#8fb8ff" />;
    case 'bola': return <circle cx="12" cy="12" r="5.6" stroke="#ff6b78" />;
    case 'triangulo': return <path d="M12 6.2l6 10.4H6z" stroke="#43e0a0" strokeLinejoin="round" />;
    case 'quadrado': return <rect x="6.6" y="6.6" width="10.8" height="10.8" rx="0.6" stroke="#ff85dc" />;
    case 'dpad': return <path d="M9.5 4.5h5v5h5v5h-5v5h-5v-5h-5v-5h5z" stroke="#e8edf5" strokeLinejoin="round" strokeWidth="1.6" />;
    case 'ps': return <text x="12" y="15.6" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#e8edf5" stroke="none">PS</text>;
    case 'l1': case 'r1': case 'l2': case 'r2':
      return <text x="12" y="15.6" textAnchor="middle" fontSize="9" fontWeight="800" fill="#e8edf5" stroke="none">{botao.toUpperCase()}</text>;
    case 'options': return <path d="M7.5 9h9M7.5 12h9M7.5 15h9" stroke="#e8edf5" strokeLinecap="round" strokeWidth="1.8" />;
  }
}

export function IconePad({ botao, rotulo }: { botao: BotaoPad; rotulo?: string }) {
  return (
    <span className="icone-pad" data-botao={botao} role="img" aria-label={rotulo ?? NOME[botao]}>
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" strokeWidth="2.4" strokeLinecap="round">
        <circle cx="12" cy="12" r="11" fill="#141821" stroke="rgba(255,255,255,.28)" strokeWidth="1" />
        <Simbolo botao={botao} />
      </svg>
    </span>
  );
}

/**
 * Atalho do jogo: com o DualSense em uso, o ícone do botão; no teclado ou no Xbox, o nome
 * escrito (Lucas, 24/10: nada de "tecla de PC" quando quem joga está no controle).
 */
export function Atalho({ entrada, botao, tecla, xbox }: { entrada: 'teclado' | 'ps' | 'xbox'; botao: BotaoPad; tecla: string; xbox?: string }) {
  if (entrada === 'ps') return <IconePad botao={botao} />;
  return <kbd>{entrada === 'xbox' && xbox ? xbox : tecla}</kbd>;
}

/** Faixa de dicas do Totem quando há controle: o que cada botão faz fora da corrida. */
export function DicasControle() {
  const dicas: [BotaoPad, string][] = [
    ['dpad', 'Mover'], ['cruz', 'Escolher'], ['bola', 'Voltar'], ['triangulo', 'Menu'], ['quadrado', 'Tela cheia'], ['ps', 'Início'],
  ];
  return (
    <ul className="stand-dicas-pad" aria-label="Comandos do controle">
      {dicas.map(([botao, texto]) => <li key={botao}><IconePad botao={botao} /> {texto}</li>)}
    </ul>
  );
}
