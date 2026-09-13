/**
 * User stories SOMPO. O que o simulador de telemetria resolve pra seguradora.
 * Cada story liga um problema real de negócio a um conjunto de cenários do
 * simulador: o card abre o roteiro ao vivo (?cenario=&desfecho=) e a faixa
 * narrativa acompanha as fases com a telemetria sincronizada.
 */

export interface SompoStoryScenario {
  scenarioId: string;
  outcomeId: string;
  label: string;
}

export interface SompoUserStory {
  id: string;
  kicker: string;
  /** O problema, na voz da seguradora. */
  title: string;
  /** Como o LUCA resolve, em uma frase. */
  solution: string;
  image: string;
  product: string;
  /** Cenário que abre quando o card é clicado. */
  lead: SompoStoryScenario;
  /** Todos os roteiros que demonstram a story (chips navegáveis na telemetria). */
  scenarios: SompoStoryScenario[];
  /** Números que provam o valor: leem ao lado do canvas. */
  metrics: { label: string; value: string; detail: string }[];
}

export const SOMPO_USER_STORIES: SompoUserStory[] = [
  {
    id: 'reconstituicao-sinistro',
    kicker: 'Regulação de sinistro',
    title: 'O segurado diz uma coisa. A telemetria mostra outra.',
    solution:
      'O LUCA reconstitui o acidente em 3D com a física do roteiro real (velocidade, frenagem, deslize e impacto) e grava o episódio com frames datados para a regulação.',
    image: '/sompo/sinistro-estrada-rodovia.jpg',
    product: 'Auto rural / casco',
    lead: { scenarioId: 'animal-crossing', outcomeId: 'colisao', label: 'Animal na pista → colisão' },
    scenarios: [
      { scenarioId: 'animal-crossing', outcomeId: 'colisao', label: 'Animal na pista → colisão' },
      { scenarioId: 'aquaplaning', outcomeId: 'saida-de-pista', label: 'Aquaplanagem → saída de pista' },
      { scenarioId: 'tire-blowout', outcomeId: 'tombamento', label: 'Estouro de pneu → tombamento' },
      { scenarioId: 'brake-failure', outcomeId: 'area-de-escape', label: 'Freio falha → área de escape' },
    ],
    metrics: [
      { label: 'Frenagem 80→0', value: '~55 m', detail: 'desaceleração média de ~4,5 m/s² no roteiro' },
      { label: 'Frames datados', value: '5 fases', detail: 'evidência visual anexada ao episódio' },
      { label: 'Desfechos', value: 'por roteiro', detail: 'cada outcome muda a física e a narrativa' },
    ],
  },
  {
    id: 'risco-agro-maquinas',
    kicker: 'Penhor rural e máquinas',
    title: 'Um trator tombado vale R$ 400 mil, e quase ninguém viu como aconteceu.',
    solution:
      'O LUCA simula a operação de máquinas no campo e no celeiro (atolamento, falha hidráulica, tombamento) para precificar o risco e orientar a perícia do penhor.',
    image: '/sompo/penhor-trator-incendio.jpg',
    product: 'Penhor rural / máquinas',
    lead: { scenarioId: 'agri-tractor-rollover', outcomeId: 'side-rollover', label: 'Trator → tombamento lateral' },
    scenarios: [
      { scenarioId: 'agri-tractor-rollover', outcomeId: 'side-rollover', label: 'Trator → tombamento lateral' },
      { scenarioId: 'agri-field-bogging', outcomeId: 'deep-stall', label: 'Colheitadeira → atolamento fundo' },
      { scenarioId: 'agri-hydraulic-failure', outcomeId: 'implement-drop', label: 'Implemento → queda hidráulica' },
      { scenarioId: 'agri-barn-maneuver', outcomeId: 'post-contact', label: 'Ré no celeiro → contato no poste' },
    ],
    metrics: [
      { label: 'Roll do tombamento', value: '−86°', detail: 'ponto sem retorno, deslize e repouso medidos' },
      { label: 'Afundamento', value: '0,7 m', detail: 'rodado patinando com chassi parado' },
      { label: 'Queda do implemento', value: '~0,55 s', detail: 'instante de impacto telemétrico' },
    ],
  },
  {
    id: 'prevencao-frota',
    kicker: 'Prevenção com prova',
    title: 'O motorista que para a tempo não ganha nada. Aqui, vira evidência.',
    solution:
      'O LUCA registra a decisão preventiva telemetrada (pausa no calor, carga reacomodada, operação noturna sinalizada) e a boa prática vira documento a favor do segurado.',
    image: '/sompo/carteira-renovacao-cooperativa.jpg',
    product: 'Frota / transporte',
    lead: { scenarioId: 'shifted-load', outcomeId: 'reacomoda', label: 'Carga deslocada → reacomoda' },
    scenarios: [
      { scenarioId: 'shifted-load', outcomeId: 'reacomoda', label: 'Carga deslocada → reacomoda' },
      { scenarioId: 'hot-weather', outcomeId: 'pausa-preventiva', label: 'Calor extremo → pausa preventiva' },
      { scenarioId: 'hard-braking', outcomeId: 'sem-impacto', label: 'Frenagem de emergência 80→0' },
      { scenarioId: 'agri-night-operation', outcomeId: 'lit-pass', label: 'Colheita noturna → sinalizada' },
    ],
    metrics: [
      { label: 'Detecção de carga', value: '19° parado', detail: 'inclinação flagrada antes do tombamento' },
      { label: 'Pausa no calor', value: '47 °C', detail: 'temperatura prova que agiu antes da falha' },
      { label: 'Frenagem real', value: '~55 m', detail: '80→0 com −6,2 m/s² de pico no roteiro' },
    ],
  },
];

export function findSompoStoryForScenario(scenarioId: string, outcomeId?: string): SompoUserStory | null {
  if (!scenarioId) return null;
  if (outcomeId) {
    for (const story of SOMPO_USER_STORIES) {
      if (story.scenarios.some((item) => item.scenarioId === scenarioId && item.outcomeId === outcomeId)) {
        return story;
      }
    }
  }
  for (const story of SOMPO_USER_STORIES) {
    if (story.scenarios.some((item) => item.scenarioId === scenarioId)) return story;
  }
  return null;
}
