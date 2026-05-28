import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        launcher: {
          bg: "#090b10",
          panel: "#10131b",
          panelMuted: "#151a24",
          border: "#242a36",
          accent: "#38bdf8",
          accentStrong: "#0ea5e9",
        },
        neo: {
          paper: "#fbf4e7",
          paperAlt: "#f5eedf",
          paperDark: "#eee4d2",
          ink: "#171411",
          red: "#c20b2f",
          redBright: "#e92846",
          redDark: "#a60724",
          teal: "#087d6d",
          tealDark: "#007166",
          blue: "#4aa5c8",
          yellow: "#e2bd22",
          muted: "#55504a",
        },
      },
      boxShadow: {
        card: "0 18px 50px rgba(0, 0, 0, 0.35)",
        neo: "4px 4px 0  #171411",
        neoSm: "3px 3px 0  #171411",
      },
      fontFamily: {
        oswald: ['"Oswald"', "Impact", "Haettenschweiler", '"Arial Narrow"', "sans-serif"],
        mono: ['"JetBrains Mono"', '"Courier New"', "ui-monospace", "monospace"],
        body: ['"Roboto Condensed"', '"Arial Narrow"', "Impact", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
