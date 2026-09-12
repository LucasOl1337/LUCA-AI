/**
 * Converte uma resposta por segundo em um fator de interpolação independente
 * da taxa de quadros. Assim a câmera e a pose não ficam para trás em GPUs lentas.
 */
export function frameDamping(deltaSeconds, responsePerSecond) {
  if (!Number.isFinite(deltaSeconds) || !Number.isFinite(responsePerSecond)) return 1;
  return 1 - Math.exp(-Math.max(0, deltaSeconds) * Math.max(0, responsePerSecond));
}
