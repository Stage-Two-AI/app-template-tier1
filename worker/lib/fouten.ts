/**
 * Foutmelding van de servercode naar Sentry, net als de schermen (`src/lib/fouten.ts`).
 * `worker/index.ts` pakt de export in met `Sentry.withSentry(sentryOpties, ...)`; dat meldt
 * een fout in een geplande taak vanzelf. Een fout in een route vangt Hono zelf op
 * (`app.onError`); die meldt hij met `Sentry.captureException`.
 *
 * Staat alleen aan als de Worker een DSN heeft (`SENTRY_DSN`, zet de uitrol uit de
 * GitHub-variabele `VITE_SENTRY_DSN`); zonder DSN gaat er niets de deur uit. Op je eigen
 * computer (`OMGEVING=lokaal`) staat hij altijd uit, ook als er een DSN in .dev.vars staat.
 */
import type { CloudflareOptions } from "@sentry/cloudflare";
import type { Env } from "../env";

/**
 * Geen persoonsgegevens meesturen. Sentry 11 kent `sendDefaultPii` niet meer en verzamelt
 * zonder deze instelling standaard alles; dit is het strikte equivalent van
 * `sendDefaultPii: false`, zoals in de schermen: geen gebruiker of IP-adres, geen cookies,
 * headers, bodies of queryparameters, en geen waarden van lokale variabelen. Daarbij, omdat
 * dit de servercode is: geen gegevens uit databasequery's, wachtrijen of AI-aanroepen.
 */
export const GEEN_PERSOONSGEGEVENS = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  stackFrameVariables: false,
  databaseQueryData: false,
  queues: false,
  genAI: { inputs: false, outputs: false },
  graphQL: { document: false, variables: false },
} satisfies CloudflareOptions["dataCollection"];

/**
 * De instellingen van Sentry, per verzoek uit de variabelen van de Worker. Een lege DSN
 * zet Sentry uit; een ongeldige DSN geeft alleen een melding in de log, nooit een crash.
 */
export function sentryOpties(env: Env): CloudflareOptions {
  const dsn = env.OMGEVING === "lokaal" ? "" : (env.SENTRY_DSN ?? "");
  return {
    // Leeg, niet undefined: anders zoekt Sentry zelf alsnog `SENTRY_DSN` op.
    dsn,
    environment: env.OMGEVING || "productie",
    dataCollection: GEEN_PERSOONSGEGEVENS,
    // Elke aanroep een eigen client met de instellingen van dát moment. Sentry 11 bewaart
    // anders de eerste client voor alle volgende aanroepen, met de DSN en omgeving van toen.
    cacheClient: false,
  };
}
