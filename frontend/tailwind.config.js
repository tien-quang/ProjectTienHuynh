/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: { 50:'#eff6ff',100:'#dbeafe',500:'#3b82f6',600:'#2563eb',700:'#1d4ed8',900:'#1e3a8a' },
        brand: { DEFAULT:'#2563eb', dark:'#1d4ed8', light:'#3b82f6' }
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite'
      },
      keyframes: {
        fadeIn: { '0%':'opacity:0', '100%':'opacity:1' },
        slideUp: { '0%':'transform:translateY(10px);opacity:0', '100%':'transform:translateY(0);opacity:1' }
      }
    }
  },
  plugins: []
}
