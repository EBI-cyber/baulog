/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0c0a09',
        amber: '#f59e0b',
        ember: '#ef4444',
        lime: '#a3e635',
      },
      fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'] },
      boxShadow: { glow: '0 0 50px -12px rgba(245,158,11,.6)' },
      borderRadius: { '4xl': '2rem' },
    },
  },
  plugins: [],
}
