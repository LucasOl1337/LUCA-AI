import { useRef } from 'react';
import { Activity, ArrowRight, ArrowUpRight, ChartColumn, Wheat, X } from 'lucide-react';
import { useAppLocation } from '@/hooks/useAppLocation';
import { SOMPO_EXAMPLE_CASES } from '@/lib/sompo-cases';
import SompoBrazilMap from './SompoBrazilMap';
import SompoStoryCards from './SompoStoryCards';
import '@/sompo-welcome.css';

const AREAS = [
  { aba: 'telemetria', icon: Activity, title: 'Telemetria', description: 'Sinais do equipamento e cenários de risco para apoiar a prevenção em tempo real.', detail: 'Sinais em tempo real' },
  { aba: 'casos', icon: Wheat, title: 'Casos agrícolas', description: 'Evidências e ocorrências analisadas com os agentes para reduzir perdas e custos.', detail: `${SOMPO_EXAMPLE_CASES.length} cenários de exemplo` },
  { aba: 'safra', icon: ChartColumn, title: 'Safra', description: 'Compare jornadas, alertas e episódios para decidir o que mudar na próxima safra.', detail: 'Desempenho da frota' },
];

const MISSIONS = [
  { icon: Activity, title: 'Prevenir em tempo real', description: 'Sinais do equipamento e cenários de risco apoiam a ação antes que o dano aconteça.' },
  { icon: Wheat, title: 'Aprender com cada caso', description: 'Evidências viram decisões melhores e custos menores ao longo das safras.' },
];

export default function SompoWelcome() {
  const { navigate } = useAppLocation();
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <section className="sompo-welcome" aria-labelledby="sompo-welcome-title">
      <div className="sompo-welcome-inner">
        <header className="sompo-welcome-brand">
          <span className="sompo-welcome-wordmark"><Wheat aria-hidden="true" />SOMPO<span>Agrícola</span></span>
        </header>

        <div className="sompo-welcome-stage">
          <div className="sompo-welcome-copy">
            <p className="sompo-welcome-eyebrow">Telemetria · Casos agrícolas · Safra</p>
            <h1 id="sompo-welcome-title">Antecipar riscos.<br /><span>Proteger o agro.</span></h1>
            <p className="sompo-welcome-lead">Sinais do campo orientam a prevenção em tempo real. Cada caso reúne inteligência para reduzir perdas e custos ao longo das safras.</p>
            <div className="sompo-welcome-actions">
              <button className="sompo-welcome-proceed" type="button" onClick={() => dialogRef.current?.showModal()} aria-haspopup="dialog">
                Prosseguir <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
          <SompoBrazilMap />
        </div>

        <section className="sompo-welcome-objectives" aria-label="Prevenção e inteligência agrícola">
          {MISSIONS.map(({ icon: Icon, title, description }) => (
            <article key={title}>
              <h2><Icon size={18} aria-hidden="true" />{title}</h2>
              <p>{description}</p>
            </article>
          ))}
        </section>
      </div>

      <SompoStoryCards />

      <dialog className="sompo-entry-dialog" ref={dialogRef} aria-labelledby="sompo-entry-title" aria-describedby="sompo-entry-description" onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}>
        <div className="sompo-entry-content">
          <button type="button" className="sompo-entry-close" aria-label="Fechar escolha de área" onClick={() => dialogRef.current?.close()}><X size={20} /></button>
          <h2 id="sompo-entry-title">Por onde começar?</h2>
          <p id="sompo-entry-description">Acompanhe o campo, analise um caso ou compare o desempenho da frota.</p>
          <div className="sompo-entry-options">
            {AREAS.map(({ aba, icon: Icon, title, description, detail }) => (
              <a href={`/sompo?aba=${aba}`} key={aba} className="sompo-entry-option" onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                dialogRef.current?.close();
                navigate({ page: 'sompo', aba, fonte: '', caso: '', produto: '', gravidade: '', busca: '' });
              }}>
                <Icon size={24} aria-hidden="true" />
                <h3>{title}</h3><p>{description}</p>
                <div className="sompo-entry-option-bottom"><span>{detail}</span><ArrowUpRight size={18} aria-hidden="true" /></div>
              </a>
            ))}
          </div>
        </div>
      </dialog>
    </section>
  );
}
