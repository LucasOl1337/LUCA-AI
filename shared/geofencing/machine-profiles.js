/**
 * Limite de inclinação por equipamento (módulo shared/geofencing). Valores de demonstração,
 * não dado do fabricante: o motor mede a margem em graus entre a inclinação lida e este limite.
 * Fica fora de SOMPO_AGRI_EQUIPMENT para o catálogo de equipamentos não carregar campo do geofencing.
 */
import { SOMPO_AGRI_EQUIPMENT } from '../sompo-agri-scenarios.js';

const freeze = (value) => Object.freeze(value);

export const GEOFENCING_MACHINE_PROFILES = freeze({
  tractor: freeze({ max_roll_deg: 25, synthetic: true }),
  harvester: freeze({ max_roll_deg: 15, synthetic: true }),
});

/**
 * Máquina no formato que o motor e o dossiê esperam ({ id, label, profile }), ou null quando o
 * equipamento não tem perfil declarado (nesse caso o perigo de máquina fica fora das regras).
 */
export function getGeofenceMachine(equipmentId) {
  const equipment = SOMPO_AGRI_EQUIPMENT[equipmentId];
  const profile = GEOFENCING_MACHINE_PROFILES[equipmentId];
  if (!equipment || !profile) return null;
  return freeze({ id: equipment.id, label: equipment.label, profile });
}
