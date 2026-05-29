import { createContext, useContext } from 'react';

/**
 * LUC.AI — paleta "Porcelana Wild Lotus": marfim + navy lacado + ouro filigrana.
 * Inspirada na skin AK-47 Wild Lotus. O hook dá paridade com o padrão Kamui e
 * permite acessar os tokens sem reler CSS vars.
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
  void: '#F5F1E8',
  void2: '#efe9db',
  surface: 'rgba(255, 253, 247, 0.66)',
  surfaceHi: 'rgba(255, 255, 252, 0.85)',
  input: 'rgba(255, 255, 253, 0.9)',

  navy: '#1E3A6C',
  navyDeep: '#0F2849',
  navySoft: 'rgba(30, 58, 108, 0.06)',
  navyGlow: 'rgba(30, 58, 108, 0.16)',

  gold: '#A8801A',
  goldBright: '#D4AF37',
  goldDeep: '#836311',
  goldSoft: 'rgba(168, 128, 26, 0.08)',
  goldGlow: 'rgba(212, 175, 55, 0.28)',
  goldHaze: 'rgba(168, 128, 26, 0.05)',

  fleet: '#2E5AA0',
  fleetSoft: 'rgba(46, 90, 160, 0.08)',
  fleetGlow: 'rgba(46, 90, 160, 0.20)',

  alive: '#2f9e6a',
  aliveSoft: 'rgba(47, 158, 106, 0.10)',
  aliveGlow: 'rgba(47, 158, 106, 0.22)',

  text: '#0F2849',
  textSoft: '#3a527a',
  textMute: '#6c7c96',
  textGhost: '#a7b0c0',

  border: 'rgba(30, 58, 108, 0.10)',
  borderHover: 'rgba(168, 128, 26, 0.35)',
  borderActive: 'rgba(168, 128, 26, 0.55)',

  ok: '#2f9e6a',
  okBg: 'rgba(47, 158, 106, 0.12)',
  error: '#c0392b',
  errorBg: 'rgba(192, 57, 43, 0.10)',
  warning: '#b8860b',
  warningBg: 'rgba(184, 134, 11, 0.12)',

  console: '#0d1f3a',
  consoleText: '#cfe0f4',
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
