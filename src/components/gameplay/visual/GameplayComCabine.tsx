import GameplayKiosk from '../GameplayKiosk';
import { criarCabineGameplayMax } from './cabineMax';

/** Gameplay com a cabine da Visual: mesmo chunk lazy do GameplayKiosk (GLTFLoader fica fora do stand). */
export default function GameplayComCabine() {
  return <GameplayKiosk criarCabine={criarCabineGameplayMax} />;
}
