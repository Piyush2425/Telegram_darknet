/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        darkBg: '#0b0f19',
        darkCard: '#111827',
        darkBorder: '#1f2937',
        telegramBlue: '#229ED9',
        telegramDark: '#17212b',
        accentCyan: '#06b6d4',
        accentEmerald: '#10b981',
        accentRose: '#f43f5e',
        accentAmber: '#f59e0b',
      },
    },
  },
  plugins: [],
}
