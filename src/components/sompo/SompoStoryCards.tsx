import { ArrowRight } from 'lucide-react';
import { useAppLocation } from '@/hooks/useAppLocation';
import { SOMPO_USER_STORIES } from '@/lib/sompo-stories';
import '@/sompo-story-cards.css';

/**
 * Vitrine das user stories no welcome da página SOMPO: três problemas reais
 * da seguradora, cada um abrindo o simulador ao vivo no roteiro que prova.
 */
export default function SompoStoryCards() {
  const { navigate } = useAppLocation();

  return (
    <section className="sompo-stories" aria-labelledby="sompo-stories-title">
      <header className="sompo-stories-head">
        <p className="sompo-stories-eyebrow">O que o LUCA resolve</p>
        <h2 id="sompo-stories-title">Três problemas da seguradora, resolvidos ao vivo.</h2>
        <p>Cada história abre o simulador no roteiro real — com a telemetria correndo junto, não um vídeo.</p>
      </header>
      <div className="sompo-stories-grid">
        {SOMPO_USER_STORIES.map((story) => (
          <article key={story.id} className="sompo-story-card" data-story={story.id}>
            <figure className="sompo-story-card-media" aria-hidden="true">
              <img src={story.image} alt="" loading="lazy" />
            </figure>
            <div className="sompo-story-card-body">
              <span className="sompo-story-card-kicker">{story.kicker}</span>
              <h3>{story.title}</h3>
              <p>{story.solution}</p>
              <div className="sompo-story-card-foot">
                <span className="sompo-story-card-product">{story.product}</span>
                <button
                  type="button"
                  className="sompo-story-card-cta"
                  onClick={() => navigate({
                    page: 'sompo',
                    aba: 'telemetria',
                    cenario: story.lead.scenarioId,
                    desfecho: story.lead.outcomeId,
                  }, 'push')}
                >
                  Ver ao vivo <ArrowRight size={15} aria-hidden="true" />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
