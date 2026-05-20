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
      },
      boxShadow: {
        card: "0 18px 50px rgba(0, 0, 0, 0.35)",
      },
    },
  },
  plugins: [],
} satisfies Config;
