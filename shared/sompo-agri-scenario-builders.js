/**
 * Construtores do catálogo agrícola (sompo-agri-scenarios.js). Vivem à parte para
 * que um módulo externo (shared/geofencing) declare cenários com a mesma forma sem
 * importar o catálogo inteiro, o que criaria ciclo de import na avaliação.
 */
export const freeze = (value) => Object.freeze(value);
export const phase = (id, label, startMs, endMs) => freeze({ id, label, startMs, endMs });
export const outcome = (id, label, description, keyframes, phases) => freeze({
  id,
  label,
  description,
  keyframes: freeze(keyframes.map(([atMs, values]) => freeze({ atMs, ...values }))),
  ...(phases ? { phases: freeze(phases) } : {}),
});

export function scenario(definition) {
  return freeze({
    distanceSensorPosition: 'front',
    ...definition,
    phases: freeze(definition.phases),
    outcomes: freeze(Object.fromEntries(definition.outcomes.map((item) => [item.id, item]))),
  });
}
