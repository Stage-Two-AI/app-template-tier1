import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Unittests: de schermen in een nagebootste browser, de servercode (worker/) in Node met een
 * nagebootste D1 (tests/helpers/d1.ts). Een testbestand voor de servercode begint met
 * `// @vitest-environment node`.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    include: ["src/**/*.test.{ts,tsx}", "worker/**/*.test.ts", "tests/unit/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
  },
});
