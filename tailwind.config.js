/** @type {import('tailwindcss').Config} */
// Theme ported from the OverStory "broker desk" design (feature/photo-match): navy chrome, white panels on a cool
// grey canvas, one blue highlight, calm green/amber, violet for AI. Inter for all UI text and headings, IBM Plex Mono
// for figures. The original token names (sand, card, stone, sage, clay) and the older aliases (blush, petal, mute,
// coral) are kept and now hold the broker-desk values, so every screen reads one palette.
const navy = { DEFAULT: "#16325A", 900: "#16325A", 700: "#1F3F6E", 500: "#3A5A8C", soft: "#E9EFF8", deep: "#0F2442" };
const blue = { DEFAULT: "#3478F0", soft: "#EDF3FE", ink: "#1F4FA8" };
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#253247",
        canvas: "#F5F7FA",
        sand: "#EDF2F9",
        card: "#FFFFFF",
        stone: "#66758C",
        line: "#E1E7EF",
        "line-strong": "#CDD6E3",
        secondary: "#4A586D",
        faint: "#8592A6",
        navy,
        // highlight / selection / secondary actions (was sage green)
        sage: blue,
        ghost: blue,
        // primary actions (was clay): navy, one per view
        clay: navy,
        accent: navy,
        violet: { DEFAULT: "#6655CC", soft: "#EFECFB", light: "#B9A8FF" },
        positive: { DEFAULT: "#2A8A5C", soft: "#E7F4EC" },
        warning: { DEFAULT: "#A8710F", soft: "#FBF1DC" },
        negative: { DEFAULT: "#C94040", soft: "#FCECEC" },
        ember: "#E0702F",
        // aliases
        blush: "#F5F7FA",
        petal: "#EDF2F9",
        mute: "#66758C",
        coral: navy,
      },
      // Softer type, as in the teammate design: every "bold" renders one step lighter.
      fontWeight: { semibold: "500", bold: "600" },
      fontFamily: {
        sans: ["Inter", "PingFang SC", "Noto Sans CJK SC", "Noto Sans KR", "Noto Naskh Arabic", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Arial", "sans-serif"],
        display: ["Inter", "PingFang SC", "Noto Sans CJK SC", "Noto Sans KR", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: { panel: "14px" },
      boxShadow: {
        card: "0 1px 2px rgba(22,50,90,.04), 0 10px 30px -8px rgba(22,50,90,.16)",
        1: "0 1px 2px rgba(22,50,90,.06), 0 1px 4px rgba(22,50,90,.06)",
        2: "0 2px 8px rgba(22,50,90,.09)",
        4: "0 16px 40px -12px rgba(22,50,90,.24)",
      },
      transitionTimingFunction: { soft: "cubic-bezier(0.22, 1, 0.36, 1)" },
    },
  },
  plugins: [],
};
