import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        nexa: {
          bg: '#0B0B12',
          panel: '#12121C',
          panel2: '#171724',
          panel3: '#1E1E2E',
          border: '#262638',
          violet: '#7C5CFF',
          cyan: '#22D3EE',
          text: '#E7E7F0',
          muted: '#9A9AB0',
          danger: '#F04747',
          success: '#3BA55D',
          warn: '#FAA81A',
        },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      animation: { 'fade-in': 'fadeIn .25s ease both', 'pop-in': 'popIn .18s ease both' },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        popIn: { from: { opacity: '0', transform: 'scale(.96) translateY(4px)' }, to: { opacity: '1', transform: 'scale(1) translateY(0)' } },
      },
    },
  },
  plugins: [],
};
export default config;
