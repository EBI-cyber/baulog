/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: { ink: '#06121a', aqua: '#22d3ee', mint: '#34d399', ember: '#ef4444', lime: '#a3e635' },
      fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'] },
      boxShadow: { glow: '0 0 50px -12px rgba(34,211,238,.6)' },
      borderRadius: { '4xl': '2rem' },
    },
  },
  plugins: [],
}
