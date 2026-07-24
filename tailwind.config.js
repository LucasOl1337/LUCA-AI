/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // LUC.AI — dark liquid glass + cores semânticas operacionais
        void:    '#090c11',
        void2:   '#0f131a',
        navy:    '#0a84ff',
        'navy-deep': '#64d2ff',
        gold:    '#0a84ff',
        'gold-bright': '#64d2ff',
        fleet:   '#bf5af2',
        alive:   '#30d158',
        cream:   'rgba(255, 255, 255, 0.94)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        display: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        jp: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      animation: {
        'spiral-slow': 'spiral 90s linear infinite',
        'spiral-reverse': 'spiral-reverse 120s linear infinite',
        'tomoe-spin': 'spiral 24s linear infinite',
        'drift': 'drift 30s ease-in-out infinite',
        'pulse-void': 'pulse-void 9s ease-in-out infinite',
        'breathe': 'breathe 8s ease-in-out infinite',
        'ecg-sweep': 'ecg-sweep 3.2s linear infinite',
        'blink': 'blink 7s ease-in-out infinite',
        'rise': 'rise 0.5s cubic-bezier(0.4,0,0.2,1) both',
      },
      keyframes: {
        spiral: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'spiral-reverse': {
          '0%': { transform: 'rotate(360deg)' },
          '100%': { transform: 'rotate(0deg)' },
        },
        drift: {
          '0%, 100%': { transform: 'translate(0,0)' },
          '50%': { transform: 'translate(6px,-8px)' },
        },
        'pulse-void': {
          '0%, 100%': { opacity: '0.35' },
          '50%': { opacity: '0.5' },
        },
        breathe: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.55' },
          '50%': { transform: 'scale(1.03)', opacity: '0.78' },
        },
        'ecg-sweep': {
          '0%': { strokeDashoffset: '1000' },
          '100%': { strokeDashoffset: '0' },
        },
        blink: {
          '0%, 92%, 100%': { transform: 'scaleY(1)' },
          '95%, 97%': { transform: 'scaleY(0.08)' },
        },
        rise: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
