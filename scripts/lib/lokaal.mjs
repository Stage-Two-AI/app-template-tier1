import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { leesWrangler } from "./cloudflare-config.mjs";

/**
 * Klaarzetten voor kijken op je eigen computer (de preview van de Claude-app, of
 * `STACK_ALLOW_DEV=1 pnpm dev`). Lokaal is er geen Cloudflare Access en geen database bij
 * Cloudflare:
 *
 *   1. `.dev.vars` met `OMGEVING=lokaal`: de servercode neemt dan een vaste testgebruiker
 *      (lokaal@voorbeeld.nl). Dat bestand staat nooit in git (.gitignore), en
 *      guard:cloudflare weigert die stand in wrangler.jsonc.
 *   2. In hetzelfde bestand `TESTMAIL_ADRES`, gelijk aan `vars.TESTMAIL_ADRES` in
 *      wrangler.jsonc. Lokaal kunnen echte gegevens staan (pnpm data:test), dus mail gaat
 *      alleen naar dat adres (worker/lib/mail.ts). wrangler.jsonc is de bron; deze regel
 *      volgt hem bij elke start.
 *   3. een lokale D1 in `.wrangler/`, met alle migraties uit migrations/. Productie en de
 *      testomgeving bij Cloudflare raak je vanaf hier nooit.
 */
export function zetLokaalKlaar({
  wrangler = join("node_modules", "wrangler", "bin", "wrangler.js"),
} = {}) {
  const pad = ".dev.vars";
  let nu = existsSync(pad) ? readFileSync(pad, "utf8") : "";
  const regel = (tekst) => `${nu}${nu && !nu.endsWith("\n") ? "\n" : ""}${tekst}\n`;
  if (!/^OMGEVING=/m.test(nu)) nu = regel("OMGEVING=lokaal");
  const testmail = `TESTMAIL_ADRES=${testmailAdres()}`;
  if (/^TESTMAIL_ADRES=.*$/m.test(nu)) nu = nu.replace(/^TESTMAIL_ADRES=.*$/m, testmail);
  else nu = regel(testmail);
  writeFileSync(pad, nu);
  const uit = spawnSync(
    process.execPath,
    [wrangler, "d1", "migrations", "apply", "DB", "--local"],
    { stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" } },
  );
  return uit.status === 0;
}

/** `vars.TESTMAIL_ADRES` uit wrangler.jsonc, of leeg. */
function testmailAdres() {
  try {
    const adres = leesWrangler().vars?.TESTMAIL_ADRES;
    return typeof adres === "string" ? adres.trim() : "";
  } catch {
    return "";
  }
}
