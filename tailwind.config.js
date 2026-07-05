/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        beetz: {
          yellow: '#fed417',
          dark: '#050505',
          gray: '#f4f4f5'
        }
      },
      fontFamily: {
        sans: ['Poppins', 'Inter', 'system-ui', 'sans-serif']
      },
      backgroundImage: {
        'honeycomb': "radial-gradient(circle at 1px 1px, rgba(5,5,5,0.04) 1px, transparent 0)"
      },
      boxShadow: {
        soft: '0 8px 30px rgba(5,5,5,0.08)',
        glow: '0 0 0 4px rgba(254,212,23,0.25)'
      }
    }
  },
  plugins: []
}
