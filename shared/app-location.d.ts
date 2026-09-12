export type AppPageId = 'inicio' | 'luca-ai' | 'personas' | 'configuracao' | 'sompo' | 'laboratorio' | 'admin';
export type AppLocationKind = 'app' | 'auth' | 'leitura';

export interface AppLocation {
  kind: AppLocationKind;
  page: AppPageId;
  authMode: 'login' | 'register';
  leituraToken: string;
  busca: string;
  filtro: 'all' | 'principais' | 'ativadas';
  aba: string;
  tipo: 'team' | 'individual';
  modelo: string;
  novo: boolean;
  produto: string;
  gravidade: string;
  caso: string;
  sessao: string;
    conta: string;
    ordem: string;
    fonte: string;
    modo: string;
  }

export const APP_PAGES: readonly AppPageId[];
export const PAGE_PATHS: Record<AppPageId, string>;
export const PERSONA_FILTRO: readonly string[];
export const SOMPO_ABA: 'casos';
export const SOMPO_TELEMETRY_ABA: 'telemetria';
export function getSompoView(location: Partial<AppLocation>): 'welcome' | 'cases' | 'telemetry';
export const LUCA_ABA: 'atividade';
export const ADMIN_ABAS: readonly string[];
export const CONFIG_TIPO: readonly string[];
export const ORDEM_PARAM: Record<string, string>;
export const ORDEM_API: Record<string, string>;
export const PRODUTO_PARAM: Record<string, string>;
export const PRODUTO_VALUE: Record<string, string>;
export const GRAVIDADE_VALUES: readonly string[];
export function emptyAppLocation(): AppLocation;
export function isAppPage(value: unknown): value is AppPageId;
export function parseAppLocation(href: string): AppLocation;
export function formatAppUrl(location: Partial<AppLocation>): string;
export function mergeAppLocation(current: AppLocation, patch: Partial<AppLocation>): AppLocation;
