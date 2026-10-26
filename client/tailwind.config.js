/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          black: '#0a0a0a',
          dark: '#121212',
          surface: '#18181b',
          border: '#27272a',
          muted: '#71717a',
          white: '#fafafa',
          accent: '#2563eb'
        }
      }
    },
  },
  plugins: [],
}
