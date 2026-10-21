import GameplayKiosk, { type ExperienciaGameplay } from '../GameplayKiosk';
import { criarTelaPainel } from '../telaPainel';
import { CABINE_MAX_URL, criarCabineMax } from './cabineMax';
import { criarCameraCabineMax } from './cameraCabineMax';
import './cabineVisual.css';

const criarCabineComTela = () => criarCabineMax({ criarTela: criarTelaPainel });

/**
 * Gameplay com a cabine da Visual: o palco carrega a variante com cabine (gancho
 * `modeloUrl` da Direção) e a cabine monta volante, console, banco e fardos.
 * Mesmo chunk lazy do GameplayKiosk (GLTFLoader fica fora do stand).
 */
export default function GameplayComCabine({ seloFps = false, experiencia = 'desafios' }: { seloFps?: boolean; experiencia?: ExperienciaGameplay }) {
  return (
    <div className="gameplay-com-cabine">
      <GameplayKiosk criarCabine={criarCabineComTela} modeloUrl={CABINE_MAX_URL} criarCamera={criarCameraCabineMax} seloFps={seloFps} experiencia={experiencia} />
    </div>
  );
}
