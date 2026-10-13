import { fileURLToPath, URL } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// De plugin van Cloudflare bouwt de schermen en de servercode (worker/) samen, en draait
// lokaal de echte Workers-omgeving met een lokale D1 en R2 (in .wrangler/).
export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: { port: 5173 },
  preview: { port: 4173 },
});
