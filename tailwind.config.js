/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'sans-serif'],
      },
      colors: {
        casino: {
          dark: '#0f172a',
          purple: '#581c87',
          gold: '#fbbf24',
          goldDark: '#b45309',
          red: '#ef4444',
          green: '#10b981',
          felt: '#064e3b',
        }
      },
      animation: {
        'deal-card': 'deal 0.5s ease-out forwards',
        'flip': 'flip 0.6s ease-in-out forwards',
        'pulse-gold': 'pulseGold 2s infinite',
        'shine': 'shine 1.5s infinite',
        'slide-up': 'slideUp 0.5s ease-out forwards',
        'fade-in': 'fadeIn 0.3s ease-out forwards',
        'fall': 'fall 3s linear infinite',
        'spin-slow': 'spin 4s linear infinite',
      },
      keyframes: {
        deal: {
          '0%': { transform: 'translateY(-200px) scale(0.5)', opacity: '0' },
          '100%': { transform: 'translateY(0) scale(1)', opacity: '1' },
        },
        pulseGold: {
          '0%, 100%': { boxShadow: '0 0 10px #fbbf24' },
          '50%': { boxShadow: '0 0 25px #fbbf24' },
        },
        shine: {
          '0%': { left: '-100%' },
          '100%': { left: '200%' }
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        fall: {
          '0%': { transform: 'translateY(-10vh) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'translateY(120vh) rotate(720deg)', opacity: '0' }
        }
      }
    },
  },
  plugins: [],
}