/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9', // Vibrant Sky/Blue Accent
          600: '#0284c7', // Primary Medical Blue (matches real Android app)
          700: '#0369a1', // Medical Ocean Blue
          800: '#075985',
          900: '#0c4a6e', // Deep Medical Navy (0xFF0C4A6E from Android Color.kt)
          950: '#082f49',
        },
        dactor: {
          primary: '#0284c7',
          navy: '#0c4a6e',
          blue: '#0284c7',
          sky: '#0ea5e9',
          bg: '#f8fafc',
          green: '#059669',
          greenBg: '#ecfdf5',
        },
      },
      boxShadow: {
        'glass-sm': 'var(--glass-specular-top), var(--glass-shadow-sm)',
        'glass-base': 'var(--glass-specular-card), var(--glass-shadow-md)',
        'glass-elevated': 'var(--glass-specular-all), var(--glass-shadow-lg)',
        'glass-modal': 'var(--glass-specular-all), var(--glass-shadow-modal)',
        'glass-brand': 'var(--glass-shadow-brand)',
        'specular-top': 'var(--glass-specular-top)',
      },
      borderRadius: {
        'glass-sm': 'var(--glass-radius-sm)',
        'glass-md': 'var(--glass-radius-md)',
        'glass-lg': 'var(--glass-radius-lg)',
        'glass-xl': 'var(--glass-radius-xl)',
      },
    },
  },
  plugins: [],
}
