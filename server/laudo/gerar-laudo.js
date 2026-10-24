// Monta o laudo em PDF de um caso do Laboratório: escolhe a análise, a imagem do momento
// crítico (print da corrida ou frame do episódio SOMPO) e desenha. Nenhuma chamada de modelo.
import { dadosDoLaudo, escolherAnalise, nomeArquivoLaudo } from './dados-laudo.js';
import { desenharLaudo } from './desenhar-laudo.js';
import { dimensoesJpeg } from './pdf-simples.js';
import { escolherPrint } from './prints-caso.js';
import { formatLabTime } from '../../shared/lab-telemetry.js';

export const LAUDO_MAX_BYTES = 1.5 * 1024 * 1024;
const MAX_FRAME_BYTES = 600 * 1024;

/**
 * Frame do episódio SOMPO de origem (manifest.source_episode_id): o seq citado pelo veredicto,
 * senão o mais próximo do instante crítico. Só JPEG (os frames do simulador já são JPEG).
 */
function frameDoEpisodio(episodio, parsed, critico) {
  const publicId = parsed.manifest?.source_episode_id;
  if (!episodio || typeof publicId !== 'string' || !publicId) return null;
  try {
    const { frames = [] } = episodio.listar(publicId) ?? {};
    const jpegs = frames.filter((f) => f.mimeType === 'image/jpeg' && f.size <= MAX_FRAME_BYTES);
    if (!jpegs.length) return null;
    const alvo = (critico.frame != null && jpegs.find((f) => f.seq === critico.frame))
      ?? [...jpegs].sort((a, b) => Math.abs((a.offsetMs ?? 0) - (critico.elapsedMs ?? 0)) - Math.abs((b.offsetMs ?? 0) - (critico.elapsedMs ?? 0)))[0];
    const lido = episodio.ler(publicId, alvo.seq);
    if (!dimensoesJpeg(lido?.buffer)) return null;
    const quando = Number.isFinite(alvo.offsetMs) ? ` em ${formatLabTime(alvo.offsetMs)}` : '';
    return { buffer: lido.buffer, rotulo: `Frame ${alvo.seq} do episódio${quando}${alvo.label ? ` · ${alvo.label}` : ''}` };
  } catch { return null; }
}

/** Devolve { pdf, nome, paginas, analiseId }. `episodio` = { listar(publicId), ler(publicId, seq) } ou null. */
export function gerarLaudo({ record, parsed, analiseId = null, directory, episodio = null, agora = new Date() }) {
  const analise = escolherAnalise(record, analiseId);
  const dados = dadosDoLaudo(record, parsed, analise, agora);
  const print = escolherPrint(directory, record, dados.critico.elapsedMs);
  if (print) {
    dados.frame = { buffer: print.buffer, rotulo: `${print.rotulo} · ${formatLabTime(print.elapsedMs)}` };
    dados.critico = { ...dados.critico, elapsedMs: dados.critico.elapsedMs ?? print.elapsedMs };
  } else dados.frame = frameDoEpisodio(episodio, parsed, dados.critico);
  let pdf = desenharLaudo(dados);
  if (pdf.length > LAUDO_MAX_BYTES && dados.frame) { dados.frame = null; pdf = desenharLaudo(dados); }
  return { pdf, nome: nomeArquivoLaudo(record, agora), analiseId: analise?.id ?? null };
}
