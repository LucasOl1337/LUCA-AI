export type Culpado = 'operador' | 'maquina' | 'manutencao' | 'ambiente' | 'terceiro' | 'indeterminado';
export interface ComponenteImpacto { chave: string; item: string; valor_brl: number; valor_min_brl: number; valor_max_brl: number; base: string }
export interface ImpactoFinanceiro {
  faixa_min_brl: number | null; faixa_max_brl: number | null; componentes: ComponenteImpacto[];
  premissas: string[]; rotulo: 'estimativa'; tabela: string;
}
export interface Veredicto {
  versao: 1; status: 'concluido' | 'indeterminado_por_falha';
  culpado: Culpado; culpadoRotulo: string; confianca: number; porque: string; hipotese: string;
  evidencias: { descricao: string; elapsedMs?: number; frame?: number }[];
  fatores_contribuintes: string[];
  prevencao: { acao: string; responsavel: string; prazo?: string }[];
  impacto_financeiro: ImpactoFinanceiro;
  aviso: string; geradoEm: string; modelo: string;
}
export const VEREDICTO_VERSAO: 1;
export const TABELA_PREMISSAS: string;
export const VALOR_TRATOR_BRL: number;
export const CULPADOS: Readonly<Record<Culpado, string>>;
export const PREMISSAS_IMPACTO: Readonly<Record<string, { item: string; min: number; max: number; base: string; porUnidade?: boolean; maxQtd?: number }>>;
export function veredictoIndeterminado(motivo: string, opts?: { modelo?: string; sintetico?: boolean }): Veredicto;
export function calcularImpacto(itens: unknown, opts?: { premissas?: unknown; sintetico?: boolean }): ImpactoFinanceiro;
export function instrucoesVeredicto(opts?: { evidenciaPorAmostra?: boolean }): string;
export function lerVeredicto(obj: unknown, opts?: { resolverAmostra?: ((i: number) => { elapsedMs: number } | null) | null; duracaoMs?: number; frames?: Set<number> | null; modelo?: string; sintetico?: boolean; exigeInstante?: boolean }): Veredicto;
export function resumoVeredicto(v: Veredicto | null | undefined): { culpado: Culpado; rotulo: string; confianca: number; faixaMinBrl: number | null; faixaMaxBrl: number | null } | null;
export function textoFaixa(f: ImpactoFinanceiro | null | undefined): string;
