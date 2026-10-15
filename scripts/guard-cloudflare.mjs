import { fail, pass } from "./lib/changed-files.mjs";
import { cloudflareConfig } from "./lib/cloudflare-config.mjs";

/**
 * Houdt `wrangler.jsonc` binnen de afspraken van tier 1: één Worker met de servercode
 * in worker/, één adres achter Access, opslag alleen in D1 en R2, en een eigen D1 en R2 voor
 * de previews.
 *
 * De controle zelf staat in `scripts/lib/cloudflare-config.mjs`; de uitrol gebruikt
 * dezelfde controle als poort. Deze guard draait hem al op de pull request, zodat een
 * afwijking niet kan mergen in plaats van pas bij de uitrol te stranden.
 * Ontbreekt het bestand of is het niet te lezen, dan faalt de guard ook.
 */
let config;
try {
  config = cloudflareConfig();
} catch (fout) {
  fail("wrangler.jsonc houdt zich niet aan de afspraken van de stack.", [
    fout instanceof Error ? fout.message : String(fout),
    "",
    "Zie de regels in AGENTS.md en de uitleg in docs/WERKWIJZE.md.",
  ]);
}

pass(
  config.stand === "tijdelijk"
    ? `wrangler.jsonc klopt (tijdelijke stand: ${config.worker} op workers.dev, zolang er geen eigen domein is)`
    : `wrangler.jsonc klopt (${config.worker} op ${config.hostname})`,
);
