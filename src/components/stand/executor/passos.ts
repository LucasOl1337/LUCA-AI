/**
 * Cada Ação do site vira passos visíveis: achar o Alvo, levar o cursor até ele,
 * destacar e clicar (ou escolher, em <select>). Sem Alvo no prazo, a ação
 * falha com mensagem; não há atalho por rota (decisão Q7 da M3).
 * Roda dentro do iframe do `/stand`: a página certa já foi aberta por ele.
 */
import { VEICULO_STAND, type ValidacaoAcaoSite } from '../../../../shared/stand/acoes-site.ts';
import { getStandScenario } from '../../sompo/standScenarios';
import { apontar, mostrarRotulo, pulsar, type CursorElementos } from './cursor';

export class FalhaAcao extends Error {}

/** O simulador 3D carrega sob demanda: os seletores dele podem levar alguns segundos. */
const PRAZO_SIMULADOR_MS = 20000;
const esperar = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const ROTULO_ABA: Record<string, string> = { telemetria: 'Telemetria', casos: 'Casos agrícolas', safra: 'Safra', veiculos: 'Veículos' };

function visivel(el: Element): el is HTMLElement {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function achar(seletor: string): HTMLElement | null {
  return Array.from(document.querySelectorAll(seletor)).find(visivel) ?? null;
}

async function aguardar<T>(teste: () => T | null | false, prazoMs: number, falha: string): Promise<T> {
  const fim = performance.now() + prazoMs;
  for (;;) {
    const valor = teste();
    if (valor) return valor;
    if (performance.now() > fim) throw new FalhaAcao(falha);
    await esperar(120);
  }
}

export function criarPassos(els: CursorElementos) {
  const narrar = (texto: string) => mostrarRotulo(els.rotulo, texto);

  async function clicar(seletor: string, oQue: string, prazoMs = 4000) {
    const alvo = await aguardar(() => {
      const el = achar(seletor);
      return el && !(el as HTMLButtonElement).disabled ? el : null;
    }, prazoMs, `Não encontrei ${oQue} na tela.`);
    await apontar(els, alvo);
    await pulsar(els);
    alvo.click();
    await esperar(250);
  }

  async function escolher(seletor: string, valor: string, oQue: string, prazoMs = 4000) {
    const alvo = await aguardar(() => {
      const el = achar(seletor) as HTMLSelectElement | null;
      return el && !el.disabled && Array.from(el.options).some((o) => o.value === valor) ? el : null;
    }, prazoMs, `Não encontrei ${oQue} na tela.`);
    await apontar(els, alvo);
    await pulsar(els);
    if (alvo.value !== valor) {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(alvo, valor);
      alvo.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await esperar(300);
  }

  /** O `/stand` abre o SOMPO no iframe antes de mandar a ação (o frame não tem menu). */
  async function garantirSompo() {
    await garantirPagina('/sompo', 'SOMPO');
  }

  async function abrirAba(aba: string) {
    narrar(`Abrindo ${ROTULO_ABA[aba]}`);
    await garantirSompo();
    await esperar(200);
    if (achar(`[data-stand-alvo="aba-${aba}"]`)) {
      await clicar(`[data-stand-alvo="aba-${aba}"]`, `a aba ${ROTULO_ABA[aba]}`);
    } else {
      // Tela de boas-vindas: Prosseguir abre a escolha de área.
      await clicar('.sompo-welcome-proceed', 'o botão Prosseguir');
      await clicar(`a.sompo-entry-option[href="/sompo?aba=${aba}"]`, `a área ${ROTULO_ABA[aba]}`);
    }
    await aguardar(() => new URLSearchParams(window.location.search).get('aba') === aba, 4000, `A aba ${ROTULO_ABA[aba]} não abriu.`);
  }

  async function voltarInicio() {
    narrar('Voltando ao início do SOMPO');
    await garantirSompo();
    if (achar('[data-stand-alvo="inicio-sompo"]')) await clicar('[data-stand-alvo="inicio-sompo"]', 'o link Início SOMPO');
    await aguardar(() => achar('.sompo-welcome-proceed'), 4000, 'A tela de boas-vindas não abriu.');
  }

  async function abrirCaso(id: string) {
    await abrirAba('casos');
    narrar('Abrindo o caso');
    await clicar(`[data-sompo-case="${id}"]`, 'o cartão do caso (confira se há filtro ativo)');
  }

  async function rodarCenario(id: string) {
    const cenario = getStandScenario(id);
    if (!cenario) throw new FalhaAcao(`Cenário ${id} não existe.`);
    await abrirAba('telemetria');
    narrar(`Preparando: ${cenario.rotulo}`);
    const simulador = achar('[data-stand-alvo="fonte-simulador"]');
    if (simulador?.getAttribute('aria-pressed') !== 'true') await clicar('[data-stand-alvo="fonte-simulador"]', 'a origem Simulador');
    await escolher('select[name="sompo-vehicle"]', VEICULO_STAND, 'o seletor de veículo', PRAZO_SIMULADOR_MS);
    await escolher('select[name="sompo-scenario"]', cenario.caseId, 'o seletor de cenário', PRAZO_SIMULADOR_MS);
    await escolher('select[name="sompo-scenario-outcome"]', cenario.desfechoId, 'o seletor de desfecho');
    narrar(`Rodando: ${cenario.rotulo}`);
    await clicar('button[aria-label="Reiniciar cenário"]', 'o botão de reiniciar o cenário');
  }

  /** Clica o botão de `container` cujo texto bate; espera ele aparecer (página lazy). */
  async function clicarTexto(container: string, texto: RegExp, oQue: string, prazoMs = 6000) {
    const alvo = await aguardar(() => {
      const raiz = achar(container);
      const botao = raiz && Array.from(raiz.querySelectorAll('button')).find((b) => texto.test(b.textContent?.trim() ?? '') && visivel(b));
      return botao && !botao.disabled ? botao : null;
    }, prazoMs, `Não encontrei ${oQue} na tela.`);
    await apontar(els, alvo);
    await pulsar(els);
    alvo.click();
    await esperar(250);
  }

  async function garantirPagina(caminho: string, nome: string) {
    await aguardar(() => window.location.pathname === caminho, 4000, `A página ${nome} não está aberta.`);
  }

  // ── Sensor ────────────────────────────────────────────────────────────────
  const SENSOR = '.sensor-operation-controls';

  async function sensorVeiculo(veiculo: string) {
    await garantirPagina('/sensor', 'do sensor');
    narrar(veiculo === 'trator' ? 'Trocando para o Trator MAX' : 'Trocando para o caminhão');
    await clicarTexto('.sensor-choice[aria-label="Veículo da bancada"]', veiculo === 'trator' ? /^Trator MAX$/ : /^Caminhão$/, 'o botão do veículo', 15000);
  }

  async function sensorEnsaio(ensaio: string) {
    await garantirPagina('/sensor', 'do sensor');
    narrar('Escolhendo o ensaio');
    await escolher(`${SENSOR} .sensor-essay-select select`, ensaio, 'o seletor de ensaio', 15000);
    const pausado = achar(`${SENSOR} button[aria-label="Continuar"]`);
    if (pausado) await clicar(`${SENSOR} button[aria-label="Continuar"]`, 'o botão Continuar');
    await clicar(`${SENSOR} button[aria-label="Reiniciar ensaio"]`, 'o botão Repetir');
  }

  async function sensorAjustar(nivel: string) {
    await garantirPagina('/sensor', 'do sensor');
    const alvo = await aguardar(() => achar(`${SENSOR} input[type="range"]`) as HTMLInputElement | null, 15000, 'Não encontrei o controle do ensaio na tela.');
    narrar(`Ajustando ${alvo.getAttribute('aria-label') ?? 'o ensaio'}`);
    await apontar(els, alvo);
    await pulsar(els);
    const padrao = alvo.dataset.padrao;
    const valor = nivel === 'minimo' ? alvo.min : nivel === 'maximo' ? alvo.max : padrao;
    if (valor == null) throw new FalhaAcao('Este ensaio não informa o valor padrão.');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(alvo, valor);
    alvo.dispatchEvent(new Event('input', { bubbles: true }));
    await esperar(300);
    return `${alvo.getAttribute('aria-label')} em ${alvo.closest('label')?.querySelector('b')?.textContent?.trim() ?? valor}.`;
  }

  async function sensorPausa(pausar: boolean) {
    await garantirPagina('/sensor', 'do sensor');
    const rotulo = pausar ? 'Pausar' : 'Continuar';
    if (!achar(`${SENSOR} button[aria-label="${rotulo}"]`)) return;
    narrar(pausar ? 'Pausando o ensaio' : 'Continuando o ensaio');
    await clicar(`${SENSOR} button[aria-label="${rotulo}"]`, `o botão ${rotulo}`, 15000);
  }

  const ROTULO_VISTA: Record<string, string> = { bancada: 'Bancada', veiculo: 'Veículo', chip: 'Chip', massa: 'Massa', dedos: 'Dedos' };

  async function sensorVista(vista: string) {
    await garantirPagina('/sensor', 'do sensor');
    const rotulo = ROTULO_VISTA[vista];
    const vistas = '.sensor-operation-views';
    await aguardar(() => achar(vistas), 15000, 'Não encontrei as vistas da câmera.');
    const tem = () => Array.from(document.querySelectorAll(`${vistas} button`)).some((b) => b.textContent?.trim() === rotulo);
    const dentro = () => achar('.sensor-mems-section button[aria-expanded="true"]');
    // Chip, Massa e Dedos só aparecem em "Por dentro do sensor"; Bancada e Veículo existem nos dois.
    if (!tem() && !dentro()) {
      narrar('Abrindo o sensor por dentro');
      await clicarTexto('.sensor-mems-section', /^Por dentro do sensor$/, 'o botão Por dentro do sensor');
      await aguardar(() => tem(), 4000, `A vista ${rotulo} não apareceu.`);
    }
    narrar(`Vista: ${rotulo}`);
    await clicarTexto(vistas, new RegExp(`^${rotulo}$`), `a vista ${rotulo}`);
  }

  // ── Sonolência ────────────────────────────────────────────────────────────
  const SONO = '.drowsiness-panel';

  async function sonoLigar() {
    await garantirPagina('/sonolencia', 'de sonolência');
    const estado = () => document.querySelector('.drowsiness-page')?.getAttribute('data-state');
    if (estado() === 'running') return 'A câmera já está ligada.';
    narrar('Ligando a webcam');
    await clicarTexto(SONO, /Ativar webcam/, 'o botão Ativar webcam', 10000);
    const fim = await aguardar(() => {
      const atual = estado();
      return atual === 'running' || atual === 'error' ? atual : null;
    }, 30000, 'A câmera não respondeu em 30 s.');
    if (fim === 'error') throw new FalhaAcao(achar(`${SONO} .drowsiness-message`)?.textContent?.trim() || 'A câmera não abriu.');
    return 'Webcam ligada: feche os olhos por 1 segundo para ouvir o alerta.';
  }

  async function sonoDesligar() {
    await garantirPagina('/sonolencia', 'de sonolência');
    if (!achar(`${SONO} .drowsiness-stop`)) return;
    narrar('Desligando a webcam');
    await clicar(`${SONO} .drowsiness-stop`, 'o botão Parar monitor');
  }

  async function sonoSom() {
    await garantirPagina('/sonolencia', 'de sonolência');
    if (achar(`${SONO} .drowsiness-stop`)) throw new FalhaAcao('O teste de som só funciona com a câmera desligada.');
    narrar('Tocando o alerta');
    await clicarTexto(`${SONO} .drowsiness-actions`, /Testar som/, 'o botão Testar som', 10000);
  }

  const SENSIBILIDADE: Record<string, string> = { baixa: 'low', normal: 'normal', alta: 'high' };

  async function sonoSensibilidade(nivel: string) {
    await garantirPagina('/sonolencia', 'de sonolência');
    if (achar(`${SONO} .drowsiness-stop`)) throw new FalhaAcao('Desligue a câmera antes de mudar a sensibilidade.');
    narrar(`Sensibilidade ${nivel}`);
    await escolher(`${SONO} .drowsiness-sensitivity select`, SENSIBILIDADE[nivel], 'o seletor de sensibilidade', 10000);
  }

  // ── Laboratório (só a demonstração local; exemplos gravam e ficam fora, Q8) ──
  async function labDemonstracao() {
    await garantirPagina('/laboratorio', 'do laboratório');
    narrar('Abrindo a demonstração na fazenda');
    const inicio = '.lab-demo-start';
    const biblioteca = 'button.lab-demo-library';
    await aguardar(() => achar(`${inicio} button`) || achar(biblioteca) || achar('.lab-demo-badge'), 15000, 'Demonstração da fazenda indisponível neste totem; veja o Sensor em ação.');
    if (achar('.lab-demo-badge')) return 'DEMONSTRAÇÃO da fazenda já está aberta (percurso sintético).';
    if (achar(`${inicio} button`)) await clicar(`${inicio} button`, 'o botão Ver caminhão em movimento', 15000);
    else await clicar(biblioteca, 'o botão Caminhão na fazenda', 15000);
    await aguardar(() => achar('.lab-demo-badge'), 8000, 'A demonstração da fazenda não abriu; veja o Sensor em ação.');
    return 'DEMONSTRAÇÃO da fazenda rodando: percurso sintético, não é operação real.';
  }

  async function labPausa(pausar: boolean) {
    await garantirPagina('/laboratorio', 'do laboratório');
    const rotulo = pausar ? 'Pausar reprodução' : 'Reproduzir operação';
    if (!achar('.lab-play:not(:disabled)')) throw new FalhaAcao('Nada tocando no laboratório; peça "ver a fazenda em 3D" primeiro.');
    if (!achar(`.lab-play[aria-label="${rotulo}"]`)) return;
    narrar(pausar ? 'Pausando o replay' : 'Continuando o replay');
    await clicar(`.lab-play[aria-label="${rotulo}"]`, 'o botão de reprodução');
  }

  const ROTULO_CAMERA_LAB: Record<string, string> = { acompanhar: 'Acompanhar', superior: 'Superior', livre: 'Livre' };

  async function labCamera(modo: string) {
    await garantirPagina('/laboratorio', 'do laboratório');
    narrar(`Câmera: ${ROTULO_CAMERA_LAB[modo]}`);
    if (modo === 'acompanhar' && !achar('.lab-demo-badge') && !achar('.lab-play:not(:disabled)')) {
      throw new FalhaAcao('A câmera Acompanhar segue a máquina; peça "ver a fazenda em 3D" primeiro.');
    }
    await clicarTexto('.lab-camera-control', new RegExp(`^${ROTULO_CAMERA_LAB[modo]}$`), `a câmera ${ROTULO_CAMERA_LAB[modo]} (acompanhar pede a demonstração aberta)`, 10000);
  }

  return async function executar(acao: Extract<ValidacaoAcaoSite, { ok: true }>): Promise<string> {
    const a = acao.args;
    switch (acao.acao) {
      case 'sensor_escolher_veiculo': await sensorVeiculo(a.veiculo); return a.veiculo === 'trator' ? 'Trator MAX na bancada.' : 'Caminhão na bancada.';
      case 'sensor_rodar_ensaio': await sensorEnsaio(a.ensaio); return `Ensaio ${a.ensaio} rodando.`;
      case 'sensor_ajustar': return sensorAjustar(a.nivel);
      case 'sensor_pausar': await sensorPausa(true); return 'Ensaio pausado.';
      case 'sensor_continuar': await sensorPausa(false); return 'Ensaio rodando.';
      case 'sensor_mostrar_vista': await sensorVista(a.vista); return `Vista ${ROTULO_VISTA[a.vista]}.`;
      case 'sonolencia_ligar_camera': return sonoLigar();
      case 'sonolencia_desligar_camera': await sonoDesligar(); return 'Webcam desligada.';
      case 'sonolencia_testar_som': await sonoSom(); return 'Alerta tocando.';
      case 'sonolencia_sensibilidade': await sonoSensibilidade(a.nivel); return `Sensibilidade ${a.nivel}.`;
      case 'laboratorio_ver_demonstracao': return labDemonstracao();
      case 'laboratorio_pausar': await labPausa(true); return 'Replay pausado.';
      case 'laboratorio_continuar': await labPausa(false); return 'Replay rodando.';
      case 'laboratorio_camera': await labCamera(a.modo); return `Câmera ${ROTULO_CAMERA_LAB[a.modo]}.`;
      case 'sompo_abrir_aba': await abrirAba(a.aba); return `Abri ${ROTULO_ABA[a.aba]}.`;
      case 'sompo_voltar_inicio': await voltarInicio(); return 'Voltei ao início do SOMPO.';
      case 'sompo_abrir_caso': await abrirCaso(a.id); return 'Abri o caso.';
      case 'sompo_rodar_cenario': await rodarCenario(a.id); return `Cenário rodando: ${getStandScenario(a.id)?.rotulo}.`;
      // Trocar de página é do `/stand` (iframe); aqui dentro não há o que clicar.
      case 'abrir_pagina':
      case 'voltar_coruja':
      case 'abrir_simulacao':
      case 'tour_iniciar':
        throw new FalhaAcao('Essa ação é da tela do stand, não da página.');
    }
  };
}
