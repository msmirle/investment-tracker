import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b1020",
        panel: "#141a2f",
        panel2: "#1b2340",
        border: "#2a335a",
        accent: "#6366f1",
        accent2: "#22d3ee",
        good: "#10b981",
        bad: "#ef4444",
        muted: "#94a3b8",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
