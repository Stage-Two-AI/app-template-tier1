/**
 * Een bestand uit R2 lezen. Gebruik dit in plaats van `c.env.BESTANDEN.get(...)`: in
 * productie en in de preview doet het precies hetzelfde, maar op je eigen computer haalt het
 * een bestand dat lokaal nog ontbreekt op uit de testbestanden bij Cloudflare.
 *
 * Hoe dat lokaal werkt: `pnpm data:test` zet de lijst `_lokaal/bestanden.json` in de lokale
 * R2. Daarin staat per bestand een tijdelijke leeslink (hoogstens 7 dagen geldig) naar de
 * test-R2, klaargezet door Testdatabase verversen in de beheer-repo. Vraagt de app een
 * bestand dat lokaal ontbreekt, dan haalt deze functie het met die link op, bewaart het in de
 * lokale R2 en geeft het terug. Zo staan alleen bekeken bestanden op de laptop.
 *
 * In productie en in de preview is dit onbereikbaar: het ophalen gebeurt alleen als
 * `OMGEVING` precies `lokaal` is. Die stand staat alleen in `.dev.vars` op je eigen computer;
 * guard:cloudflare weigert hem in wrangler.jsonc en de preview krijgt altijd `test`. Een
 * sleutel onder `_lokaal/` geeft deze functie nooit terug, in geen enkele omgeving.
 */

/** Alleen wat deze functie leest, zodat hij met elke `Env` werkt. */
export type BestandenOmgeving = { OMGEVING?: string; BESTANDEN?: R2Bucket };

/** De lijst met leeslinks, alleen in de lokale R2. */
export const LIJST = "_lokaal/bestanden.json";

type Lijst = { geldig_tot?: unknown; bestanden?: unknown };

export async function leesBestand(
  env: BestandenOmgeving,
  sleutel: string,
  haal: typeof fetch = fetch,
): Promise<R2ObjectBody | null> {
  const r2 = env.BESTANDEN;
  if (!r2) throw new Error("Deze app heeft geen bestanden (R2-binding BESTANDEN ontbreekt).");
  if (sleutel.startsWith("_lokaal/")) return null;
  const bestand = await r2.get(sleutel);
  if (bestand || env.OMGEVING !== "lokaal") return bestand;
  return haalUitTest(r2, sleutel, haal);
}

/** Alleen lokaal: het bestand ophalen met de leeslink uit de lijst en lokaal bewaren. */
async function haalUitTest(
  r2: R2Bucket,
  sleutel: string,
  haal: typeof fetch,
): Promise<R2ObjectBody | null> {
  const opgeslagen = await r2.get(LIJST);
  if (!opgeslagen) return null;
  let lijst: Lijst;
  try {
    lijst = (await opgeslagen.json()) as Lijst;
  } catch {
    return null;
  }
  const tot = typeof lijst.geldig_tot === "string" ? Date.parse(lijst.geldig_tot) : Number.NaN;
  if (!(tot > Date.now())) {
    console.warn("De leeslinks naar de testbestanden zijn verlopen. Draai `pnpm data:test`.");
    return null;
  }
  const links = lijst.bestanden;
  const link =
    typeof links === "object" && links !== null
      ? Object.getOwnPropertyDescriptor(links, sleutel)?.value
      : undefined;
  if (typeof link !== "string" || !link.startsWith("https://")) return null;
  const antwoord = await haal(link);
  if (!antwoord.ok) {
    console.warn(`Testbestand ${sleutel} niet op te halen (${antwoord.status}).`);
    return null;
  }
  const soort = antwoord.headers.get("content-type");
  await r2.put(
    sleutel,
    await antwoord.arrayBuffer(),
    soort ? { httpMetadata: { contentType: soort } } : {},
  );
  return r2.get(sleutel);
}
