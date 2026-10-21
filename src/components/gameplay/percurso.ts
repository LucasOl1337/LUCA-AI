import { DESAFIO_ALAGADO, DESAFIO_FARDO, DESAFIO_PENDENTE, textoResultado, type Desafio, type ResultadoDesafio } from './desafios';

/**
 * Percurso guiado do totem (estande aberto, msg do Lucas 1358): os três trechos que o
 * gameplay já tem, em sequência — fardo, encosta, área alagada — no mesmo motor e cena.
 * Não tem relógio global: cada trecho tem o próprio limite (60 s) e o resultado final
 * fica na tela até a pessoa escolher repetir, analisar ou dirigir livre.
 */
export const TRECHOS_PERCURSO: readonly Desafio[] = [DESAFIO_FARDO, DESAFIO_PENDENTE, DESAFIO_ALAGADO];

/** Cartão entre um trecho e o próximo. */
export const TRANSICAO_MS = 3000;

/**
 * Nota de condução por regra explícita, 0–100 por trecho; média dos trechos avaliados.
 * É sobre este percurso simulado. Não é risco de seguro, não é avaliação de pessoa.
 */
export const REGRAS_NOTA: readonly string[] = [
  'Fardo: parou depois do aviso = 100 (reação até 1 s), 80 (até 2 s) ou 60; encostou = 20 com aviso, 0 sem.',
  'Encosta: atravessou ou parou abaixo de 35° = 100 (sem aviso, ou freou até 1,5 s depois dele) ou 70; tombou = 0.',
  'Área alagada: contornou = 100 (80 se precisou do aviso), parou antes = 90, entrou = 0.',
  'Tempo esgotado no trecho: não entra na média.',
];

export function notaDoTrecho(r: ResultadoDesafio): number | null {
  if (r.desfecho === 'tempo') return null;
  if (r.desafio === 'fardo-a-frente') {
    if (r.desfecho === 'encostou') return r.alertaCm === null ? 0 : 20;
    const reacao = r.reacaoS ?? Infinity;
    return reacao <= 1 ? 100 : reacao <= 2 ? 80 : 60;
  }
  if (r.desafio === 'pendente-lateral') {
    if (r.desfecho === 'tombou') return 0;
    if (r.alertaGraus === null) return 100;
    return r.reacaoS !== null && r.reacaoS <= 1.5 ? 100 : 70;
  }
  if (r.desfecho === 'entrou') return 0;
  if (r.desfecho === 'parou') return 90;
  return r.alertou ? 80 : 100;
}

export interface ResumoPercurso {
  nota: number | null;
  trechos: { titulo: string; resultado: string; nota: number | null; linhas: string[] }[];
}

export function resumoPercurso(resultados: readonly ResultadoDesafio[]): ResumoPercurso {
  const trechos = resultados.map((r, i) => {
    const texto = textoResultado(r);
    return { titulo: TRECHOS_PERCURSO[i]?.titulo ?? r.desafio, resultado: texto.titulo, nota: notaDoTrecho(r), linhas: texto.linhas };
  });
  const avaliadas = trechos.map((t) => t.nota).filter((n): n is number => n !== null);
  return { nota: avaliadas.length ? Math.round(avaliadas.reduce((a, b) => a + b, 0) / avaliadas.length) : null, trechos };
}
