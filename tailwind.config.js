/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'dark-bg': '#1a1a1a',
        'dark-panel': '#252525',
        'dark-border': '#333333',
        'dark-text': '#e0e0e0',
        'dark-text-secondary': '#a0a0a0',
      },
    },
  },
  plugins: [],
}





