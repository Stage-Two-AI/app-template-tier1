import type { Database } from "./lib/db";

/**
 * Wat de Worker van Cloudflare meekrijgt: de bindings uit wrangler.jsonc en de variabelen
 * die de uitrol zet. Geheimen (sleutels van andere systemen) zet de owner met
 * `wrangler secret put`; voeg ze hier toe als optioneel en geef een duidelijke fout als ze
 * ontbreken.
 */
export interface Env {
  /** De database (D1). In de preview een eigen testdatabase. */
  DB: Database;
  /** De bestanden (R2). In de preview een eigen testopslag. */
  BESTANDEN?: R2Bucket;
  /**
   * `productie` (leeg), `test` (de preview) of `lokaal` (alleen in .dev.vars op je eigen
   * computer: dan is er geen Access en geldt een vaste testgebruiker).
   */
  OMGEVING?: string;
  /**
   * Waar mail naartoe gaat buiten productie: `vars.TESTMAIL_ADRES` in wrangler.jsonc (geen
   * geheim). Zie `bepaalOntvangers` in worker/lib/mail.ts.
   */
  TESTMAIL_ADRES?: string;
  /** Het Zero Trust-team, bijvoorbeeld `stagetwo`. Zet de uitrol. */
  ACCESS_TEAM?: string;
  /** De Audience-tags van de Access-apps voor deze app, met komma's. Zet de uitrol. */
  ACCESS_AUD?: string;
  /**
   * Waar fouten uit de servercode naartoe gaan (Sentry), dezelfde DSN als de schermen. Zet
   * de uitrol uit de GitHub-variabele `VITE_SENTRY_DSN`. Leeg of afwezig: Sentry staat uit.
   */
  SENTRY_DSN?: string;
}
