import SompoTruckSimulator from '../SompoTruckSimulator';
import { SOMPO_VEHICLE_SEED, type SompoVehicle } from '../../../shared/sompo-vehicles.js';
import '@/sompo-page.css';

/** Pedaço carregado sob demanda pela Simulação do stand: simulador + CSS do SOMPO, só quando precisa. */
const TRATOR_DO_STAND = SOMPO_VEHICLE_SEED.find((v) => v.id === 'trator-0001') as SompoVehicle;

export default function SimuladorKiosk() {
  return <SompoTruckSimulator source="simulation" vehicle={TRATOR_DO_STAND} kiosk />;
}
