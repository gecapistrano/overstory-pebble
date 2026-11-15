/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        blush: "#FBF2F2",
        petal: "#F6E4E5",
        ink: "#1D1A1C",
        mute: "#8A8285",
        coral: { DEFAULT: "#E5322D", soft: "#FCE3E1", deep: "#C4231F" },
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
      boxShadow: { card: "0 1px 2px rgba(60,20,25,.06), 0 8px 24px rgba(60,20,25,.08)" },
    },
  },
  plugins: [],
};
