/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
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
        },
      },
    },
  },
  plugins: [],
};
