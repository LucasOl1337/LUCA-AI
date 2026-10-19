import { lucaApi } from '@/lib/api';
import { EMBUTIDO_NO_STAND } from '@/components/stand/executor/embutido';

/**
 * Única porta de escrita do simulador no servidor (histórico, episódio e quadros).
 * No totem a porta não existe: nem no kiosk do /stand, nem no /sompo aberto pelo
 * modo Site dentro do iframe do /stand (ADR 0001). O /sompo normal grava como antes.
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

export function sompoTelemetryWriter({ kiosk, embutido = EMBUTIDO_NO_STAND }: { kiosk: boolean; embutido?: boolean }): SompoTelemetryWriter | null {
  return kiosk || embutido ? null : WRITER;
}
