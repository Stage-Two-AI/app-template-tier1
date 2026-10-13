import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Bewust de gebouwde app (schermen én servercode in de echte Workers-omgeving), niet de
    // dev-server: je test wat er ook echt live gaat. Eerst de lokale database en de stand
    // zonder Access (scripts/lib/lokaal.mjs).
    // De poort staat in het preview-script; hier niet nog eens meegeven, want dan
    // krijgt Vite de vlag dubbel en bindt hij op een andere poort.
    command:
      "node -e \"import('./scripts/lib/lokaal.mjs').then((m) => process.exit(m.zetLokaalKlaar() ? 0 : 1))\" && pnpm build && pnpm preview",
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 180_000,
  },
});
