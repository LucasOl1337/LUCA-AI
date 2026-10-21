export const PERCURSO_ORIGEM: readonly [number, number];
export const PERCURSO_MAQUINA: string;
export const PERCURSO_HZ: number;

export interface AmostraPercurso {
  tempoMs: number; x: number; z: number; rumoGraus: number; kph: number;
  rolagem: number; arfagem: number; distanciaCm: number; eco: boolean;
  alertaColisao: boolean; alertaInclinacao: boolean; freio: boolean;
}
export interface EstadoParaAmostra {
  tempoMs: number;
  maquina: { x: number; z: number; rumoGraus: number; velocidadeKph: number };
  atitude: { rolagemGraus: number; arfagemGraus: number };
  sensor: { distanciaCm: number; eco: boolean; alerta: boolean };
  contato: boolean;
  comandos: { freio: number };
}
export interface PontoLocal { x: number; z: number }

export function percursoParaLonLat(x: number, z: number, origem?: readonly [number, number]): [number, number];
export function amostraDoPercurso(estado: EstadoParaAmostra, opcoes?: { inclinado?: boolean }): AmostraPercurso;
export function csvDoPercurso(amostras: readonly AmostraPercurso[], inicioIso: string): string;
export function registroDoPercurso(amostras: readonly AmostraPercurso[], inicioIso: string): { csv: string; amostras: number; duracaoMs: number };
export function mapaDoPercurso(zonas: {
  talhao: { x0: number; x1: number; z0: number; z1: number };
  alagado: readonly PontoLocal[];
  encosta: readonly PontoLocal[];
}): Record<string, unknown>;
export function manifestoDoPercurso(dados: { amostras: number; duracaoMs: number }): Record<string, unknown>;
