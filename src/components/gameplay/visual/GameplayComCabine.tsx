import GameplayKiosk from '../GameplayKiosk';
import { CABINE_MAX_URL, criarCabineGameplayMax } from './cabineMax';
import './cabineVisual.css';

/**
 * Gameplay com a cabine da Visual: o palco carrega a variante com cabine (gancho
 * `modeloUrl` da Direção) e a cabine monta volante, console, banco e fardos.
 * Mesmo chunk lazy do GameplayKiosk (GLTFLoader fica fora do stand).
 */
export default function GameplayComCabine() {
  return (
    <div className="gameplay-com-cabine">
      <GameplayKiosk criarCabine={criarCabineGameplayMax} modeloUrl={CABINE_MAX_URL} />
    </div>
  );
}
