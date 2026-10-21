/**
 * Dentro do Totem a /sonolencia abre num iframe da mesma origem (modo Site).
 * Lá ela não abre a webcam de novo (no Linux só um leitor por vez): pega um
 * clone da câmera que o /stand já mantém ligada (`cameraStand.ts`). Fora do
 * Totem (página solta, outra origem) devolve `undefined` e o monitor abre a
 * câmera como sempre.
 */
const CHAVE = '__lucaCameraStand';

interface CameraEmprestavel { emprestar(): Promise<MediaStream> }

export function cameraDoTotem(janela: Window = window): (() => Promise<MediaStream>) | undefined {
  try {
    const pai = janela.parent;
    if (!pai || pai === janela) return undefined;
    const camera = (pai as unknown as Record<string, unknown>)[CHAVE] as CameraEmprestavel | undefined;
    if (!camera || typeof camera.emprestar !== 'function') return undefined;
    return () => camera.emprestar();
  } catch {
    // Pai de outra origem: sem acesso, segue com a câmera própria.
    return undefined;
  }
}
