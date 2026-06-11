/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        rose: {
          50: '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#fb7185',
          500: '#f43f5e',
          600: '#e11d48',
          700: '#be123c',
          800: '#9f1239',
          900: '#881337',
        },
        blush: {
          50: '#fdf6f0',
          100: '#fce8d8',
          200: '#f8d0b0',
          300: '#f3b07e',
          400: '#ec8a4a',
          500: '#e56a28',
          600: '#d4521d',
          700: '#b03f1a',
          800: '#8d331d',
          900: '#732d1b',
        },
        sage: {
          50: '#f2f7f2',
          100: '#e0ece0',
          200: '#c2d9c3',
          300: '#98be9a',
          400: '#6a9e6d',
          500: '#4a7f4e',
          600: '#3a643e',
          700: '#305134',
          800: '#284229',
          900: '#223724',
        },
        cream: {
          50: '#fefdf8',
          100: '#fdf8ec',
          200: '#faf0d0',
          300: '#f5e3a3',
          400: '#efd072',
          500: '#e8bc4a',
          600: '#d4a033',
          700: '#b07e29',
          800: '#8d6326',
          900: '#745224',
        }
      },
      fontFamily: {
        serif: ['Georgia', 'Cambria', '"Times New Roman"', 'serif'],
      }
    },
  },
  plugins: [],
}
