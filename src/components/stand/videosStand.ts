import manifesto from '../../../shared/stand/videos.json';
import { VIDEOS_STUB } from './canalStub';

/** Vídeos do stand: o manifesto da M7, mais o vídeo de teste do stub. */

export interface VideoStand { titulo: string; arquivo: string }

const DO_MANIFESTO: Record<string, VideoStand> = Object.fromEntries(
  (manifesto as Array<{ id: string; titulo: string; arquivo: string }>).map((v) => [v.id, { titulo: v.titulo, arquivo: v.arquivo }]),
);

export function videoDoStand(id: string, stub: boolean): VideoStand | undefined {
  if (!id) return undefined;
  return (stub ? VIDEOS_STUB[id] : undefined) ?? DO_MANIFESTO[id];
}
