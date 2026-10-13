/**
 * Een nagebootste D1 voor de tests, op de SQLite die in Node zit. Alle migraties uit
 * migrations/ worden in volgorde toegepast, dus de tests draaien op hetzelfde schema als
 * productie. Alleen wat worker/lib/db.ts gebruikt.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { Database, Statement } from "../../worker/lib/db";

function waarde(w: unknown): SQLInputValue {
  if (w === undefined) return null;
  if (typeof w === "boolean") return w ? 1 : 0;
  if (w === null || typeof w === "number" || typeof w === "string" || typeof w === "bigint")
    return w;
  if (w instanceof Uint8Array) return w;
  return JSON.stringify(w);
}

function statement(db: DatabaseSync, sql: string, waarden: SQLInputValue[] = []): Statement {
  return {
    bind: (...nieuw) => statement(db, sql, nieuw.map(waarde)),
    first: async <T>() => (db.prepare(sql).get(...waarden) as T | undefined) ?? null,
    all: async <T>() => ({ results: db.prepare(sql).all(...waarden) as T[] }),
    run: async () => db.prepare(sql).run(...waarden),
  };
}

export function testDatabase(migraties = "migrations"): Database & { sqlite: DatabaseSync } {
  const db = new DatabaseSync(":memory:");
  for (const bestand of readdirSync(migraties)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    db.exec(readFileSync(join(migraties, bestand), "utf8"));
  }
  return { sqlite: db, prepare: (sql) => statement(db, sql) };
}
