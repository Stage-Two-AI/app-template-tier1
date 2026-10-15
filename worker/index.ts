/**
 * De servercode van deze app. Alles onder /api komt hier binnen (zie `run_worker_first` in
 * wrangler.jsonc); de rest zijn de gebouwde schermen.
 *
 * De deur: Cloudflare Access staat voor de hele app. Deze code controleert het bewijs van
 * Access nog een keer (`wieIsHet`) en weigert elk verzoek zonder geldige gebruiker, behalve op
 * de routes onder "Publiek" hieronder. Een pad publiek maken gaat dus op twee plekken: hier
 * (de route vóór `vereisInlog`) en in toegang.json van de beheer-repo (zodat de deur het
 * doorlaat).
 *
 * Fouten gaan naar Sentry als de Worker een DSN heeft (zie `worker/lib/fouten.ts`).
 */
import * as Sentry from "@sentry/cloudflare";
import { Hono } from "hono";
import type { Env } from "./env";
import { type Gebruiker, wieIsHet } from "./lib/access";
import { sentryOpties } from "./lib/fouten";
import { items } from "./routes/items";

export type Variabelen = { Bindings: Env; Variables: { gebruiker: Gebruiker } };

export const app = new Hono<Variabelen>().basePath("/api");

// Publiek: zonder inlog bereikbaar. Alleen als het pad ook in toegang.json publiek staat.
app.get("/gezond", (c) => c.json({ ok: true }));

// Vanaf hier alleen met een geldige gebruiker.
app.use("*", async (c, next) => {
  const gebruiker = await wieIsHet(c.req.raw, c.env);
  if (!gebruiker) return c.json({ fout: "Niet ingelogd" }, 401);
  c.set("gebruiker", gebruiker);
  await next();
});

app.get("/ik", (c) => c.json(c.var.gebruiker));
app.route("/items", items);

app.notFound((c) => c.json({ fout: "Onbekend adres" }, 404));
app.onError((fout, c) => {
  console.error(fout);
  // Hono vangt de fout hier zelf op, dus Sentry ziet hem alleen als we hem melden.
  Sentry.captureException(fout);
  return c.json({ fout: "Er ging iets mis" }, 500);
});

export default Sentry.withSentry(sentryOpties, {
  fetch: app.fetch,
  // Geplande taken (triggers.crons in wrangler.jsonc). Alleen `fetch` en `scheduled` horen in
  // deze export: met iets anders erbij vuurt de cron niet.
  async scheduled(_controller: ScheduledController, _env: Env, _ctx: ExecutionContext) {},
} satisfies ExportedHandler<Env>);
