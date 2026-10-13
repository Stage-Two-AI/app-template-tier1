#!/usr/bin/env node
/**
 * Een apparaat toegang geven tot de servercode van deze app, of die weer intrekken.
 *
 *   pnpm apparaat:nieuw <naam>                  nieuwe sleutel; de vingerafdruk komt in
 *                                               worker/apparaten.json
 *   pnpm apparaat:nieuw -- --intrekken <naam>   de regel weer weghalen
 *
 * De sleutel verschijnt één keer, hier in de terminal. Zet hem op het apparaat (bijvoorbeeld in
 * een .env-bestand met rechten 600) en nergens anders: niet in git, niet in een chat. Kwijt?
 * Trek het apparaat in en maak een nieuwe. Het werkt pas na de merge, als de app opnieuw is
 * uitgerold. Zie worker/lib/apparaat.ts.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

export const BESTAND = "worker/apparaten.json";
export const LEEG = {
  $beschrijving:
    "Apparaten die de servercode mogen aanroepen met een eigen sleutel. Alleen de vingerafdruk (SHA-256) staat hier, nooit de sleutel. Toevoegen en intrekken met pnpm apparaat:nieuw. Zie worker/lib/apparaat.ts.",
  apparaten: [],
};
export const GELDIGE_NAAM = /^[a-z0-9][a-z0-9-]{1,40}$/;

export function nieuweSleutel() {
  return randomBytes(32).toString("base64url");
}

export function vingerafdruk(sleutel) {
  return createHash("sha256").update(sleutel).digest("hex");
}

/** Geeft de nieuwe inhoud van apparaten.json terug; gooit bij een ongeldige of dubbele naam. */
export function voegToe(inhoud, naam, sha256) {
  if (!GELDIGE_NAAM.test(naam))
    throw new Error(`ongeldige naam "${naam}": kleine letters, cijfers en streepjes`);
  if (inhoud.apparaten.some((a) => a.naam === naam))
    throw new Error(`apparaat "${naam}" bestaat al; trek het eerst in`);
  return { ...inhoud, apparaten: [...inhoud.apparaten, { naam, sha256 }] };
}

export function trekIn(inhoud, naam) {
  if (!inhoud.apparaten.some((a) => a.naam === naam))
    throw new Error(`apparaat "${naam}" staat er niet in`);
  return { ...inhoud, apparaten: inhoud.apparaten.filter((a) => a.naam !== naam) };
}

function main(args) {
  // Staat de lijst er nog niet, dan begint hij leeg.
  const inhoud = existsSync(BESTAND) ? JSON.parse(readFileSync(BESTAND, "utf8")) : LEEG;
  const intrekken = args[0] === "--intrekken";
  const naam = intrekken ? args[1] : args[0];
  if (!naam) {
    console.error(
      "Gebruik: pnpm apparaat:nieuw <naam>   of   pnpm apparaat:nieuw -- --intrekken <naam>",
    );
    process.exit(1);
  }
  try {
    if (intrekken) {
      writeFileSync(BESTAND, `${JSON.stringify(trekIn(inhoud, naam), null, 2)}\n`);
      console.log(`✓ ${naam} ingetrokken. Na de merge en de uitrol werkt de sleutel niet meer.`);
      return;
    }
    const sleutel = nieuweSleutel();
    mkdirSync(dirname(BESTAND), { recursive: true });
    writeFileSync(
      BESTAND,
      `${JSON.stringify(voegToe(inhoud, naam, vingerafdruk(sleutel)), null, 2)}\n`,
    );
    console.log(`✓ ${naam} toegevoegd aan ${BESTAND}.`);
    console.log("");
    console.log(
      "De sleutel, alleen nu zichtbaar. Zet hem op het apparaat, niet in git of een chat:",
    );
    console.log("");
    console.log(`  ${sleutel}`);
    console.log("");
    console.log("Het apparaat stuurt hem mee in de kop x-apparaat-sleutel. Hij werkt na de merge,");
    console.log("als de app opnieuw is uitgerold.");
  } catch (f) {
    console.error(`✗ ${f.message}`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main(process.argv.slice(2));
