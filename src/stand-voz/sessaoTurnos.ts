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
import { registrarVoz } from './diagnosticoVoz';
import { microfonePermitido } from './portaMicrofone';
import { contextoDaCorrida } from '../components/gameplay/contextoCorrida';
import { ReferenciaEco } from './ecoPcm';
import { SEM_FALA_MS } from './escuta';
import { visaoTotem } from './visao';
import { base64DePcm16, criarDetectorFala } from './protocolo';
import type { EtapaSessao, FimSessao, SessaoDeVoz, SessaoServidor } from './sessaoVoz';
import {
  JUNTAR_CONTINUACAO_MS, PARCIAL_ESTAVEL_MS, eventoScribe, interrompeFala, juntarPergunta, lerNdjson, mensagemAudioScribe,
  continuaPergunta, mesmaParcial, pareceEco, vaiAoCerebro, valeEnquantoPensa, type LinhaTurno,
} from './turnos';

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
// A voz toca sempre a volume cheio: nada no microfone abaixa o ganho (Lucas,
// 23/10: "a gente nunca pediu pra ter isso"). Só palavras claras cortam a fala.
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
  private referenciaEco = new ReferenciaEco();
  private detectorIndependente = criarDetectorFala({ limiar: 0.015, minimoMs: 100 });
  private falaIndependenteAte = 0;
  private ultimoEco = false;
  private sequenciaTurno = 0;
  private idsTurno = new WeakMap<AbortController, number>();
  /** O que o LUCA falou no turno atual e no anterior, para descartar o próprio eco. */
  private falado = '';
  private faladoAnterior = '';
  private fimDaFala = 0;
  private legendas: number[] = [];
  private videoTocando = false;
  /** Alarme de sono tocando: a fala foi cortada e nenhuma outra entra até ele parar. */
  private alarmeTocando = false;
  private relogioSilencio = 0;
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
  /** Última pergunta enviada, enquanto a resposta não terminou: a continuação junta com ela. */
  private perguntaAberta: { texto: string; em: number } | null = null;
  /** Parcial ainda sem commit e quando o texto dela mudou pela última vez. */
  private parcial = '';
  private parcialMudouEm = 0;
  private parcialFechada = false;
  /** Último estado do gesto PTT visto pelo microfone (sem PTT fica sempre aberto). */
  private portaAberta = true;

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
    this.fila = new FilaDeVoz(audio, () => this.aoFilaVazia(), (pcm, inicio) => this.referenciaEco.agendar(pcm, inicio));

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
    for (const pcm of emprestimo?.drenar() ?? []) {
      ws.send(mensagemAudioScribe(microfonePermitido() ? base64DePcm16(pcm) : SILENCIO_50MS, HZ_STAND));
    }
    this.pararNivel = audio.medirNivel((nivel) => emitirEventoStand({ tipo: 'nivel_audio', valor: this.estado === 'falando' ? nivel : 0 }));
    // ElevenLabs: servidor renova a janela com guarda de sessão e orçamento.
    // Timer absoluto local cortava a pessoa/áudio ativos; inatividade segue20s.
    this.desligarPagina = assinarEventosPagina((evento) => {
      if (evento.tipo === 'encerrar' || evento.tipo === 'reiniciar') this.encerrar();
      if (evento.tipo === 'video_iniciado') {
        // Vídeo escolhido no menu tem a mesma exclusividade do vídeo vindo da voz.
        this.videoTocando = true;
        this.turno?.abort();
        this.turno = null;
        window.clearTimeout(this.relogioSilencio);
        this.cortarFala();
        this.mudarEstado('ouvindo');
      }
      if (evento.tipo === 'alarme_sono') this.aoAlarme(evento.ativo);
      if (evento.tipo === 'video_terminou') {
        this.videoTocando = false;
        void this.perguntar({ evento: 'video_terminou', id: evento.id });
      }
      // Guardar a tela não mexe no estado da sessão.
      if (evento.tipo === 'tela') this.tela = evento.texto;
      // Pergunta do menu (toque ou texto): mesmo turno que a fala transcrita.
      if (evento.tipo === 'pergunta_texto' && !this.videoTocando && !this.alarmeTocando) {
        emitirEventoStand({ tipo: 'legenda', texto: evento.texto });
        void this.perguntar({ texto: evento.texto });
      }
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
    this.limparLegendas();
    window.removeEventListener('pagehide', this.aoSairDaPagina);
    this.pararNivel?.();
    this.desligarPagina?.();
    this.turno?.abort();
    this.turno = null;
    this.fila?.cortar();
    this.referenciaEco = new ReferenciaEco();
    this.falaIndependenteAte = 0;
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

  /** Fecha o áudio próprio; o emprestado só deixa de ser ouvido (o ganho nunca sai de 1). */
  private soltarAudio(): void {
    const audio = this.audio;
    this.audio = null;
    if (!audio) return;
    if (!this.emprestado) return audio.fechar();
    audio.ouvir(() => {});
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
    const soltou = this.aoGesto(microfonePermitido());
    if (this.videoTocando || this.alarmeTocando || !microfonePermitido()) {
      this.falaIndependenteAte = 0;
      this.ws.send(mensagemAudioScribe(SILENCIO_50MS, HZ_STAND, soltou));
      return;
    }
    const eco = this.referenciaEco.analisar(pcm, this.audio?.contexto.currentTime ?? 0);
    if (eco.eco !== this.ultimoEco) {
      registrarVoz('eco_pcm', { ...eco });
      this.ultimoEco = eco.eco;
    }
    // Evidência local para não confundir um “Oi” humano (ou palavras que a
    // narração também contém) com eco textual. Correspondência incerta passa
    // ao ASR, mas só resíduo de voz sustentado libera esse caminho curto.
    const independente = !eco.eco && (!eco.referencia || (eco.correlacao < 0.8 && eco.residual >= 0.015));
    if (this.detectorIndependente.alimentar(independente ? nivel : 0, 50)) {
      this.falaIndependenteAte = performance.now() + 2000;
    }
    // Parcial parada: fecha a frase sem esperar o VAD, que no ruído não acha o silêncio.
    const fechar = this.parcialParada();
    if (fechar) registrarVoz('commit_forcado', { texto: this.parcial });
    // Mantém o relógio/VAD do Scribe vivo sem reenviar a própria voz como entrada.
    this.ws.send(mensagemAudioScribe(eco.eco ? SILENCIO_50MS : base64DePcm16(pcm), HZ_STAND, fechar));
  }

  /**
   * PTT: apertar corta a fala do LUCA na hora (o gesto já diz que a pessoa vai
   * falar); soltar fecha a frase sem esperar o VAD. Devolve se é para mandar o commit.
   */
  private aoGesto(aberta: boolean): boolean {
    if (aberta === this.portaAberta) return false;
    this.portaAberta = aberta;
    if (aberta) {
      if (!this.videoTocando && !this.alarmeTocando && (this.estado === 'falando' || this.fila?.tocando)) {
        registrarVoz('ptt_corta_fala', {});
        this.interromper();
      }
      return false;
    }
    if (!this.parcial || this.parcialFechada) return false;
    this.parcialFechada = true;
    registrarVoz('commit_ptt', { texto: this.parcial });
    return true;
  }

  private parcialParada(): boolean {
    if (!this.parcial || this.parcialFechada || performance.now() - this.parcialMudouEm < PARCIAL_ESTAVEL_MS) return false;
    this.parcialFechada = true;
    return true;
  }

  private anotarParcial(texto: string): void {
    if (mesmaParcial(texto, this.parcial)) return;
    this.parcial = texto;
    this.parcialMudouEm = performance.now();
    this.parcialFechada = false;
  }

  /** Pergunta aberta há pouco e ainda sem resposta completa: o commit novo é continuação dela. */
  private continuacao(): string {
    const aberta = this.perguntaAberta;
    return aberta && performance.now() - aberta.em < JUNTAR_CONTINUACAO_MS ? aberta.texto : '';
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
    if (evento.tipo === 'outro' || this.videoTocando || this.alarmeTocando || !evento.texto) return;
    const durante = this.emFalaOuCauda();
    // Na fala e na cauda o PCM não decide: numa sala com caixa de som o eco da
    // própria voz quase nunca bate 96% com a referência e passava por "fala
    // independente", cortando o LUCA com o próprio texto. Lá só o texto decide.
    const independente = !durante && performance.now() < this.falaIndependenteAte;
    registrarVoz('scribe', { ...evento, estado: this.estado, turno: this.sequenciaTurno, independente });
    if (durante && pareceEco(evento.texto, this.textoFalado(), { durante })) {
      registrarVoz('eco_texto', { texto: evento.texto });
      return;
    }
    // Resposta a caminho: 1 palavra solta não atropela o turno. Na fala, "sim"
    // curto por cima do fim da pergunta do LUCA é resposta e continua valendo.
    // Continuação da pergunta que ainda não teve resposta tocada: vem antes do
    // filtro do "Oi?" solto, porque "Em 3D" (1 palavra de conteúdo) é o resto da frase.
    const aberta = this.continuacao();
    const continua = Boolean(aberta) && this.estado !== 'falando' && !this.fila?.tocando && continuaPergunta(aberta, evento.texto);
    if (!continua && this.estado === 'pensando' && !independente && !valeEnquantoPensa(evento.texto, this.textoFalado())) return;
    if (evento.tipo === 'parcial') {
      // A pessoa continuou a mesma frase depois da hesitação: a resposta ao
      // pedaço não sai; espera o resto e manda a frase inteira.
      if (continua && this.estado === 'pensando') {
        registrarVoz('continuacao', { aberta, parcial: evento.texto });
        this.turno?.abort();
        this.turno = null;
        this.mudarEstado('ouvindo');
        this.armarSilencio();
        this.anotarParcial(evento.texto);
        emitirEventoStand({ tipo: 'legenda', texto: juntarPergunta(aberta, evento.texto) });
        return;
      }
      if (this.estado === 'falando' || this.fila?.tocando) {
        // Barge-in: palavras claras e diferentes do que ele está dizendo.
        if (interrompeFala(evento.texto, this.textoFalado())) this.interromper();
        return;
      }
      if (!continua && !vaiAoCerebro(evento.texto)) return;
      this.mudarEstado('ouvindo');
      this.armarSilencio();
      this.anotarParcial(evento.texto);
      emitirEventoStand({ tipo: 'legenda', texto: continua ? juntarPergunta(aberta, evento.texto) : evento.texto });
      return;
    }
    this.parcial = '';
    // O final não pode contornar a mesma confirmação exigida da parcial.
    if ((this.estado === 'falando' || this.fila?.tocando) && !interrompeFala(evento.texto, this.textoFalado())) return;
    if (!continua && !vaiAoCerebro(evento.texto)) return;
    const pergunta = continua ? juntarPergunta(aberta, evento.texto) : evento.texto;
    emitirEventoStand({ tipo: 'legenda', texto: pergunta });
    void this.perguntar({ texto: pergunta });
  }

  /** Alarme de sono tem prioridade: para a fala (não abaixa) e o turno; o alarme toca sozinho. */
  private aoAlarme(ativo: boolean): void {
    if (ativo === this.alarmeTocando) return;
    this.alarmeTocando = ativo;
    if (!ativo) {
      if (this.estado !== 'ocioso' && !this.turno && !this.fila?.tocando) this.armarSilencio();
      return;
    }
    this.turno?.abort();
    this.turno = null;
    window.clearTimeout(this.relogioSilencio);
    this.cortarFala();
    if (this.estado !== 'ocioso') this.mudarEstado('ouvindo');
  }

  private interromper(): void {
    this.turno?.abort();
    this.turno = null;
    this.cortarFala();
    this.mudarEstado('ouvindo');
    this.armarSilencio();
  }

  private cortarFala(): void {
    this.referenciaEco.cortar(this.audio?.contexto.currentTime ?? 0);
    this.fila?.cortar();
    this.limparLegendas();
    this.fimDaFala = performance.now();
  }

  private limparLegendas(): void {
    this.legendas.forEach((r) => window.clearTimeout(r));
    this.legendas = [];
  }

  private aoFilaVazia(): void {
    this.fimDaFala = performance.now();
    // A resposta tocou inteira: a próxima fala é pergunta nova, não continuação.
    if (!this.turno) this.perguntaAberta = null;
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
    const idTurno = ++this.sequenciaTurno;
    this.idsTurno.set(controle, idTurno);
    this.turno = controle;
    registrarVoz('envio', { turno: idTurno, ...entrada });
    window.clearTimeout(this.relogioSilencio);
    if ('texto' in entrada) this.mudarEstado('pensando');
    this.perguntaAberta = 'texto' in entrada ? { texto: entrada.texto, em: performance.now() } : null;
    if (this.falado) this.faladoAnterior = this.falado;
    this.falado = '';
    let fraseAudio = '';
    let fimTurno: Extract<LinhaTurno, { t: 'fim' }> | null = null;
    // Pergunta nova leva a falha na linha Tela; a fala pronta não vem mais.
    if ('texto' in entrada) this.falhaPendente = false;
    const tela = 'texto' in entrada ? contextoDaCorrida(this.tela) : '';
    // Webcam do Totem: só presença de rosto, detectada no navegador (visao.ts); nunca imagem.
    const camera = 'texto' in entrada ? visaoTotem.ler() : '';
    try {
      const resposta = await fetch('/api/stand/turno', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversa_id: this.conversaId, turno_id: `${this.conversaId}:${idTurno}`, ...entrada, ...(tela ? { tela } : {}), ...(camera ? { camera } : {}) }),
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
        if (linha.t === 'fim') {
          fimTurno = linha;
          registrarVoz('fim_turno', { turno: idTurno, motivo: linha.motivo });
        }
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
        registrarVoz('resposta', { turno: this.idsTurno.get(controle), texto: linha.texto });
        return linha.texto;
      case 'audio': {
        if (this.alarmeTocando) return legendaPendente;
        const inicio = this.fila?.tocar(linha.pcm);
        if (inicio == null || !this.fila) return legendaPendente;
        this.mudarEstado('falando');
        this.perguntaAberta = null;
        if (legendaPendente) {
          const texto = legendaPendente;
          this.legendas.push(window.setTimeout(() => {
            this.falado = `${this.falado} ${texto}`.trim();
            emitirEventoStand({ tipo: 'legenda', texto });
          }, this.fila.msAte(inicio)));
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
          // Roteiro (teste de sono): pausa em silêncio antes da ação, para a pessoa agir na tela.
          if (typeof evento.espera_ms === 'number' && evento.espera_ms > 0) {
            await new Promise<void>((ok) => {
              const relogio = window.setTimeout(ok, Math.min(evento.espera_ms ?? 0, 30_000));
              controle.signal.addEventListener('abort', () => { window.clearTimeout(relogio); ok(); }, { once: true });
            });
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
        if (linha.motivo === 'pausa_limite' && linha.texto) {
          emitirEventoStand({ tipo: 'legenda', texto: linha.texto });
        }
        if (linha.metricas) console.info('[stand] turno', linha.motivo, linha.metricas);
        break;
    }
    return legendaPendente;
  }
}
