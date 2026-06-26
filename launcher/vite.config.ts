import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("@supabase")) {
            return "vendor-supabase";
          }

          if (id.includes("lucide-react")) {
            return "vendor-icons";
          }

          if (/\/react(\/|-dom\/)/.test(id) || id.includes("scheduler")) {
            return "vendor-react";
          }

          if (id.includes("react-router")) {
            return "vendor-router";
          }

          if (id.includes("zod")) {
            return "vendor-zod";
          }

          if (id.includes("zustand")) {
            return "vendor-zustand";
          }

          if (id.includes("@tauri-apps")) {
            return "vendor-tauri";
          }

          return "vendor";
        },
      },
    },
  },
  clearScreen: false,
  server: {
    host: host ?? "127.0.0.1",
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
});
