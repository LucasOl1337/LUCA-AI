/**
 * Sessão de voz ao vivo do stand (M1) no modo Realtime: provedor xAI Grok
 * Voice, WebSocket com eventos no formato da OpenAI Realtime. Publica no
 * barramento os eventos do contrato `shared/stand/eventos.ts`. Nada de áudio
 * passa pelo servidor do LUCA. O provedor padrão (elevenlabs) usa a
 * `SessaoTurnos`; `abrirSessaoDeVoz` escolhe pela resposta de `/api/stand/sessao`.
 *
 * Fluxo de um turno: VAD do servidor fecha a fala → transcrição pronta →
 * cancelamos a resposta automática, perguntamos ao roteador de vídeos (M7) e
 * pedimos a resposta com a decisão dele numa nota de sistema.
 */
import type { EstadoStand } from '../../shared/stand/eventos.ts';
import { abrirAudio, type AudioStand } from './audioStand';
import { assinarEventosPagina, emitirEventoStand } from './barramento';
import { criarDetectorFala, floatDeBase64Pcm16, LegendaCorrente, base64DePcm16 } from './protocolo';

export interface SessaoServidor {
  provedor: string;
  conexao: { transporte: 'websocket'; url: string; protocolos: string[] };
  sessao: Record<string, unknown>;
  limites: { silencio_s: number; teto_s: number };
}

export type FimSessao = 'encerrada' | 'silencio' | 'teto' | 'erro' | 'desligado';

/** O que a página precisa de qualquer sessão de voz. */
export interface SessaoDeVoz {
  encerrar(motivo?: FimSessao, detalhe?: string): void;
  /** Onde a abertura está: `audio` (microfone), `provedor` (WebSocket) ou `pronta`. */
  readonly etapa: EtapaSessao;
}

export type EtapaSessao = 'audio' | 'provedor' | 'pronta';

interface EventoProvedor { type: string; [chave: string]: any }

const HZ = 24000;
const ROTEAR_MS = 1600;

type DecisaoRoteador = { id: string; decisao: 'tocar' | 'oferecer' } | null;

export async function postar<T>(caminho: string, corpo: unknown): Promise<{ status: number; dados: T }> {
  const resposta = await fetch(caminho, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo ?? {}),
  });
  return { status: resposta.status, dados: (await resposta.json().catch(() => ({}))) as T };
}

export class SessaoVoz implements SessaoDeVoz {
  private ws: WebSocket | null = null;
  private audio: AudioStand | null = null;
  private contexto: AudioContext | null = null;
  private saida: GainNode | null = null;
  private fontes = new Set<AudioBufferSourceNode>();
  private proximoInicio = 0;
  private estado: EstadoStand = 'ocioso';
  private legenda = new LegendaCorrente();
  private detector = criarDetectorFala();
  private respostaAtual: string | null = null;
  private respostaNossa = false;
  /** Respostas cujo áudio e legenda ignoramos (automáticas do VAD ou interrompidas). */
  private canceladas = new Set<string>();
  private ultimaPergunta = '';
  /** Roteamento adiantado: começa a cada transcrição parcial nova, antes do fim da fala. */
  private preRoteio: { texto: string; decisao: Promise<DecisaoRoteador> } | null = null;
  private videosTocados = new Set<string>();
  /** Vídeo na tela: o microfone não vai ao provedor, senão o VAD responde à narração do vídeo. */
  private videoTocando = false;
  private pararNivel: (() => void) | null = null;
  private relogioSilencio = 0;
  private relogioTeto = 0;
  private desligarPagina: (() => void) | null = null;
  private limites = { silencio_s: 20, teto_s: 240 };
  private encerrando = false;
  private terminada = false;
  etapa: EtapaSessao = 'audio';

  constructor(private aoTerminar: (motivo: FimSessao, detalhe?: string) => void = () => {}) {}

  async iniciar(dados: SessaoServidor): Promise<void> {
    try {
      await this.conectar(dados);
    } catch (erro) {
      this.terminar('erro', erro instanceof Error ? erro.message : 'falha_ao_iniciar');
    }
  }

  private async conectar(dados: SessaoServidor): Promise<void> {
    this.limites = dados.limites;

    const audio = await abrirAudio();
    // Encerrada (prazo de conexão ou pedido) enquanto o microfone abria.
    if (this.encerrando || this.terminada) return audio.fechar();
    this.audio = audio;
    this.contexto = audio.contexto;
    this.saida = audio.saida;

    this.etapa = 'provedor';
    const ws = new WebSocket(dados.conexao.url, dados.conexao.protocolos);
    this.ws = ws;
    await new Promise<void>((ok, falha) => {
      ws.onopen = () => ok();
      ws.onerror = () => falha(new Error('websocket_falhou'));
    });
    if (this.terminada) return;
    ws.onmessage = (ev) => this.aoEvento(JSON.parse(String(ev.data)) as EventoProvedor);
    ws.onclose = () => this.terminar(this.encerrando ? 'encerrada' : 'erro', 'conexao_fechada');
    this.enviar({ type: 'session.update', session: dados.sessao });

    audio.ouvir((pcm, nivel) => this.aoMicrofone(pcm, nivel));
    this.pararNivel = audio.medirNivel((nivel) => emitirEventoStand({ tipo: 'nivel_audio', valor: this.estado === 'falando' ? nivel : 0 }));
    this.relogioTeto = window.setTimeout(() => this.encerrar('teto'), this.limites.teto_s * 1000);
    this.armarSilencio();
    this.desligarPagina = assinarEventosPagina((evento) => {
      if (evento.tipo === 'encerrar') this.encerrar();
      if (evento.tipo === 'video_iniciado') {
        this.videoTocando = true;
        window.clearTimeout(this.relogioSilencio);
        this.interromper();
        window.clearTimeout(this.relogioSilencio);
        this.enviar({ type: 'input_audio_buffer.clear' });
      }
      if (evento.tipo === 'video_terminou') {
        this.videoTocando = false;
        this.enviar({ type: 'input_audio_buffer.clear' });
        this.armarSilencio();
        this.notaDeSistema(`O vídeo ${evento.id} terminou. Pergunte, em uma frase, se ficou alguma dúvida.`, true);
      }
      if (evento.tipo === 'reiniciar') this.encerrar();
      // Pergunta do menu (toque ou texto): entra como fala do visitante.
      if (evento.tipo === 'pergunta_texto' && !this.videoTocando) {
        emitirEventoStand({ tipo: 'legenda', texto: evento.texto });
        this.enviar({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: evento.texto }] } });
        this.respostaNossa = true;
        this.enviar({ type: 'response.create' });
      }
    });
    this.etapa = 'pronta';
    this.mudarEstado('ouvindo');
  }

  encerrar(motivo: FimSessao = 'encerrada', detalhe?: string): void {
    this.encerrando = true;
    this.terminar(motivo, detalhe);
  }

  private terminar(motivo: FimSessao, detalhe?: string): void {
    if (this.terminada) return;
    this.terminada = true;
    this.pararNivel?.();
    this.pararNivel = null;
    window.clearTimeout(this.relogioSilencio);
    window.clearTimeout(this.relogioTeto);
    this.desligarPagina?.();
    this.desligarPagina = null;
    this.cortarAudio();
    const ws = this.ws;
    this.ws = null;
    if (ws) { ws.onclose = null; ws.close(); }
    this.audio?.fechar();
    this.audio = null;
    this.contexto = null;
    this.mudarEstado('ocioso');
    emitirEventoStand({ tipo: 'legenda', texto: '' });
    this.aoTerminar(motivo, detalhe);
  }

  private enviar(evento: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(evento));
  }

  private mudarEstado(valor: EstadoStand): void {
    if (this.estado === valor) return;
    this.estado = valor;
    emitirEventoStand({ tipo: 'estado', valor });
  }

  private armarSilencio(): void {
    window.clearTimeout(this.relogioSilencio);
    this.relogioSilencio = window.setTimeout(() => this.encerrar('silencio'), this.limites.silencio_s * 1000);
  }

  private aoMicrofone(pcm: Int16Array, nivel: number): void {
    if (this.videoTocando) {
      // Durante o vídeo a sessão não ouve; o relógio de silêncio também fica parado.
      this.armarSilencio();
      return;
    }
    this.enviar({ type: 'input_audio_buffer.append', audio: base64DePcm16(pcm) });
    // Barge-in local: corta a voz da IA antes de o VAD do servidor confirmar.
    if (this.estado === 'falando' && this.detector.alimentar(nivel, 50)) this.interromper();
    if (this.estado !== 'falando') this.detector.zerar();
  }

  private interromper(): void {
    this.cortarAudio();
    if (this.respostaAtual) {
      this.canceladas.add(this.respostaAtual);
      this.respostaAtual = null;
      this.enviar({ type: 'response.cancel' });
    }
    this.mudarEstado('ouvindo');
  }

  private cortarAudio(): void {
    for (const fonte of this.fontes) { try { fonte.stop(); } catch { /* já parou */ } }
    this.fontes.clear();
    this.proximoInicio = 0;
  }

  private tocarPedaco(base64: string): void {
    if (!this.contexto || !this.saida) return;
    const amostras = floatDeBase64Pcm16(base64);
    if (!amostras.length) return;
    const buffer = this.contexto.createBuffer(1, amostras.length, HZ);
    buffer.copyToChannel(amostras, 0);
    const fonte = this.contexto.createBufferSource();
    fonte.buffer = buffer;
    fonte.connect(this.saida);
    const inicio = Math.max(this.contexto.currentTime + 0.02, this.proximoInicio);
    fonte.start(inicio);
    this.proximoInicio = inicio + buffer.duration;
    this.fontes.add(fonte);
    fonte.onended = () => {
      this.fontes.delete(fonte);
      if (!this.fontes.size && this.estado === 'falando' && !this.respostaAtual) this.mudarEstado('ouvindo');
    };
  }

  private notaDeSistema(texto: string, responder = false): void {
    this.enviar({ type: 'conversation.item.create', item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: texto }] } });
    if (responder) { this.respostaNossa = true; this.enviar({ type: 'response.create' }); }
  }

  /** Consulta o roteador (M7) uma vez por texto; repetir o mesmo texto reaproveita a consulta. */
  private rotear(texto: string): Promise<DecisaoRoteador> {
    if (this.preRoteio?.texto !== texto) {
      const decisao = postar<{ decisao: DecisaoRoteador }>('/api/stand/rotear', { texto })
        .then((r) => r.dados.decisao ?? null)
        .catch(() => null);
      this.preRoteio = { texto, decisao };
    }
    return this.preRoteio.decisao;
  }

  /** Pergunta fechada: espera a decisão do roteador e pede a resposta com ela. */
  private async aoPerguntaTranscrita(texto: string): Promise<void> {
    const limite = new Promise<null>((ok) => window.setTimeout(() => ok(null), ROTEAR_MS));
    const decisao = await Promise.race([this.rotear(texto), limite]);
    if (!this.ws) return;
    if (decisao && !this.videosTocados.has(decisao.id)) {
      this.notaDeSistema(`Roteador: decisao=${decisao.decisao} id=${decisao.id}.`);
    } else {
      this.notaDeSistema('Roteador: nenhum vídeo; responda ao vivo.');
    }
    this.respostaNossa = true;
    this.enviar({ type: 'response.create' });
  }

  private async aoChamarFerramenta(nome: string, idChamada: string, argumentos: string): Promise<void> {
    let args: unknown = {};
    try { args = JSON.parse(argumentos || '{}'); } catch { /* argumentos quebrados viram objeto vazio */ }
    const { dados } = await postar<{ ok: boolean; evento?: { tipo: string; id?: string; acao?: string; args?: Record<string, unknown> } }>(
      '/api/stand/ferramenta', { nome, args },
    ).catch(() => ({ dados: { ok: false, erro: 'servidor_indisponivel' } as { ok: boolean; evento?: undefined } }));
    const evento = dados.evento;
    if (evento?.tipo === 'tocar_video' && evento.id) {
      this.videosTocados.add(evento.id);
      this.videoTocando = true;
      emitirEventoStand({ tipo: 'tocar_video', id: evento.id });
    }
    if (evento?.tipo === 'acao_site' && evento.acao) emitirEventoStand({ tipo: 'acao_site', acao: evento.acao, args: evento.args ?? {} });
    this.enviar({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: idChamada, output: JSON.stringify(dados) } });
    // Depois do vídeo, quem pede a próxima fala é o fim dele (`video_terminou`).
    if (evento?.tipo !== 'tocar_video') { this.respostaNossa = true; this.enviar({ type: 'response.create' }); }
  }

  private aoEvento(m: EventoProvedor): void {
    // Eventos já em trânsito não podem reabrir fala/TTS sobre o vídeo do menu.
    if (this.videoTocando && m.type !== 'error') {
      if (m.type === 'response.created') this.enviar({ type: 'response.cancel' });
      return;
    }
    const idResposta: string | undefined = m.response_id ?? m.response?.id;
    const ignorada = Boolean(idResposta && this.canceladas.has(idResposta));
    switch (m.type) {
      case 'input_audio_buffer.speech_started':
        this.armarSilencio();
        if (this.estado === 'falando') this.interromper();
        this.mudarEstado('ouvindo');
        break;
      case 'conversation.item.input_audio_transcription.completed':
        if (m.transcript) {
          this.ultimaPergunta = String(m.transcript);
          emitirEventoStand({ tipo: 'legenda', texto: this.ultimaPergunta });
          void this.rotear(this.ultimaPergunta);
        }
        break;
      case 'input_audio_buffer.committed':
        this.mudarEstado('pensando');
        break;
      case 'response.created':
        if (!this.respostaNossa) {
          // Resposta automática do VAD: cancelamos e refazemos com a decisão
          // do roteador. A transcrição final já chegou neste ponto.
          if (idResposta) this.canceladas.add(idResposta);
          this.enviar({ type: 'response.cancel' });
          this.mudarEstado('pensando');
          if (this.ultimaPergunta) void this.aoPerguntaTranscrita(this.ultimaPergunta);
          break;
        }
        this.respostaNossa = false;
        this.respostaAtual = idResposta ?? null;
        this.legenda.reiniciar();
        this.mudarEstado('pensando');
        break;
      case 'response.output_audio.delta':
        if (ignorada) break;
        this.mudarEstado('falando');
        this.tocarPedaco(String(m.delta || ''));
        break;
      case 'response.output_audio_transcript.delta':
        if (ignorada) break;
        emitirEventoStand({ tipo: 'legenda', texto: this.legenda.adicionar(String(m.delta || '')) });
        break;
      case 'response.function_call_arguments.done':
        if (!ignorada) void this.aoChamarFerramenta(String(m.name), String(m.call_id), String(m.arguments || '{}'));
        break;
      case 'response.done':
        if (ignorada) {
          this.canceladas.delete(idResposta as string);
          break;
        }
        if (idResposta === this.respostaAtual) this.respostaAtual = null;
        this.armarSilencio();
        if (!this.fontes.size && this.estado !== 'ouvindo') this.mudarEstado('ouvindo');
        break;
      case 'error':
        console.warn('[stand] erro do provedor de voz:', m.error?.code || m.error?.type || 'desconhecido');
        break;
    }
  }
}
