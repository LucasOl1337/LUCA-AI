import { lazy, Suspense } from 'react';
import SompoTruckSimulator from '../SompoTruckSimulator';
import { SOMPO_VEHICLE_SEED, type SompoVehicle } from '../../../shared/sompo-vehicles.js';
import { GameplayOuClassico } from '../gameplay/GameplayOuClassico';
import '@/sompo-page.css';

/** Pedaço carregado sob demanda pela Simulação do stand: simulador + CSS do SOMPO, só quando precisa. */
const TRATOR_DO_STAND = SOMPO_VEHICLE_SEED.find((v) => v.id === 'trator-0001') as SompoVehicle;
const GameplayKiosk = lazy(() => import('../gameplay/GameplayKiosk'));

export type VarianteSimulacao = 'classica' | 'gameplay';

/** `?simulacao=gameplay|classica`. Padrão: clássica, até o gameplay passar na bancada. */
export function varianteSimulacao(busca: string): VarianteSimulacao {
  return new URLSearchParams(busca).get('simulacao') === 'gameplay' ? 'gameplay' : 'classica';
}

export default function SimuladorKiosk() {
  const classico = <SompoTruckSimulator source="simulation" vehicle={TRATOR_DO_STAND} kiosk />;
  if (varianteSimulacao(typeof window === 'undefined' ? '' : window.location.search) !== 'gameplay') return classico;
  return (
    <GameplayOuClassico classico={classico}>
      <Suspense fallback={<p className="stand-simulacao-carregando" role="status">Ligando o trator…</p>}>
        <GameplayKiosk />
      </Suspense>
    </GameplayOuClassico>
  );
}
