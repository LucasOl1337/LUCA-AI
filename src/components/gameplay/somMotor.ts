import type { EstadoGameplay } from './estadoGameplay';
import { somCompartilhado, type SomCompartilhado } from './somCompartilhado';

const limitar = (n: number) => Math.max(0, Math.min(1, n));
/** Mix de fundo fixo: não depende do estado de fala da Coruja. */
export function parametrosMotor(e: EstadoGameplay) {
  const acelerador = limitar(e.comandos.acelerador);
  const velocidade = limitar(e.maquina.velocidadeKph / Math.max(1, e.tetoKph));
  const carga = limitar((0.65 * acelerador + 0.35 * velocidade) * (1 - limitar(e.comandos.freio) * 0.8));
  return { carga, rate: 0.85 + 0.45 * carga, ganho: 0.1 + 0.12 * carga };
}

/** Sobrepõe cauda/início em 150ms: a emenda não depende do padding MP3. */
export function fecharLoop(ctx: BaseAudioContext, original: AudioBuffer): AudioBuffer {
  const sobrepor = Math.min(Math.floor(original.sampleRate * 0.15), Math.floor(original.length / 4));
  const tamanho = original.length - sobrepor;
  const loop = ctx.createBuffer(original.numberOfChannels, tamanho, original.sampleRate);
  for (let c = 0; c < original.numberOfChannels; c++) {
    const fonte = original.getChannelData(c), destino = loop.getChannelData(c);
    destino.set(fonte.subarray(sobrepor));
    for (let i = 0; i < sobrepor; i++) {
      const t = i / sobrepor;
      destino[tamanho - sobrepor + i] = fonte[tamanho + i] * (1 - t) + fonte[i] * t;
    }
  }
  return loop;
}

type Camada = { fonte: AudioBufferSourceNode; ganho: GainNode };
export function criarSomMotor(som: SomCompartilhado = somCompartilhado) {
  let buffers: AudioBuffer[] | null = null;
  let carregando: Promise<void> | null = null;
  let camadas: Camada[] = [];
  let encerrado = false;
  let geracao = 0;
  const carregar = (ctx: AudioContext) => {
    carregando ??= Promise.all(['lenta', 'carga'].map(async (nome) => {
      const r = await fetch(`/audio/trator/${nome}.mp3`);
      if (!r.ok) throw new Error('motor_asset_indisponivel');
      return fecharLoop(ctx, await ctx.decodeAudioData(await r.arrayBuffer()));
    })).then((b) => { buffers = b; }).catch(() => { carregando = null; });
    return carregando;
  };
  const parar = () => {
    geracao++;
    for (const c of camadas) { c.fonte.stop(); c.fonte.disconnect(); c.ganho.disconnect(); }
    camadas = [];
  };
  const atualizar = (e: EstadoGameplay, pausado = false) => {
    if (encerrado || pausado || e.fase !== 'dirigindo') { if (camadas.length) parar(); return; }
    const ctx = som.obter();
    if (!ctx) return;
    if (!buffers) { void carregar(ctx); return; }
    if (ctx.state !== 'running') { void som.destravar(); return; }
    if (!camadas.length) {
      camadas = buffers.map((buffer) => {
        const fonte = ctx.createBufferSource(), ganho = ctx.createGain();
        fonte.buffer = buffer; fonte.loop = true; ganho.gain.value = 0;
        // Fundo contínuo fora do portão dos efeitos: nunca ducking da fala/motor.
        fonte.connect(ganho); ganho.connect(ctx.destination); fonte.start();
        return { fonte, ganho };
      });
    }
    const p = parametrosMotor(e), agora = ctx.currentTime;
    camadas.forEach((c, i) => {
      c.fonte.playbackRate.setTargetAtTime(p.rate, agora, 0.12);
      c.ganho.gain.setTargetAtTime(p.ganho * (i ? Math.sin(p.carga * Math.PI / 2) : Math.cos(p.carga * Math.PI / 2)), agora, 0.12);
    });
    return { ...p, geracao, tocando: true };
  };
  return { atualizar, parar, desmontar() { encerrado = true; parar(); }, carregar() { const ctx = som.obter(); return ctx ? carregar(ctx) : Promise.resolve(); } };
}
