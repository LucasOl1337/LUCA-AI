/** Texto único para a posição física do sensor de distância exibido na UI. */
export function sompoDistanceSensorCopy(position) {
  return position === 'rear'
    ? { label: 'Distância traseira', relative: 'atrás' }
    : { label: 'Distância frontal', relative: 'à frente' };
}
