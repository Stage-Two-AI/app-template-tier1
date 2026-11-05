// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterAll, describe, expect, it } from "vitest";
import { controleerAfscherming } from "../../tests/helpers/afscherming";
import type { Variabelen } from "../index";
import { wieIsHet } from "./access";

/**
 * De hulp voor de A/B-test per tabel (tests/helpers/afscherming.ts) moet een lek echt zien.
 * Daarom twee kleine apps met een tabel `notities`: één die alleen de eigen rijen geeft, en
 * één die alles aan iedereen geeft.
 */
const MAP = mkdtempSync(join(tmpdir(), "afscherming-"));
writeFileSync(
  join(MAP, "0001_notities.sql"),
  "create table notities (id integer primary key autoincrement, tekst text not null, door text not null);",
);
afterAll(() => rmSync(MAP, { recursive: true, force: true }));

function maakApp(lek: boolean) {
  const app = new Hono<Variabelen>().basePath("/api");
  app.use("*", async (c, next) => {
    const gebruiker = await wieIsHet(c.req.raw, c.env);
    if (!gebruiker) return c.json({ fout: "Niet ingelogd" }, 401);
    c.set("gebruiker", gebruiker);
    await next();
  });
  const filter = lek ? "1 = 1 or door = ?" : "door = ?";
  app.get("/notities", async (c) => {
    const { results } = await c.env.DB.prepare(`select * from notities where ${filter}`)
      .bind(c.var.gebruiker.email)
      .all();
    return c.json(results);
  });
  app.post("/notities", async (c) => {
    const rij = await c.env.DB.prepare(
      "insert into notities (tekst, door) values (?, ?) returning id",
    )
      .bind("van A", c.var.gebruiker.email)
      .first<{ id: number }>();
    return c.json(rij, 201);
  });
  app.get("/notities/:id", async (c) => {
    const rij = await c.env.DB.prepare(`select * from notities where id = ? and (${filter})`)
      .bind(Number(c.req.param("id")), c.var.gebruiker.email)
      .first();
    return rij ? c.json(rij) : c.json({ fout: "Niet gevonden" }, 404);
  });
  app.delete("/notities/:id", async (c) => {
    await c.env.DB.prepare(`delete from notities where id = ? and (${filter})`)
      .bind(Number(c.req.param("id")), c.var.gebruiker.email)
      .run();
    return c.json({ fout: "Niet gevonden" }, 404);
  });
  return app;
}

const opties = (lek: boolean) => ({
  tabel: "notities",
  app: maakApp(lek),
  migraties: MAP,
  maakRijAlsA: async (a: {
    vraag: (pad: string, init?: { method?: string }) => Promise<Response>;
  }) => ((await (await a.vraag("/api/notities", { method: "POST" })).json()) as { id: number }).id,
  lijst: "/api/notities",
  rij: (id: string | number) => `/api/notities/${id}`,
});

describe("controleerAfscherming (tier 1)", () => {
  it("is groen als B alleen zijn eigen rijen ziet", async () => {
    await controleerAfscherming(opties(false));
  });

  it("is rood als B de rij van A ziet", async () => {
    await expect(controleerAfscherming(opties(true))).rejects.toThrow(
      /B ziet de rij van A|B leest/,
    );
  });

  it("vraagt om een lijst of een rij", async () => {
    await expect(
      controleerAfscherming({ tabel: "notities", maakRijAlsA: async () => 1 }),
    ).rejects.toThrow(/lijst of rij/);
  });
});

describe("scripts/guard-tabellen-tests.mjs", () => {
  it("waarschuwt bij een tabel zonder A/B-test, maar is (nog) niet rood", async () => {
    const { execFileSync } = await import("node:child_process");
    const { mkdirSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const map = mkdtempSync(join(tmpdir(), "tabellen-tests-"));
    try {
      mkdirSync(join(map, "migrations"));
      mkdirSync(join(map, "worker"));
      writeFileSync(
        join(map, "migrations/0001.sql"),
        "create table notities (id integer); create table items (id integer); create table orders (id integer);",
      );
      writeFileSync(
        join(map, "stack.config.json"),
        JSON.stringify({ open_tabellen: { items: "gedeeld" } }),
      );
      writeFileSync(
        join(map, "worker/notities.test.ts"),
        'await controleerAfscherming({ tabel: "notities", maakRijAlsA, lijst: "/api/notities" });\n// controleerAfscherming({ tabel: "orders" })',
      );
      const uitvoer = execFileSync(
        "node",
        [resolve(__dirname, "../../scripts/guard-tabellen-tests.mjs")],
        { cwd: map, encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "true" } },
      );
      expect(uitvoer).toContain(
        "::warning title=A/B-test per tabel::1 tabel(len) zonder A/B-test: orders",
      );
    } finally {
      rmSync(map, { recursive: true, force: true });
    }
  });
});
