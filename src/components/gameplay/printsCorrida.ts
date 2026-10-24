import type { RegistroCircuito } from './circuito';

/**
 * Prints da corrida para o laudo em PDF (pedido do Lucas, 24/10: "alguma screenshot").
 * O laço do palco chama `observar` depois da física; quando surge um aviso crítico novo ou
 * o desfecho (batida, atolou, tombou), o próximo quadro renderizado vira JPEG de ~640 px
 * no mesmo rAF do render (o framebuffer WebGL ainda está válido, sem preserveDrawingBuffer).
 * Até 4 prints: os 3 primeiros avisos críticos e o desfecho. Só ilustram o laudo.
 */
export interface PrintCorrida { dataUrl: string; elapsedMs: number; rotulo: string; momento: 'aviso' | 'desfecho' }
const LARGURA = 640;
const QUALIDADE = 0.72;
const MAX_AVISOS = 3;
const ROTULOS_AVISO: Record<string, string> = { feno: 'Aviso de obstáculo', agua: 'Aviso de área alagada', encosta: 'Aviso de encosta', sonolencia: 'Aviso de sonolência' };
const ROTULOS_FIM: Record<string, string> = { colisao: 'Colisão', atolamento: 'Atolamento', tombamento: 'Tombamento', chegada: 'Chegada', abandono: 'Fim da corrida' };

export function criarPrintsCorrida() {
  const prints: PrintCorrida[] = [];
  let pendente: Omit<PrintCorrida, 'dataUrl'> | null = null;
  let episodiosVistos = 0;
  let avisos = 0;
  let fimVisto = false;
  return {
    observar(r: RegistroCircuito) {
      for (; episodiosVistos < r.episodios.length; episodiosVistos++) {
        const ep = r.episodios[episodiosVistos];
        if (ep.gravidade !== 'critico' || avisos >= MAX_AVISOS || pendente) continue;
        avisos += 1;
        pendente = { elapsedMs: Math.round(ep.inicioMs), rotulo: ROTULOS_AVISO[ep.sensor] ?? 'Aviso', momento: 'aviso' };
      }
      if (r.resultado && !fimVisto) {
        fimVisto = true;
        pendente = { elapsedMs: Math.round(r.resultado.tempoMs), rotulo: ROTULOS_FIM[r.resultado.motivo] ?? 'Fim', momento: 'desfecho' };
      }
    },
    aposRender(canvas: HTMLCanvasElement) {
      if (!pendente) return;
      const pedido = pendente; pendente = null;
      try {
        const largura = Math.min(LARGURA, Math.max(1, canvas.width));
        const altura = Math.max(1, Math.round(largura * Math.max(1, canvas.height) / Math.max(1, canvas.width)));
        const alvo = document.createElement('canvas');
        alvo.width = largura; alvo.height = altura;
        const ctx = alvo.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(canvas, 0, 0, largura, altura);
        const dataUrl = alvo.toDataURL('image/jpeg', QUALIDADE);
        if (!dataUrl.startsWith('data:image/jpeg;base64,')) return;
        if (pedido.momento === 'desfecho') prints.push({ ...pedido, dataUrl });
        else prints.splice(Math.min(prints.length, MAX_AVISOS), 0, { ...pedido, dataUrl });
      } catch { /* Sem captura (contexto perdido): o laudo usa o mapa do trajeto. */ }
    },
    lista: (): PrintCorrida[] => prints.slice(0, MAX_AVISOS + 1),
  };
}
export type PrintsCorrida = ReturnType<typeof criarPrintsCorrida>;
