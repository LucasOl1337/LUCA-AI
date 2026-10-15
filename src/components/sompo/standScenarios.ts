/**
 * Cenários do stand: um Case do Trator MAX com desfecho fixo, acionado por um
 * botão (clique ou controle) e com a pergunta que a M7 roteia para vídeo.
 * Fonte única da `pergunta`: a M3 (`rodar_cenario`) e a M7 importam daqui.
 */
import type { SompoAgriScenarioId } from '../../../shared/sompo-agri-scenarios.js';
import type { StandPadAction } from './gamepadMapping';

export type StandScenarioId = 'stand-obstaculo-a-tempo' | 'stand-inclinacao' | 'stand-reacao-atrasada';

export interface StandScenario {
  id: StandScenarioId;
  caseId: SompoAgriScenarioId;
  desfechoId: string;
  rotulo: string;
  /** Botão do DualSense, para o rótulo na tela. */
  botao: '□' | '△' | '○';
  acao: StandPadAction;
  pergunta: string;
}

export const STAND_SCENARIOS: readonly StandScenario[] = Object.freeze([
  {
    id: 'stand-obstaculo-a-tempo',
    caseId: 'max-front-obstacle',
    desfechoId: 'safe-stop',
    rotulo: 'Obstáculo à frente · alerta a tempo',
    botao: '□',
    acao: 'scenario:a',
    pergunta: 'O que acontece quando o trator chega perto de um obstáculo e o operador reage ao alerta?',
  },
  {
    id: 'stand-inclinacao',
    caseId: 'max-slope-rollover',
    desfechoId: 'controlled-stop',
    rotulo: 'Inclinação perigosa · estabiliza',
    botao: '△',
    acao: 'scenario:b',
    pergunta: 'Como o sistema avisa quando o trator inclina demais num terreno em pendente?',
  },
  {
    id: 'stand-reacao-atrasada',
    caseId: 'max-front-obstacle',
    desfechoId: 'light-touch',
    rotulo: 'Obstáculo à frente · reação atrasada',
    botao: '○',
    acao: 'scenario:c',
    pergunta: 'E se o alerta toca mas o operador demora para frear, o que fica registrado?',
  },
].map((item) => Object.freeze(item as StandScenario)));

export function standScenarioFor(action: StandPadAction): StandScenario | null {
  return STAND_SCENARIOS.find((item) => item.acao === action) ?? null;
}

export function getStandScenario(id: string): StandScenario | null {
  return STAND_SCENARIOS.find((item) => item.id === id) ?? null;
}
