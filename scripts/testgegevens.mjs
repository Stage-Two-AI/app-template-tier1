#!/usr/bin/env node
/**
 * `pnpm data:test`: een kopie van de echte gegevens in de lokale database, en de leeslinks
 * naar de testbestanden in de lokale R2. Uitleg en werking: scripts/lib/testgegevens.mjs.
 * De preview van de Claude-app doet dit zelf, bij de eerste start en daarna eens per dag;
 * dit commando is voor tussendoor, of met een andere assistent.
 *
 * Alles gebeurt met `--local`: productie en de testomgeving bij Cloudflare worden alleen
 * gelezen, door de workflow in de beheer-repo, nooit vanaf deze computer.
 */
import { zetLokaalKlaar } from "./lib/lokaal.mjs";
import { laadTestgegevens, samenvatting } from "./lib/testgegevens.mjs";

const ROOD = (t) => `\u001b[31m${t}\u001b[0m`;

// Eerst de gewone lokale stand (.dev.vars met OMGEVING=lokaal en het testmailadres), zodat
// de app nooit met echte gegevens draait zonder die regels.
if (!zetLokaalKlaar()) {
  console.error(
    ROOD("✗ De lokale database kon niet worden klaargezet. Kijk hierboven welke migratie faalde."),
  );
  process.exit(1);
}
try {
  console.log(samenvatting(laadTestgegevens()));
} catch (fout) {
  console.error(ROOD(`✗ ${fout instanceof Error ? fout.message : String(fout)}`));
  console.error("  De app werkt nog, met de lokale database zoals die nu is.");
  process.exit(1);
}
