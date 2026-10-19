import { lucaApi } from '@/lib/api';

/**
 * Única porta de escrita do simulador no servidor (histórico, episódio e quadros).
 * No kiosk do /stand a porta não existe: o totem só lê (ADR 0001). O /sompo grava como antes.
 */
export type SompoTelemetryWriter = Pick<
  typeof lucaApi,
  'postSompoTelemetrySimulation' | 'postSompoTelemetryEpisodeStart' | 'postSompoTelemetryEpisodeFinish' | 'postSompoTelemetryEpisodeFrames'
>;

const WRITER: SompoTelemetryWriter = {
  postSompoTelemetrySimulation: (...args) => lucaApi.postSompoTelemetrySimulation(...args),
  postSompoTelemetryEpisodeStart: (...args) => lucaApi.postSompoTelemetryEpisodeStart(...args),
  postSompoTelemetryEpisodeFinish: (...args) => lucaApi.postSompoTelemetryEpisodeFinish(...args),
  postSompoTelemetryEpisodeFrames: (...args) => lucaApi.postSompoTelemetryEpisodeFrames(...args),
};

export function sompoTelemetryWriter({ kiosk }: { kiosk: boolean }): SompoTelemetryWriter | null {
  return kiosk ? null : WRITER;
}
