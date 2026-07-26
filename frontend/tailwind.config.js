/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        darkBg: '#f8fafc',
        darkCard: '#ffffff',
        darkBorder: '#e2e8f0',
        telegramBlue: '#229ED9',
        telegramDark: '#f1f5f9',
        accentCyan: '#06b6d4',
        accentEmerald: '#10b981',
        accentRose: '#f43f5e',
        accentAmber: '#f59e0b',
      },
    },
  },
  plugins: [],
}
