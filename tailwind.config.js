/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0b0d10',
          panel: '#13171c',
          subtle: '#1a1f26',
        },
        border: {
          DEFAULT: '#262c35',
          strong: '#3a4250',
        },
        accent: {
          DEFAULT: '#3b82f6',
          hover: '#2563eb',
        },
      },
      fontFamily: {
        sans: ['"Segoe UI Variable"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"Cascadia Mono"', '"Consolas"', 'monospace'],
      },
    },
  },
  plugins: [],
};
