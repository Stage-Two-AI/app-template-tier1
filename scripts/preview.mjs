import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { zetLokaalKlaar } from "./lib/lokaal.mjs";

/**
 * De preview van de Claude-app: `.claude/launch.json` start dit script, en de app laat het
 * resultaat zien in het venster naast het gesprek. Claude kijkt daar zelf ook mee om zijn
 * werk te controleren.
 *
 * Dit is lokaal kijken voor jezelf (docs/routes/lokaal-kijken.md), niet opleveren: dat
 * blijft de pull request met de Cloudflare-preview.
 *
 * Wat dit script regelt, zodat de gebruiker niets hoeft te weten:
 *   1. de pakketten (`pnpm install`) als die er nog niet zijn;
 *   2. een lokale database met alle migraties, en de lokale stand zonder Access
 *      (scripts/lib/lokaal.mjs);
 *   3. vite, met de echte Workers-omgeving erin, op de poort die de app doorgeeft.
 */
const ROOD = (t) => `\u001b[31m${t}\u001b[0m`;

function stop(regels) {
  console.error(["", ...regels.map((r) => `  ${r}`), ""].join("\n"));
  process.exit(1);
}

if (!existsSync(join("node_modules", "vite", "bin", "vite.js"))) {
  console.log("Pakketten ophalen (eenmalig, duurt even)…");
  const uit =
    process.platform === "win32"
      ? spawnSync("pnpm install", { stdio: "inherit", shell: true })
      : spawnSync("pnpm", ["install"], { stdio: "inherit" });
  if (uit.status !== 0)
    stop([
      ROOD("✗ `pnpm install` mislukte."),
      "Draai /stack-light:installatie, of vraag Stage Two.",
    ]);
}

if (!zetLokaalKlaar()) {
  stop([
    ROOD("✗ De lokale database kon niet worden klaargezet."),
    "Kijk hierboven welke migratie faalde.",
  ]);
}

const poort = process.env.PORT || "5173";
const uit = spawnSync(
  process.execPath,
  [join("node_modules", "vite", "bin", "vite.js"), "--port", poort, "--strictPort"],
  { stdio: "inherit" },
);
process.exit(uit.status ?? 1);
