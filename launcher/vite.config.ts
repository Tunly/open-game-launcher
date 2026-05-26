import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;
const workspaceRoots = [
  "O:/launcher",
  "X:/launcher",
  "E:/Coding Projects/open-game-launcher/launcher",
  process.cwd().replace(/\\/g, "/"),
];

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: host ?? "127.0.0.1",
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
    fs: {
      allow: workspaceRoots,
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
});
