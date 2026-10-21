import { useAppLocation } from '@/hooks/useAppLocation';
import '@/experience-pages.css';
import { SeletorVoz } from '@/components/totem/SeletorVoz';

export default function TotemPage() {
  const { navigate } = useAppLocation();
  return (
    <section className="experience-page" aria-labelledby="totem-title">
      <header>
        <p className="experience-eyebrow">Experiência do stand</p>
        <h1 id="totem-title">Totem</h1>
        <p>Abra a experiência em tela cheia com a Coruja, a Vitrine e a Simulação. O painel continua acessível ao sair.</p>
      </header>
      <div className="experience-card">
        <h2>Coruja, Vitrine e Simulação</h2>
        <p>No Totem, toque na tela para mostrar a barra de modos. Use L1 e R1 no controle para alternar entre eles. Pressione Shift+Q para voltar ao painel.</p>
        <p>A conversa depende da sessão, da disponibilidade da voz e da permissão de microfone. Sem voz, a Vitrine e a Simulação continuam disponíveis.</p>
        <SeletorVoz />
        <button type="button" className="experience-primary" onClick={() => navigate({ page: 'stand' }, 'push')}>Abrir Totem</button>
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
