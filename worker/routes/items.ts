/**
 * Voorbeeld: een lijst die je aanvult. Laat zien hoe een route de gebruiker, de database en
 * validatie gebruikt. Vervang of verwijder hem als je de app bouwt.
 */
import { Hono } from "hono";
import { itemInputSchema } from "../../src/lib/validation";
import type { Variabelen } from "../index";

export type Item = { id: number; titel: string; door: string; gemaakt_op: string };

export const items = new Hono<Variabelen>()
  .get("/", async (c) => {
    const { results } = await c.env.DB.prepare(
      "select id, titel, door, gemaakt_op from items order by id desc limit 100",
    ).all<Item>();
    return c.json(results);
  })
  .post("/", async (c) => {
    // Dezelfde regels als in het formulier (src/lib/validation.ts), want de browser is geen
    // beveiliging.
    const invoer = itemInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!invoer.success)
      return c.json({ fout: invoer.error.issues[0]?.message ?? "Ongeldig" }, 400);
    const item = await c.env.DB.prepare(
      "insert into items (titel, door) values (?, ?) returning id, titel, door, gemaakt_op",
    )
      .bind(invoer.data.titel, c.var.gebruiker.email)
      .first<Item>();
    return c.json(item, 201);
  });
