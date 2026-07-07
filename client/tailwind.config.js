/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0D0F14',
        surface: '#161A23',
        'surface-2': '#1E2330',
        border: '#2A3142',
        primary: '#6C63FF',
        'primary-glow': '#6C63FF33',
        accent: '#00D4AA',
        text: '#E8EAF0',
        'text-muted': '#7B8299',
        error: '#FF5370',
        success: '#00D4AA',
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        float: 'float 6s ease-in-out infinite',
        'float-slow': 'float 9s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
      },
      backgroundImage: {
        'glow-primary':
          'radial-gradient(circle, #6C63FF22 0%, transparent 70%)',
        'glow-accent': 'radial-gradient(circle, #00D4AA22 0%, transparent 70%)',
      },
      boxShadow: {
        glow: '0 0 24px 0 #6C63FF55',
      },
    },
  },
  plugins: [],
};
