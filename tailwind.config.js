/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Brand — reddish pink, tinder-adjacent but deeper
        brand: {
          50: '#fff1f4',
          100: '#ffe0e7',
          200: '#ffc6d3',
          300: '#ff9db4',
          400: '#ff6b8e',
          500: '#fb3f6d',
          600: '#e81f57',
          700: '#c31048',
          800: '#a31043',
          900: '#8a1140',
        },
        ink: {
          0: '#ffffff',
          50: '#f7f7f8',
          100: '#ededf0',
          200: '#d9d9e0',
          300: '#b8b8c4',
          400: '#8b8b9b',
          500: '#63636f',
          600: '#45454e',
          700: '#2b2b32',
          800: '#18181c',
          850: '#121215',
          900: '#0b0b0d',
          950: '#050506',
        },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Bricolage Grotesque"', 'Inter', 'system-ui', 'sans-serif'],
        curvy: ['"Instrument Serif"', 'Georgia', 'serif'],
      },
      borderRadius: {
        xl2: '1.25rem',
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      boxShadow: {
        card: '0 18px 50px -18px rgba(0,0,0,0.35)',
        glow: '0 10px 40px -12px rgba(251,63,109,0.55)',
        sheet: '0 -12px 50px -18px rgba(0,0,0,0.45)',
      },
      keyframes: {
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        floaty: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
      },
      animation: {
        shimmer: 'shimmer 1.6s linear infinite',
        floaty: 'floaty 5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
