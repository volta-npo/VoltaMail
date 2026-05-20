import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'volta-bg': '#f9fafb',
        'volta-surface': '#ffffff',
        'volta-dark': '#09090b',
        'volta-soft': '#e5e7eb',
        'volta-primary': '#2563eb',
        'volta-primary-tint': '#eff6ff',
        'volta-accent': '#84cc16',
        'volta-accent-soft': '#ecfccb',
        'volta-warn': '#b45309',
        'volta-warn-soft': '#fef3c7',
        'volta-danger': '#b91c1c',
        'volta-danger-soft': '#fee2e2',
        'volta-success': '#15803d',
        'volta-success-soft': '#dcfce7',
        'volta-stone-50': '#fafaf9',
        'volta-stone-100': '#f5f5f4',
        'volta-stone-200': '#e7e5e4',
        'volta-stone-300': '#d6d3d1',
        'volta-stone-400': '#a8a29e',
        'volta-stone-500': '#78716c',
        'volta-stone-600': '#57534e',
        'volta-stone-700': '#44403c',
        'volta-stone-800': '#292524',
        'volta-stone-900': '#1c1917'
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'sans-serif'
        ],
        display: ['"Space Grotesk"', 'Inter', 'sans-serif'],
        serif: [
          '"Instrument Serif"',
          'ui-serif',
          'Georgia',
          '"Times New Roman"',
          'serif'
        ],
        mono: [
          'ui-monospace',
          '"SFMono-Regular"',
          'Menlo',
          'Monaco',
          'Consolas',
          '"Liberation Mono"',
          '"Courier New"',
          'monospace'
        ]
      },
      boxShadow: {
        neo: '3px 3px 0 0 #09090b',
        'neo-sm': '1px 1px 0 0 #09090b',
        'neo-lg': '6px 6px 0 0 #09090b',
        'neo-hover': '4px 4px 0 0 #09090b',
        'neo-accent': '3px 3px 0 0 #84cc16',
        'neo-primary': '3px 3px 0 0 #2563eb'
      },
      borderRadius: {
        DEFAULT: '0',
        none: '0',
        full: '9999px'
      }
    }
  },
  plugins: []
};

export default config;
