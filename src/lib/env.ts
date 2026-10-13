import { z } from "zod";

/**
 * Omgevingsvariabelen van de schermen, één keer gevalideerd bij het opstarten.
 *
 * Alles met de prefix VITE_ zit in de gedownloade bundel en is dus publiek. Zet hier nooit
 * een geheime sleutel neer: die hoort in de servercode (worker/), als geheim van de Worker.
 */

/**
 * Een lege variabele betekent hetzelfde als een afwezige. GitHub Actions geeft een
 * niet-ingestelde `${{ vars.X }}` door als lege tekst; zonder deze stap zou de app daarop
 * crashen.
 */
function leegIsAfwezig(waarden: unknown): unknown {
  if (typeof waarden !== "object" || waarden === null) return waarden;
  return Object.fromEntries(Object.entries(waarden).filter(([, waarde]) => waarde !== ""));
}

const velden = z.object({
  /**
   * Staat deze versie in de testomgeving? Dan `test`, en de app laat dat zien met een balk
   * bovenin. De uitrol zet dit op de preview. In productie ontbreekt hij.
   */
  VITE_OMGEVING: z.enum(["test"]).optional(),
  /**
   * Waar fouten uit de app naartoe gaan (Sentry). Leeg of afwezig: Sentry staat uit. Een DSN
   * is publiek, hij staat toch in de bundel.
   */
  VITE_SENTRY_DSN: z.string().optional(),
});

export const envSchema = z.preprocess(leegIsAfwezig, velden);

const parsed = envSchema.safeParse(import.meta.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `- ${issue.message}`).join("\n");
  throw new Error(`De omgevingsvariabelen kloppen niet:\n${details}`);
}

export const env = parsed.data;
