import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Klaarzetten voor kijken op je eigen computer (de preview van de Claude-app, of
 * `STACK_ALLOW_DEV=1 pnpm dev`). Lokaal is er geen Cloudflare Access en geen echte database:
 *
 *   1. `.dev.vars` met `OMGEVING=lokaal`: de servercode neemt dan een vaste testgebruiker
 *      (lokaal@voorbeeld.nl). Dat bestand staat nooit in git (.gitignore), en
 *      guard:cloudflare weigert die stand in wrangler.jsonc;
 *   2. een lokale D1 in `.wrangler/`, met alle migraties uit migrations/. Productie en de
 *      testomgeving bij Cloudflare raak je vanaf hier nooit.
 */
export function zetLokaalKlaar({
  wrangler = join("node_modules", "wrangler", "bin", "wrangler.js"),
} = {}) {
  const pad = ".dev.vars";
  const nu = existsSync(pad) ? readFileSync(pad, "utf8") : "";
  if (!/^OMGEVING=/m.test(nu)) {
    writeFileSync(pad, `${nu}${nu && !nu.endsWith("\n") ? "\n" : ""}OMGEVING=lokaal\n`);
  }
  const uit = spawnSync(
    process.execPath,
    [wrangler, "d1", "migrations", "apply", "DB", "--local"],
    { stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" } },
  );
  return uit.status === 0;
}
