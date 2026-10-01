import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eef6ff',
          100: '#d9eaff',
          200: '#bcd9ff',
          300: '#8ec1ff',
          400: '#599fff',
          500: '#3179ff',
          600: '#1d57f0',
          700: '#1844c7',
          800: '#1939a0',
          900: '#1a347e',
        },
      },
    },
  },
  plugins: [],
};

export default config;
