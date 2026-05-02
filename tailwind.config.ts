import type { Config } from "tailwindcss";

// Colors are defined as CSS custom properties (space-separated RGB triplets) in
// `globals.css`, so Tailwind opacity modifiers like `bg-accent/20` keep working
// while light/dark mode swaps the underlying values.
const withAlpha = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: withAlpha("--color-bg"),
        fg: withAlpha("--color-fg"),
        panel: withAlpha("--color-panel"),
        panel2: withAlpha("--color-panel2"),
        border: withAlpha("--color-border"),
        accent: withAlpha("--color-accent"),
        accent2: withAlpha("--color-accent2"),
        good: withAlpha("--color-good"),
        bad: withAlpha("--color-bad"),
        muted: withAlpha("--color-muted"),
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
