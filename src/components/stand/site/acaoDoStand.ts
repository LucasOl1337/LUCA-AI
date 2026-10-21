/**
 * Ação do site → o que o `/stand` faz (grill Totem-Site r1, Q4). Puro.
 *
 * `abrir_pagina` e `voltar_coruja` trocam o modo do stand (iframe da página,
 * mapa fechado `PAGINAS_SITE`, sem URL do modelo). Os controles
 * `<pagina>_<verbo>` abrem a página deles, se outra estiver na tela, e vão ao
 * Executor dentro do iframe, que valida de novo e clica com o cursor visível.
 */
import { PAGINAS_SITE, paginaDaAcao, validarAcaoSite, type PaginaSite } from '../../../../shared/stand/acoes-site.ts';
import type { EntradaModo, Modo } from '../modoStand';

/** Entradas de modo que a voz pode pedir: abrir/fechar página e ir pra Simulação. */
export type EntradaModoDaVoz = Extract<EntradaModo, { tipo: 'abrir_pagina' } | { tipo: 'voltar_coruja' }> | { tipo: 'ir'; modo: 'simulacao' };

export type PassoStand =
  | { tipo: 'modo'; entrada: EntradaModoDaVoz }
  | { tipo: 'executor'; caminho: string; acao: string; args: Record<string, string> };

export type PlanoStand = { ok: true; passos: PassoStand[] } | { ok: false; motivo: string };

export function caminhoDaPagina(pagina: PaginaSite): string {
  return PAGINAS_SITE[pagina];
}

export function planejarAcao(acao: unknown, args: unknown, atual: { modo: Modo; pagina: PaginaSite | null }): PlanoStand {
  const validado = validarAcaoSite(acao, args ?? {});
  if (!validado.ok) return { ok: false, motivo: validado.motivo };
  if (validado.acao === 'abrir_pagina') {
    return { ok: true, passos: [{ tipo: 'modo', entrada: { tipo: 'abrir_pagina', pagina: validado.args.pagina as PaginaSite } }] };
  }
  if (validado.acao === 'voltar_coruja') return { ok: true, passos: [{ tipo: 'modo', entrada: { tipo: 'voltar_coruja' } }] };
  // "Testar o simulador": o stand vai direto pro modo Simulação (o Trator MAX no controle).
  if (validado.acao === 'abrir_simulacao') return { ok: true, passos: [{ tipo: 'modo', entrada: { tipo: 'ir', modo: 'simulacao' } }] };
  // O tour é do cérebro: ele manda as ações do roteiro uma a uma.
  if (validado.acao === 'tour_iniciar') return { ok: false, motivo: 'O tour é conduzido pela voz do stand, passo a passo.' };
  const pagina = paginaDaAcao(validado.acao);
  if (!pagina) return { ok: false, motivo: `A ação ${validado.acao} não tem página.` };
  const executor: PassoStand = { tipo: 'executor', caminho: caminhoDaPagina(pagina), acao: validado.acao, args: validado.args };
  if (atual.modo === 'site' && atual.pagina === pagina) return { ok: true, passos: [executor] };
  return { ok: true, passos: [{ tipo: 'modo', entrada: { tipo: 'abrir_pagina', pagina } }, executor] };
}

export interface DepsPlano {
  despacharModo(entrada: EntradaModoDaVoz): void;
  /** Espera o Executor do iframe responder no caminho certo (com o retrato da página, se mandar). */
  aguardarExecutor(caminho: string): Promise<boolean | { retrato?: string }>;
  enviarAcaoSite(acao: string, args: Record<string, unknown>): Promise<{ ok: boolean; mensagem: string; retrato?: string }>;
}

export interface ResultadoPlano { ok: boolean; mensagem: string; retrato?: string }

/**
 * Linha `Tela:` que volta ao cérebro: o que a ação fez e o que a página mostra.
 * Uma linha só, até 200 caracteres (o servidor corta de novo, em 300).
 */
export function linhaDaTela(r: ResultadoPlano): string {
  const feito = r.ok ? r.mensagem : `a ação falhou: ${r.mensagem}`;
  const linha = [feito, r.retrato && `Mostra: ${r.retrato}`].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return linha.length > 200 ? `${linha.slice(0, 199).trimEnd()}…` : linha;
}

/**
 * Executa o plano na ordem. Página que não carrega volta pra Coruja; controle
 * que falha deixa a página na tela e devolve a mensagem para o aviso da equipe.
 */
export async function executarPlano(plano: PlanoStand, deps: DepsPlano): Promise<ResultadoPlano> {
  if (!plano.ok) return { ok: false, mensagem: plano.motivo };
  let mensagem = '';
  let retrato: string | undefined;
  for (const [i, passo] of plano.passos.entries()) {
    if (passo.tipo === 'modo') {
      deps.despacharModo(passo.entrada);
      if (passo.entrada.tipo === 'abrir_pagina') {
        // Totem B3: "abrir página" só vale quando a página sobe no iframe; antes respondia "Abri" sem ver.
        // Quando um controle vem depois, a espera é a dele (abaixo).
        const proximo = plano.passos[i + 1];
        if (proximo?.tipo === 'executor') { mensagem = `Abri a página ${passo.entrada.pagina}.`; continue; }
        const caminho = caminhoDaPagina(passo.entrada.pagina);
        const pronto = await deps.aguardarExecutor(caminho);
        if (!pronto) {
          deps.despacharModo({ tipo: 'voltar_coruja' });
          return { ok: false, mensagem: `A página ${caminho} não carregou no stand; voltei pra coruja.` };
        }
        mensagem = `Abri a página ${passo.entrada.pagina}.`;
        retrato = typeof pronto === 'object' ? pronto.retrato : undefined;
        continue;
      }
      mensagem = passo.entrada.tipo === 'voltar_coruja' ? 'Voltei pra coruja, sem página do site na tela.'
        : 'Abri a Simulação do Trator MAX; a pessoa dirige no controle.';
      continue;
    }
    if (!(await deps.aguardarExecutor(passo.caminho))) {
      deps.despacharModo({ tipo: 'voltar_coruja' });
      return { ok: false, mensagem: `A página ${passo.caminho} não carregou no stand.` };
    }
    const resultado = await deps.enviarAcaoSite(passo.acao, passo.args);
    if (!resultado.ok) return resultado;
    mensagem = resultado.mensagem;
    retrato = resultado.retrato;
  }
  return retrato ? { ok: true, mensagem, retrato } : { ok: true, mensagem };
}
