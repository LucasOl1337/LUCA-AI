/**
 * Sessão de voz em turnos do stand (provedor elevenlabs). O ouvido é o Scribe
 * Realtime da ElevenLabs, ligado direto do navegador com token de uso único.
 * Cérebro e voz ficam no servidor: cada pergunta fechada vira um POST em
 * `/api/stand/turno`, que devolve NDJSON com frases, áudio PCM16 a 24 kHz e
 * eventos (vídeo, ação no site). Publica no barramento os mesmos eventos do
 * contrato `shared/stand/eventos.ts` que a sessão Realtime da xAI.
 */
import type { EstadoStand } from '../../shared/stand/eventos.ts';
import { abrirAudio, FilaDeVoz, HZ_STAND, type AudioStand } from './audioStand';
import { assinarEventosPagina, emitirEventoStand } from './barramento';
import { SEM_FALA_MS } from './escuta';
import { base64DePcm16, criarDetectorFala } from './protocolo';
import type { EtapaSessao, FimSessao, SessaoDeVoz, SessaoServidor } from './sessaoVoz';
import { eventoScribe, interrompeFala, lerNdjson, mensagemAudioScribe, pareceEco, vaiAoCerebro, valeEnquantoPensa, type LinhaTurno } from './turnos';

export interface SessaoServidorTurnos extends Omit<SessaoServidor, 'conexao'> {
  conexao: { transporte: 'scribe'; url: string };
  conversa_id: string;
}

type EntradaTurno = { texto: string } | { evento: 'saudacao' } | { evento: 'video_terminou'; id: string } | { evento: 'acao_falhou' };

/**
 * Áudio aberto pela escuta e entregue à sessão no despertar. A sessão não fecha
 * o empréstimo: ao terminar, solta o microfone e a escuta volta a ouvir.
 * `drenar` devolve o que foi ouvido antes da sessão ficar pronta (pré-rolagem).
 */
export interface Emprestimo {
  audio: AudioStand;
  drenar: () => Int16Array[];
  /** Toque na tela com a escuta aberta: microfone emprestado, mas com saudação. */
  saudar?: boolean;
}

// Pedaço de silêncio enviado ao Scribe durante o vídeo: o WebSocket segue vivo
// e o VAD não transcreve a narração do vídeo.
const SILENCIO_50MS = base64DePcm16(new Int16Array(HZ_STAND / 20));
// Barge-in em dois tempos: volume alto no microfone abaixa a voz na hora; só a
// transcrição parcial com palavras de verdade corta. Ruído de feira não mata a resposta.
const VOLUME_ABAIXADO = 0.25;
const ESPERA_CONFIRMAR_MS = 1200;
// Depois da fala, o eco ainda pode chegar transcrito por este tempo.
const CAUDA_ECO_MS = 2500;

export class SessaoTurnos implements SessaoDeVoz {
  etapa: EtapaSessao = 'audio';
  private ws: WebSocket | null = null;
  private audio: AudioStand | null = null;
  private fila: FilaDeVoz | null = null;
  private estado: EstadoStand = 'ocioso';
  private conversaId = '';
  private turno: AbortController | null = null;
  private detector = criarDetectorFala();
  /** O que o LUCA falou no turno atual e no anterior, para descartar o próprio eco. */
  private falado = '';
  private faladoAnterior = '';
  private fimDaFala = 0;
  private relogioVolume = 0;
  private legendas: number[] = [];
  private videoTocando = false;
  private relogioSilencio = 0;
  private relogioTeto = 0;
  private pararNivel: (() => void) | null = null;
  private desligarPagina: (() => void) | null = null;
  private limites = { silencio_s: 20, teto_s: 240 };
  private encerrando = false;
  private terminada = false;
  private emprestado = false;
  /** Último retrato da tela (Ação do site); vai uma vez, junto da próxima pergunta. */
  private tela = '';
  /** Falha chegou com o LUCA falando: a fala pronta entra quando a fila esvaziar. */
  private falhaPendente = false;

  constructor(private aoTerminar: (motivo: FimSessao, detalhe?: string) => void = () => {}) {}

  async iniciar(dados: SessaoServidorTurnos, emprestimo?: Emprestimo): Promise<void> {
    try {
      await this.conectar(dados, emprestimo);
    } catch (erro) {
      this.terminar('erro', erro instanceof Error ? erro.message : 'falha_ao_iniciar');
    }
  }

  private async conectar(dados: SessaoServidorTurnos, emprestimo?: Emprestimo): Promise<void> {
    this.limites = dados.limites;
    this.conversaId = dados.conversa_id;
    this.emprestado = Boolean(emprestimo);
    const audio = emprestimo?.audio ?? await abrirAudio();
    this.audio = audio;
    if (this.terminada) return this.soltarAudio();
    this.fila = new FilaDeVoz(audio, () => this.aoFilaVazia());

    this.etapa = 'provedor';
    const ws = new WebSocket(dados.conexao.url);
    this.ws = ws;
    await new Promise<void>((ok, falha) => {
      ws.onopen = () => ok();
      ws.onerror = () => falha(new Error('scribe_falhou'));
    });
    if (this.terminada) return;
    ws.onmessage = (ev) => {
      try { this.aoScribe(JSON.parse(String(ev.data))); } catch { /* mensagem quebrada */ }
    };
    ws.onclose = () => this.terminar(this.encerrando ? 'encerrada' : 'erro', 'conexao_fechada');

    audio.ouvir((pcm, nivel) => this.aoMicrofone(pcm, nivel));
    // Despertada pela voz: manda ao Scribe o começo da frase, ouvido enquanto a sessão abria.
    for (const pcm of emprestimo?.drenar() ?? []) ws.send(mensagemAudioScribe(base64DePcm16(pcm), HZ_STAND));
    this.pararNivel = audio.medirNivel((nivel) => emitirEventoStand({ tipo: 'nivel_audio', valor: this.estado === 'falando' ? nivel : 0 }));
    this.relogioTeto = window.setTimeout(() => this.encerrar('teto'), this.limites.teto_s * 1000);
    this.desligarPagina = assinarEventosPagina((evento) => {
      if (evento.tipo === 'encerrar' || evento.tipo === 'reiniciar') this.encerrar();
      if (evento.tipo === 'video_terminou') {
        this.videoTocando = false;
        void this.perguntar({ evento: 'video_terminou', id: evento.id });
      }
      // Guardar a tela não mexe no estado da sessão.
      if (evento.tipo === 'tela') this.tela = evento.texto;
      // Falha na tela vira fala pronta na hora; antes da 1ª palavra (despertar
      // discreto, sessão ainda ociosa) não dispara nada.
      if (evento.tipo === 'acao_falhou' && this.estado !== 'ocioso' && !this.videoTocando) {
        if (this.turno || this.fila?.tocando) this.falhaPendente = true;
        else void this.perguntar({ evento: 'acao_falhou' });
      }
    });
    window.addEventListener('pagehide', this.aoSairDaPagina);
    this.etapa = 'pronta';
    if (!emprestimo || emprestimo.saudar) {
      this.mudarEstado('ouvindo');
      void this.perguntar({ evento: 'saudacao' });
      return;
    }
    // Despertar: a pessoa já está falando, então sem saudação. O estado fica
    // ocioso (a Atração continua na tela) até chegar palavra de verdade; barulho
    // que despertou sem fala fecha em SEM_FALA_MS sem a tela piscar.
    this.relogioSilencio = window.setTimeout(() => this.encerrar('silencio', 'sem_fala'), SEM_FALA_MS);
  }

  private aoSairDaPagina = (): void => this.encerrar();

  encerrar(motivo: FimSessao = 'encerrada', detalhe?: string): void {
    this.encerrando = true;
    this.terminar(motivo, detalhe);
  }

  private terminar(motivo: FimSessao, detalhe?: string): void {
    if (this.terminada) return;
    this.terminada = true;
    window.clearTimeout(this.relogioSilencio);
    window.clearTimeout(this.relogioTeto);
    window.clearTimeout(this.relogioVolume);
    this.limparLegendas();
    window.removeEventListener('pagehide', this.aoSairDaPagina);
    this.pararNivel?.();
    this.desligarPagina?.();
    this.turno?.abort();
    this.turno = null;
    this.fila?.cortar();
    const ws = this.ws;
    this.ws = null;
    if (ws) { ws.onclose = null; ws.onmessage = null; ws.close(); }
    this.soltarAudio();
    // Fecha a conversa no servidor (conta os minutos de microfone). keepalive
    // deixa o pedido sair mesmo com a aba fechando.
    if (this.conversaId) {
      void fetch('/api/stand/turno', {
        method: 'POST',
        credentials: 'same-origin',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversa_id: this.conversaId, evento: 'fim' }),
      }).catch(() => {});
    }
    this.mudarEstado('ocioso');
    emitirEventoStand({ tipo: 'legenda', texto: '' });
    this.aoTerminar(motivo, detalhe);
  }

  /** Fecha o áudio próprio; o emprestado só deixa de ser ouvido e volta ao volume cheio. */
  private soltarAudio(): void {
    const audio = this.audio;
    this.audio = null;
    if (!audio) return;
    if (!this.emprestado) return audio.fechar();
    audio.ouvir(() => {});
    audio.saida.gain.cancelScheduledValues(audio.contexto.currentTime);
    audio.saida.gain.value = 1;
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
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    if (this.videoTocando) {
      this.ws.send(mensagemAudioScribe(SILENCIO_50MS, HZ_STAND));
      return;
    }
    this.ws.send(mensagemAudioScribe(base64DePcm16(pcm), HZ_STAND));
    if (this.estado === 'falando' && this.detector.alimentar(nivel, 50)) this.abaixarVoz();
    if (this.estado !== 'falando') this.detector.zerar();
  }

  /** 1º tempo do barge-in: voz baixa até a transcrição confirmar (ou não) a interrupção. */
  private abaixarVoz(): void {
    if (!this.audio || this.relogioVolume) return;
    this.audio.saida.gain.setTargetAtTime(VOLUME_ABAIXADO, this.audio.contexto.currentTime, 0.03);
    this.relogioVolume = window.setTimeout(() => this.restaurarVoz(), ESPERA_CONFIRMAR_MS);
  }

  private restaurarVoz(): void {
    window.clearTimeout(this.relogioVolume);
    this.relogioVolume = 0;
    if (this.audio) this.audio.saida.gain.setTargetAtTime(1, this.audio.contexto.currentTime, 0.05);
  }

  private textoFalado(): string {
    return `${this.faladoAnterior} ${this.falado}`;
  }

  private emFalaOuCauda(): boolean {
    return this.estado === 'falando' || Boolean(this.fila?.tocando) || performance.now() - this.fimDaFala < CAUDA_ECO_MS;
  }

  private aoScribe(mensagem: { message_type?: string; text?: string; error?: string }): void {
    const evento = eventoScribe(mensagem);
    if (evento.tipo === 'erro') {
      console.warn('[stand] erro do Scribe:', evento.codigo);
      if (evento.fatal) this.terminar('erro', evento.codigo);
      return;
    }
    if (evento.tipo === 'outro' || this.videoTocando || !evento.texto) return;
    const durante = this.emFalaOuCauda();
    if (pareceEco(evento.texto, this.textoFalado(), { durante })) return;
    // Resposta a caminho: 1 palavra solta não atropela o turno. Na fala, "sim"
    // curto por cima do fim da pergunta do LUCA é resposta e continua valendo.
    if (this.estado === 'pensando' && !valeEnquantoPensa(evento.texto, this.textoFalado())) return;
    if (evento.tipo === 'parcial') {
      if (this.estado === 'falando' || this.fila?.tocando) {
        // 2º tempo do barge-in: palavras de verdade por cima da fala.
        if (interrompeFala(evento.texto, this.textoFalado())) this.interromper();
        return;
      }
      if (!vaiAoCerebro(evento.texto)) return;
      this.mudarEstado('ouvindo');
      this.armarSilencio();
      emitirEventoStand({ tipo: 'legenda', texto: evento.texto });
      return;
    }
    if (!vaiAoCerebro(evento.texto)) return;
    emitirEventoStand({ tipo: 'legenda', texto: evento.texto });
    void this.perguntar({ texto: evento.texto });
  }

  private interromper(): void {
    this.turno?.abort();
    this.turno = null;
    this.cortarFala();
    this.mudarEstado('ouvindo');
    this.armarSilencio();
  }

  private cortarFala(): void {
    this.fila?.cortar();
    this.limparLegendas();
    this.restaurarVoz();
    this.fimDaFala = performance.now();
  }

  private limparLegendas(): void {
    this.legendas.forEach((r) => window.clearTimeout(r));
    this.legendas = [];
  }

  private aoFilaVazia(): void {
    this.fimDaFala = performance.now();
    this.restaurarVoz();
    if (this.turno || this.videoTocando || this.terminada) return;
    if (this.falhaPendente) {
      this.falhaPendente = false;
      void this.perguntar({ evento: 'acao_falhou' });
      return;
    }
    this.mudarEstado('ouvindo');
    this.armarSilencio();
  }

  /** Um turno: pergunta (ou evento) ao servidor e toca o que voltar, na ordem. */
  private async perguntar(entrada: EntradaTurno): Promise<void> {
    if (this.terminada) return;
    this.turno?.abort();
    this.cortarFala();
    const controle = new AbortController();
    this.turno = controle;
    window.clearTimeout(this.relogioSilencio);
    if ('texto' in entrada) this.mudarEstado('pensando');
    if (this.falado) this.faladoAnterior = this.falado;
    this.falado = '';
    let fraseAudio = '';
    let fimTurno: Extract<LinhaTurno, { t: 'fim' }> | null = null;
    // Pergunta nova leva a falha na linha Tela; a fala pronta não vem mais.
    if ('texto' in entrada) this.falhaPendente = false;
    const tela = 'texto' in entrada ? this.tela : '';
    if (tela) this.tela = '';
    try {
      const resposta = await fetch('/api/stand/turno', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversa_id: this.conversaId, ...entrada, ...(tela ? { tela } : {}) }),
        signal: controle.signal,
      });
      if (resposta.status === 503) {
        const dados = await resposta.json().catch(() => ({})) as { motivo?: string };
        return this.terminar('desligado', dados.motivo || 'stand_desligado');
      }
      if (resposta.status === 404 || resposta.status === 410) return this.terminar('erro', 'conversa_expirada');
      if (!resposta.ok || !resposta.body) throw new Error(`turno_http_${resposta.status}`);
      for await (const linha of lerNdjson(resposta.body)) {
        if (controle.signal.aborted) return;
        fraseAudio = await this.aoLinha(linha, controle, fraseAudio);
        if (linha.t === 'fim') fimTurno = linha;
      }
    } catch (erro) {
      if (controle.signal.aborted) return;
      console.warn('[stand] turno falhou:', erro instanceof Error ? erro.message : erro);
    } finally {
      if (this.turno === controle) this.turno = null;
    }
    if (controle.signal.aborted || this.terminada) return;
    if (fimTurno?.motivo === 'teto_respostas') {
      await this.fila?.terminou();
      return this.encerrar('teto');
    }
    if (!this.fila?.tocando) this.aoFilaVazia();
  }

  /**
   * Trata uma linha do turno. Devolve a frase cuja legenda ainda espera o 1º
   * pedaço de áudio dela (a legenda aparece quando a frase começa a soar).
   */
  private async aoLinha(linha: LinhaTurno, controle: AbortController, legendaPendente: string): Promise<string> {
    switch (linha.t) {
      case 'frase':
        this.falado = `${this.falado} ${linha.texto}`.trim();
        return linha.texto;
      case 'audio': {
        const inicio = this.fila?.tocar(linha.pcm);
        if (inicio == null || !this.fila) return legendaPendente;
        this.mudarEstado('falando');
        if (legendaPendente) {
          const texto = legendaPendente;
          this.legendas.push(window.setTimeout(() => emitirEventoStand({ tipo: 'legenda', texto }), this.fila.msAte(inicio)));
        }
        return '';
      }
      case 'evento': {
        const evento = linha.evento;
        if (evento.tipo === 'tocar_video' && evento.id) {
          // A fala que anuncia o vídeo termina antes de ele entrar.
          await this.fila?.terminou();
          if (controle.signal.aborted) return '';
          this.videoTocando = true;
          window.clearTimeout(this.relogioSilencio);
          this.mudarEstado('ouvindo');
          emitirEventoStand({ tipo: 'tocar_video', id: evento.id });
        }
        if (evento.tipo === 'acao_site' && evento.acao) {
          // Tour: a ação entra quando a fala que a anuncia termina de soar.
          if (evento.apos_fala) {
            await this.fila?.terminou();
            if (controle.signal.aborted) return '';
          }
          emitirEventoStand({ tipo: 'acao_site', acao: evento.acao, args: evento.args ?? {} });
        }
        break;
      }
      case 'aviso':
        console.warn('[stand] aviso do turno:', linha.aviso, linha.detalhe ?? '');
        break;
      case 'fim':
        if (linha.metricas) console.info('[stand] turno', linha.motivo, linha.metricas);
        break;
    }
    return legendaPendente;
  }
}
