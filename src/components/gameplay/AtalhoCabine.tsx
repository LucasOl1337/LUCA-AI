import { Atalho, type BotaoPad } from '../stand/IconePad';
import { COMANDOS_CABINE } from './comandosCabine';
import { useEntradaCabine } from './useEntradaCabine';

/** `Atalho` com a entrada de quem está jogando agora (DualSense mostra o ícone, teclado a tecla). */
export function AtalhoCabine({ botao, tecla, xbox }: { botao: BotaoPad; tecla: string; xbox?: string }) {
  return <Atalho entrada={useEntradaCabine()} botao={botao} tecla={tecla} xbox={xbox} />;
}

/** Troca de câmera: ✕ no DualSense, A no Xbox, C no teclado. */
export function RotuloCamera() {
  const entrada = useEntradaCabine();
  return <Atalho entrada={entrada} botao="cruz" tecla={COMANDOS_CABINE.camera.teclas[0].toUpperCase()} xbox={COMANDOS_CABINE.camera.xbox} />;
}
