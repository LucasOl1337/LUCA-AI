import { useRef } from 'react';
import { Activity, ArrowRight, ArrowUpRight, Wheat, X } from 'lucide-react';
import { useAppLocation } from '@/hooks/useAppLocation';
import { SOMPO_EXAMPLE_CASES } from '@/lib/sompo-cases';
import SompoBrazilMap from './SompoBrazilMap';
import '@/sompo-welcome.css';

const AREAS = [
  { aba: 'telemetria', icon: Activity, number: '01', title: 'Telemetria', description: 'Acompanhe os sinais do equipamento e explore cenários de risco para apoiar a prevenção em tempo real.', detail: 'OBSERVAR E PREVENIR' },
  { aba: 'casos', icon: Wheat, number: '02', title: 'Casos agrícolas', description: 'Reúna evidências, analise ocorrências com os agentes e construa inteligência para reduzir perdas e custos.', detail: `${SOMPO_EXAMPLE_CASES.length} CENÁRIOS PARA ANALISAR` },
];

export default function SompoWelcome() {
  const { navigate } = useAppLocation();
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <section className="sompo-welcome" aria-labelledby="sompo-welcome-title">
      <div className="sompo-welcome-inner">
        <header className="sompo-welcome-brand">
          <span className="sompo-welcome-wordmark"><Wheat aria-hidden="true" /> SOMPO<span>AGRÍCOLA</span></span>
          <span className="sompo-welcome-signature">INTELIGÊNCIA LUCA<span>/</span>BRASIL</span>
        </header>

        <div className="sompo-welcome-stage">
          <div className="sompo-welcome-copy">
            <p className="sompo-welcome-eyebrow">UM NOVO OLHAR PARA O CAMPO BRASILEIRO</p>
            <h1 id="sompo-welcome-title">Antecipar riscos.<br /><span>Proteger o agro.</span></h1>
            <p className="sompo-welcome-lead">Sinais do campo orientam a prevenção em tempo real. Cada caso reúne inteligência para reduzir perdas e custos ao longo das safras.</p>
            <div className="sompo-welcome-actions">
              <button className="sompo-welcome-proceed" type="button" onClick={() => dialogRef.current?.showModal()} aria-haspopup="dialog">
                Prosseguir <ArrowRight size={18} aria-hidden="true" />
              </button>
              <span>Telemetria e<br />casos agrícolas</span>
            </div>
          </div>
          <SompoBrazilMap />
        </div>

        <section className="sompo-welcome-objectives" aria-label="Prevenção e inteligência agrícola">
          <article>
            <span className="sompo-objective-number">01</span>
            <div><p className="sompo-objective-horizon">AGIR AGORA</p><h2>Prevenir em tempo real.</h2><p>Identificar sinais de risco e apoiar a ação antes que o dano aconteça.</p></div>
          </article>
          <article>
            <span className="sompo-objective-number">02</span>
            <div><p className="sompo-objective-horizon">EVOLUIR A CADA SAFRA</p><h2>Aprender com cada caso.</h2><p>Transformar evidências em decisões melhores e custos menores no longo prazo.</p></div>
          </article>
        </section>
      </div>

      <dialog className="sompo-entry-dialog" ref={dialogRef} aria-labelledby="sompo-entry-title" aria-describedby="sompo-entry-description" onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}>
        <div className="sompo-entry-content">
          <button type="button" className="sompo-entry-close" aria-label="Fechar escolha de área" onClick={() => dialogRef.current?.close()}><X size={20} /></button>
          <p className="sompo-welcome-eyebrow">SOMPO · SEU AMBIENTE DE TRABALHO</p>
          <h2 id="sompo-entry-title">Qual é o próximo passo?</h2>
          <p id="sompo-entry-description">Acompanhe o campo agora ou aprofunde a análise de um caso.</p>
          <div className="sompo-entry-options">
            {AREAS.map(({ aba, icon: Icon, number, title, description, detail }) => (
              <a href={`/sompo?aba=${aba}`} key={aba} className="sompo-entry-option" onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                dialogRef.current?.close();
                navigate({ page: 'sompo', aba, fonte: '', caso: '', produto: '', gravidade: '', busca: '' });
              }}>
                <div className="sompo-entry-option-top"><Icon size={26} /><span>{number}</span></div>
                <h3>{title}</h3><p>{description}</p>
                <div className="sompo-entry-option-bottom"><span>{detail}</span><ArrowUpRight size={21} /></div>
              </a>
            ))}
          </div>
        </div>
      </dialog>
    </section>
  );
}
