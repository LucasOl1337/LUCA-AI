import { lazy, Suspense } from 'react';
import SompoTruckSimulator from '../SompoTruckSimulator';
import { SOMPO_VEHICLE_SEED, type SompoVehicle } from '../../../shared/sompo-vehicles.js';
import { ComandosSimulacao } from '../gameplay/ComandosSimulacao';
import { GameplayOuClassico } from '../gameplay/GameplayOuClassico';
import '@/sompo-page.css';

/** Pedaço carregado sob demanda pela Simulação do stand: simulador + CSS do SOMPO, só quando precisa. */
const TRATOR_DO_STAND = SOMPO_VEHICLE_SEED.find((v) => v.id === 'trator-0001') as SompoVehicle;
// Gameplay com a cabine da Visual (src/components/gameplay/visual/); o kiosk segue recebendo criarCabine.
const carregarGameplay = () => import('../gameplay/visual/GameplayComCabine');
const GameplayKiosk = lazy(carregarGameplay);

/** Baixa o chunk do gameplay junto com o do simulador (a Simulação abre sem espera). */
export function preCarregarGameplay() {
  void carregarGameplay().catch(() => undefined);
}

export type VarianteSimulacao = 'classica' | 'gameplay';

/**
 * `?simulacao=classica|gameplay`. Padrão: o Gameplay (cabine, mapinha do talhão,
 * HUD do sensor), pedido do Lucas em 21/10. O clássico fica de reserva: forçado
 * com `?simulacao=classica` ou automático quando o gameplay cai (`GameplayOuClassico`).
 */
export function varianteSimulacao(busca: string): VarianteSimulacao {
  return new URLSearchParams(busca).get('simulacao') === 'classica' ? 'classica' : 'gameplay';
}

export default function SimuladorKiosk() {
  const classico = (
    <>
      <SompoTruckSimulator source="simulation" vehicle={TRATOR_DO_STAND} kiosk />
      <ComandosSimulacao />
    </>
  );
  if (varianteSimulacao(typeof window === 'undefined' ? '' : window.location.search) === 'classica') return classico;
  return (
    <GameplayOuClassico classico={classico}>
      <Suspense fallback={<p className="stand-simulacao-carregando" role="status">Ligando o trator…</p>}>
        <GameplayKiosk />
      </Suspense>
    </GameplayOuClassico>
  );
}
