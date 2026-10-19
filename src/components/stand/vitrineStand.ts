import type { VideoStand } from './videosStand';

/**
 * Itens da Vitrine (Q3 a+b): Vídeos do stand intercalados com Telas do app.
 * Ordem aprovada em 19/10: vídeo, Lab, vídeo, Trator agora, vídeo (e os vídeos restantes).
 * Tela do app só lê o que já existe; se não está pronta, a Vitrine pula sem mostrar buraco.
 */

export type TelaDoApp = 'lab' | 'trator';

export type ItemVitrine =
  | { tipo: 'video'; id: string; titulo: string; video: VideoStand }
  | { tipo: TelaDoApp; id: TelaDoApp; titulo: string };

export const TITULO_TELA: Record<TelaDoApp, string> = {
  lab: 'Laboratório · replay de um tombamento (dados de demonstração)',
  trator: 'Agora · o trator do stand pelo sensor',
};

/** Lab toca o replay a 4x até o fim, com teto de 45 s; Trator agora fica 20 s. */
export const LAB_VELOCIDADE = 4;
export const LAB_TETO_MS = 45_000;
export const TRATOR_MS = 20_000;
/** Dado que não chega neste prazo deixa a Tela do app fora da volta. */
export const PRAZO_DADOS_MS = 6_000;

export function montarItens(videos: readonly VideoStand[]): ItemVitrine[] {
  const v = videos.map((video, i): ItemVitrine => ({ tipo: 'video', id: `video-${i}`, titulo: video.titulo, video }));
  const lab: ItemVitrine = { tipo: 'lab', id: 'lab', titulo: TITULO_TELA.lab };
  const trator: ItemVitrine = { tipo: 'trator', id: 'trator', titulo: TITULO_TELA.trator };
  if (v.length === 0) return [lab, trator];
  return [v[0], lab, ...v.slice(1, 2), trator, ...v.slice(2)];
}

/** Motivo por que uma Tela do app está fora da volta agora; vai em `data-pulada` para a equipe. */
export type MotivoPulo = 'carregando' | 'sem_webgl' | 'dados_indisponiveis' | 'prazo' | 'sem_sinal' | `http_${number}`;

export type Prontidao = Partial<Record<TelaDoApp, true | MotivoPulo>>;

export function disponiveis(itens: readonly ItemVitrine[], prontidao: Prontidao): boolean[] {
  return itens.map((item) => item.tipo === 'video' || prontidao[item.tipo] === true);
}

export function descreverPulos(prontidao: Prontidao): string | undefined {
  const pulos = (Object.entries(prontidao) as [TelaDoApp, true | MotivoPulo][])
    .filter(([, valor]) => valor !== true)
    .map(([tela, motivo]) => `${tela}:${motivo}`);
  return pulos.length ? pulos.join(' ') : undefined;
}

/**
 * Trator agora só entra com sinal fresco, conexão viva e fonte real (o sensor no Firebase):
 * leitura do simulador não é "o trator do stand pelo sensor", e "ao vivo" nunca mente.
 */
export function tratorAoVivo(t: { freshness?: string; connection?: { state?: string }; source?: { kind?: string } } | null | undefined): boolean {
  return t?.freshness === 'fresh' && t.connection?.state === 'live' && t.source?.kind === 'firebase';
}
