import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      allow: [".."],
    },
  },
  test: {
    testTimeout: 20_000,
    hookTimeout: 20_000,
    environment: "jsdom",
    env: {
      NODE_ENV: "test",
    },
    globals: false,
    setupFiles: ["./test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "dist", "src-tauri", "src/lib/supabase/database.types.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: [
        "src/lib/**",
        "src/hooks/**",
        "src/components/ui/**",
        "src/components/library/PlatformIcons.tsx",
        "src/stores/**",
      ],
      exclude: [
        "src/lib/supabase/database.types.ts",
        "src/lib/supabase/database.types.ts/**",
        "**/__tests__/**",
        "**/*.test.{ts,tsx}",
        "**/*.spec.{ts,tsx}",
      ],
      // Per-pattern thresholds: well-tested code holds a high bar,
      // the Supabase wrapper layer (lib/api/**) is allowed to fall
      // below because the tests do not yet mock @supabase/supabase-js.
      // Once integration tests land, the per-pattern override can be
      // removed and a single global threshold will suffice.
      thresholds: {
        "src/stores/**": {
          statements: 95,
          branches: 90,
          functions: 100,
          lines: 95,
        },
        "src/hooks/library/**": {
          statements: 60,
          branches: 75,
          functions: 70,
          lines: 60,
        },
        "src/hooks/**": {
          // Generic hooks (useDebouncedValue, useLocalStorageState,
          // etc.) are well tested individually but the directory
          // as a whole includes several untested Tauri-binding hooks
          // (useControllerInput, useOverlayCapture). The per-hook
          // coverage jobs land in a separate PR.
          statements: 50,
          branches: 65,
          functions: 60,
          lines: 50,
        },
        "src/lib/validation/**": {
          statements: 95,
          branches: 50,
          functions: 100,
          lines: 95,
        },
        "src/lib/api/**": {
          // No real coverage until supabase-js is mocked in tests.
          // Setting the threshold to 0 keeps the report honest
          // (the 0% lines still show up in the diff) without
          // making every PR fight the gate.
          statements: 0,
          branches: 0,
          functions: 0,
          lines: 0,
        },
      },
    },
  },
});
