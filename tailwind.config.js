/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        flyfx: {
          gold: "#D2AA44",
          dark: "#0A0A0A",
          card: "#141414",
          border: "#1E1E1E",
          muted: "#888888",
          hot: "#FF4444",
          warm: "#FF9900",
          nurture: "#666666",
          // Light mode
          "light-bg": "#F8F7F4",
          "light-card": "#FFFFFF",
          "light-border": "#E8E5DE",
          "light-muted": "#8C8778",
          "light-text": "#1A1A1A",
        },
      },
    },
  },
  plugins: [],
};
