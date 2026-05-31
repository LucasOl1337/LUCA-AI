import { createContext, useContext } from 'react';

/**
 * LUC.AI — paleta "Cerrado": pergaminho quente + verde floresta + sienna marrom.
 * Tema claro natural inspirado no bioma brasileiro.
 */
export interface LucaTheme {
  void: string;
  void2: string;
  surface: string;
  surfaceHi: string;
  input: string;

  navy: string;
  navyDeep: string;
  navySoft: string;
  navyGlow: string;

  gold: string;
  goldBright: string;
  goldDeep: string;
  goldSoft: string;
  goldGlow: string;
  goldHaze: string;

  fleet: string;
  fleetSoft: string;
  fleetGlow: string;

  alive: string;
  aliveSoft: string;
  aliveGlow: string;

  text: string;
  textSoft: string;
  textMute: string;
  textGhost: string;

  border: string;
  borderHover: string;
  borderActive: string;

  ok: string;
  okBg: string;
  error: string;
  errorBg: string;
  warning: string;
  warningBg: string;

  console: string;
  consoleText: string;
}

export const LUCA_THEME: LucaTheme = {
  // Pergaminho quente — fundo
  void: '#f2e8d8',
  void2: '#e9ddc8',
  surface: 'rgba(245, 235, 215, 0.70)',
  surfaceHi: 'rgba(252, 246, 238, 0.88)',
  input: 'rgba(250, 244, 234, 0.92)',

  // Verde floresta — estrutura, texto forte (era navy)
  navy: '#1a5c3a',
  navyDeep: '#0f3d24',
  navySoft: 'rgba(26, 92, 58, 0.06)',
  navyGlow: 'rgba(26, 92, 58, 0.16)',

  // Sienna marrom — marca e estado ativo (era gold)
  gold: '#8b5a2b',
  goldBright: '#b07840',
  goldDeep: '#6b3d1a',
  goldSoft: 'rgba(139, 90, 43, 0.08)',
  goldGlow: 'rgba(176, 120, 64, 0.28)',
  goldHaze: 'rgba(139, 90, 43, 0.05)',

  // Verde médio — acento secundário (era fleet)
  fleet: '#2d6a4f',
  fleetSoft: 'rgba(45, 106, 79, 0.08)',
  fleetGlow: 'rgba(45, 106, 79, 0.20)',

  // Verde heartbeat — sinal de vida
  alive: '#2f9e6a',
  aliveSoft: 'rgba(47, 158, 106, 0.10)',
  aliveGlow: 'rgba(47, 158, 106, 0.22)',

  // Textos — tinta sobre pergaminho
  text: '#1e1209',
  textSoft: '#4a3020',
  textMute: '#7a5c46',
  textGhost: '#b8a090',

  // Bordas
  border: 'rgba(26, 92, 58, 0.10)',
  borderHover: 'rgba(139, 90, 43, 0.35)',
  borderActive: 'rgba(139, 90, 43, 0.55)',

  // Estados
  ok: '#2f9e6a',
  okBg: 'rgba(47, 158, 106, 0.12)',
  error: '#c0392b',
  errorBg: 'rgba(192, 57, 43, 0.10)',
  warning: '#b8860b',
  warningBg: 'rgba(184, 134, 11, 0.12)',

  // Console — mantém escuro (verde musgo)
  console: '#0d1a0f',
  consoleText: '#b8d8b0',
};

const ThemeContext = createContext<LucaTheme>(LUCA_THEME);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeContext.Provider value={LUCA_THEME}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): LucaTheme {
  return useContext(ThemeContext);
}
