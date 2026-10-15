import { criarBarramento, type CanalStand, type EventoStand } from './canal';
import { nivelDeAmostras } from './lipSync';

/**
 * Stub do cérebro de voz até a M1 chegar: toca uma fala local, mede o
 * nível com AnalyserNode a ~30 Hz e solta estado e legenda roteirizados.
 * No fim pede um vídeo do manifesto stub.
 */

export const FALA_TESTE_URL = '/stand/teste/fala-teste.ogg';

/** Frases da fala de teste com o início de cada uma (s), medido no arquivo. */
export const ROTEIRO_FALA: ReadonlyArray<{ inicio: number; texto: string }> = [
  { inicio: 0, texto: 'Oi! Eu sou o LUCA, o assistente de inteligência artificial deste trator.' },
  { inicio: 5.6, texto: 'Eu acompanho a máquina no campo e aviso quando aparece um risco de sinistro.' },
  { inicio: 11.4, texto: 'Quer ver como o dado sai do sensor e chega até a seguradora? Olha esse vídeo.' },
];

/** Manifesto stub: troca pelo shared/stand/videos.json da M7. */
export const VIDEOS_STUB: Record<string, { titulo: string; arquivo: string }> = {
  'pipeline-completo': { titulo: 'Do campo à bancada de agentes (vídeo de teste)', arquivo: '/icons/heartbeat.mp4' },
};

export function legendaNoTempo(segundos: number): string {
  let atual = '';
  for (const frase of ROTEIRO_FALA) if (segundos >= frase.inicio) atual = frase.texto;
  return atual;
}

export interface CanalStub extends CanalStand {
  /** Roda a demonstração inteira; precisa vir de um gesto (tecla) por causa do autoplay. */
  demonstrar(): void;
  parar(): void;
}

export function criarCanalStub(): CanalStub {
  const bus = criarBarramento();
  let audio: HTMLAudioElement | null = null;
  let contexto: AudioContext | null = null;
  const timers: number[] = [];
  const emitir = (evento: EventoStand) => bus.emitir(evento);

  function parar() {
    while (timers.length) window.clearTimeout(timers.pop());
    if (audio) { audio.pause(); audio = null; }
    if (contexto) { void contexto.close(); contexto = null; }
  }

  function falar() {
    audio = new Audio(FALA_TESTE_URL);
    contexto = new AudioContext();
    const fonte = contexto.createMediaElementSource(audio);
    const analisador = contexto.createAnalyser();
    analisador.fftSize = 1024;
    fonte.connect(analisador);
    analisador.connect(contexto.destination);
    const amostras = new Float32Array(analisador.fftSize);
    const atual = audio;
    let ultimaLegenda = '';
    const medir = window.setInterval(() => {
      if (audio !== atual) { window.clearInterval(medir); return; }
      analisador.getFloatTimeDomainData(amostras);
      emitir({ tipo: 'nivel_audio', valor: nivelDeAmostras(amostras) });
      const legenda = legendaNoTempo(atual.currentTime);
      if (legenda !== ultimaLegenda) { ultimaLegenda = legenda; emitir({ tipo: 'legenda', texto: legenda }); }
    }, 33);
    atual.addEventListener('ended', () => {
      window.clearInterval(medir);
      emitir({ tipo: 'nivel_audio', valor: 0 });
      emitir({ tipo: 'tocar_video', id: 'pipeline-completo' });
      emitir({ tipo: 'estado', valor: 'ocioso' });
    }, { once: true });
    emitir({ tipo: 'estado', valor: 'falando' });
    void atual.play();
  }

  function demonstrar() {
    parar();
    emitir({ tipo: 'legenda', texto: '' });
    emitir({ tipo: 'estado', valor: 'ouvindo' });
    timers.push(window.setTimeout(() => emitir({ tipo: 'estado', valor: 'pensando' }), 1800));
    timers.push(window.setTimeout(falar, 3000));
  }

  bus.aoReceberDaPagina((evento) => {
    console.info('[stand] página → cérebro (stub)', evento);
    if (evento.tipo === 'encerrar' || evento.tipo === 'reiniciar') parar();
  });

  return { assinar: bus.assinar, enviar: bus.enviar, demonstrar, parar };
}
