export interface GeofenceMachineProfile { readonly max_roll_deg: number; readonly synthetic: boolean; readonly [key: string]: unknown }
export interface GeofenceMachine { readonly id: string; readonly label: string; readonly profile: GeofenceMachineProfile }
export const GEOFENCING_MACHINE_PROFILES: Readonly<Record<string, GeofenceMachineProfile>>;
export function getGeofenceMachine(equipmentId: string): GeofenceMachine | null;
