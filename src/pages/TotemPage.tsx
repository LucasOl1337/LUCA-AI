import { useState } from 'react';
import { useAppLocation } from '@/hooks/useAppLocation';
import { guardarPtt, pttDoTotem } from '@/stand-voz/portaMicrofone';
import '@/experience-pages.css';
import { SeletorVoz } from '@/components/totem/SeletorVoz';
import { SeletorMicrofone } from '@/components/totem/SeletorMicrofone';

export default function TotemPage() {
  const { navigate } = useAppLocation();
  const [ptt, setPtt] = useState(() => pttDoTotem());
  return (
    <section className="experience-page" aria-labelledby="totem-title">
      <header>
        <p className="experience-eyebrow">Experiência do stand</p>
        <h1 id="totem-title">Totem</h1>
        <p>Abra a experiência em tela cheia com a Coruja, a Vitrine e a Simulação. O painel continua acessível ao sair.</p>
      </header>
      <div className="experience-card">
        <h2>Coruja, Vitrine e Simulação</h2>
        <p>No Totem, toque na tela para mostrar a barra de modos e escolha um deles, ou peça pela voz. Pressione Shift+Q para voltar ao painel.</p>
        <p>A conversa depende da sessão, da disponibilidade da voz e da permissão de microfone. Sem voz, a Vitrine e a Simulação continuam disponíveis.</p>
        <label className="experience-ptt">
          <input type="checkbox" checked={ptt} onChange={(e) => { setPtt(e.target.checked); guardarPtt(e.target.checked); }} />
          <span>
            <strong>Falar segurando um botão do controle (push to talk)</strong>
            Para lugar barulhento: o LUCA só ouve com o botão escolhido abaixo apertado, pelo microfone do DualSense (no cabo USB). Sem controle conectado, volta a ouvir sozinho.
          </span>
        </label>
        <SeletorMicrofone />
        <SeletorVoz abrirTotem={() => navigate({ page: 'stand' }, 'push')} />
      </div>
      <div className="experience-card">
        <h2>Quer testar a direção livre?</h2>
        <p>A cabine jogável do Trator MAX tem acesso próprio no painel, sem precisar descobrir parâmetros de URL. Para o totem da feira, abra em tela inteira: F5 volta direto à cabine e Shift+Q sai.</p>
        <div className="experience-acoes">
          <button type="button" className="experience-primary" onClick={() => navigate({ page: 'gameplay', quiosque: '1' }, 'push')}>Abrir Gameplay em tela inteira</button>
          <button type="button" className="experience-secondary" onClick={() => navigate({ page: 'gameplay' }, 'push')}>Ir para Gameplay</button>
        </div>
      </div>
    </section>
  );
}
