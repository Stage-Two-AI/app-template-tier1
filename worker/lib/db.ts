/**
 * Het deel van D1 dat deze app gebruikt. De servercode praat met deze vorm in plaats van
 * met het hele D1-type, zodat de tests een kleine nagebootste database kunnen gebruiken
 * (tests/helpers/d1.ts, op de SQLite van Node). Een echte D1-binding past er gewoon in.
 */
export interface Statement {
  bind(...waarden: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

export interface Database {
  prepare(sql: string): Statement;
}
