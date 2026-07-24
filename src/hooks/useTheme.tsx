import { createContext, useContext } from 'react';

/**
 * LUCA — tema operacional escuro.
 *
 * Os nomes das propriedades permanecem estáveis para preservar os componentes
 * existentes. A implementação usa um material de vidro escuro, azul para ações,
 * violeta para agentes e verde exclusivamente para estados positivos.
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
  void: '#090c11',
  void2: 'rgba(15, 19, 26, 0.88)',
  surface: 'rgba(20, 24, 31, 0.58)',
  surfaceHi: 'rgba(23, 28, 36, 0.72)',
  input: 'rgba(255, 255, 255, 0.09)',

  navy: '#0a84ff',
  navyDeep: '#64d2ff',
  navySoft: 'rgba(10, 132, 255, 0.12)',
  navyGlow: 'rgba(10, 132, 255, 0.24)',

  gold: '#0a84ff',
  goldBright: '#64d2ff',
  goldDeep: '#82c7ff',
  goldSoft: 'rgba(10, 132, 255, 0.18)',
  goldGlow: 'rgba(10, 132, 255, 0.30)',
  goldHaze: 'rgba(10, 132, 255, 0.10)',

  fleet: '#bf5af2',
  fleetSoft: 'rgba(191, 90, 242, 0.14)',
  fleetGlow: 'rgba(191, 90, 242, 0.24)',

  alive: '#30d158',
  aliveSoft: 'rgba(48, 209, 88, 0.15)',
  aliveGlow: 'rgba(48, 209, 88, 0.24)',

  text: 'rgba(255, 255, 255, 0.94)',
  textSoft: 'rgba(255, 255, 255, 0.72)',
  textMute: 'rgba(255, 255, 255, 0.60)',
  textGhost: 'rgba(255, 255, 255, 0.38)',

  border: 'rgba(255, 255, 255, 0.10)',
  borderHover: 'rgba(100, 210, 255, 0.34)',
  borderActive: 'rgba(100, 210, 255, 0.62)',

  ok: '#30d158',
  okBg: 'rgba(48, 209, 88, 0.16)',
  error: '#ff453a',
  errorBg: 'rgba(255, 69, 58, 0.16)',
  warning: '#ff9f0a',
  warningBg: 'rgba(255, 159, 10, 0.16)',

  console: 'rgba(5, 8, 13, 0.88)',
  consoleText: 'rgba(214, 233, 255, 0.82)',
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
