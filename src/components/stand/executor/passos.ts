/**
 * Cada Ação do site vira passos visíveis: achar o Alvo, levar o cursor até ele,
 * destacar e clicar (ou escolher, em <select>). Sem Alvo no prazo, a ação
 * falha com mensagem; não há atalho por rota (decisão Q7 da M3).
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

  /** Leva a tela ao painel SOMPO pelo menu lateral, se estiver em outra página. */
  async function garantirSompo() {
    if (window.location.pathname === '/sompo') return;
    await clicar('[data-stand-alvo="menu-sompo"]', 'o menu SOMPO');
    await aguardar(() => window.location.pathname === '/sompo', 4000, 'O painel SOMPO não abriu.');
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

  async function gravarEpisodio() {
    narrar('Gravando o episódio');
    await clicar('[data-sompo-episode-run]', 'o botão Gravar episódio (abra um cenário roteirizado na Telemetria)');
    const fim = await aguardar(() => achar('[data-sompo-episode-done]') || achar('[data-sompo-episode-error]'), 60000, 'O episódio não terminou em 60 s.');
    if (fim.hasAttribute('data-sompo-episode-error')) throw new FalhaAcao(fim.textContent?.trim() || 'O episódio falhou.');
  }

  async function analisarNaBancada() {
    narrar('Enviando para a bancada de agentes');
    if (!achar('[data-sompo-telemetry-run]')) await abrirAba('telemetria');
    await clicar('[data-sompo-telemetry-run]', 'o botão Analisar na bancada', 10000);
    await aguardar(() => window.location.pathname === '/luca-ai', 15000, 'A bancada não abriu.');
  }

  return async function executar(acao: Extract<ValidacaoAcaoSite, { ok: true }>): Promise<string> {
    switch (acao.acao) {
      case 'abrir_aba': await abrirAba(acao.args.aba); return `Abri ${ROTULO_ABA[acao.args.aba]}.`;
      case 'voltar_inicio': await voltarInicio(); return 'Voltei ao início do SOMPO.';
      case 'abrir_caso': await abrirCaso(acao.args.id); return 'Abri o caso.';
      case 'rodar_cenario': await rodarCenario(acao.args.id); return `Cenário rodando: ${getStandScenario(acao.args.id)?.rotulo}.`;
      case 'gravar_episodio': await gravarEpisodio(); return 'Episódio gravado.';
      case 'analisar_na_bancada': await analisarNaBancada(); return 'A bancada de agentes abriu com a telemetria.';
    }
  };
}
