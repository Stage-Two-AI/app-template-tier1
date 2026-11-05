import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fail, pass } from "./lib/changed-files.mjs";

/**
 * Per tabel een A/B-test: gebruiker B ziet, wijzigt en verwijdert via de API de rij van
 * gebruiker A niet. In tier 1 zit de toegang in de servercode (worker/), niet in de
 * database: D1 kent geen beveiliging per rij. Wat de servercode afschermt, ziet alleen een
 * test die het als twee gebruikers probeert.
 *
 * Elke tabel uit migrations/*.sql moet ofwel voorkomen in een aanroep
 * `controleerAfscherming({ tabel: "<naam>", ... })` (de hulp in tests/helpers/afscherming.ts)
 * in een test in worker/ of tests/, ofwel met een reden in `open_tabellen` in
 * stack.config.json staan (iedereen binnen ziet alle rijen, zoals de voorbeeldtabel items).
 *
 * Eerst een waarschuwing, daarna rood. Bestaande apps hebben soms veel tabellen zonder
 * A/B-test; meteen rood zou daar elke pull request stilzetten. In deze uitgave meldt de guard
 * de ontbrekende tabellen (in GitHub als waarschuwing bij de run); in de volgende uitgave
 * zet de werkplaats VERPLICHT op true en is hij rood.
 */
const VERPLICHT = false;

function zonderCommentaar(tekst) {
  return tekst.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

function bestanden(map, eind) {
  let namen = [];
  try {
    namen = readdirSync(map);
  } catch {
    return [];
  }
  return namen.flatMap((naam) => {
    const pad = join(map, naam);
    if (naam === "node_modules") return [];
    if (statSync(pad).isDirectory()) return bestanden(pad, eind);
    return eind.test(naam) ? [pad] : [];
  });
}

// De tabellen: alle `create table` en `drop table` in volgorde, zonder SQL-commentaar.
const tabellen = new Set();
for (const pad of bestanden("migrations", /\.sql$/).sort()) {
  const sql = readFileSync(pad, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
  const opdracht =
    /\b(create\s+table\s+(?:if\s+not\s+exists\s+)?|drop\s+table\s+(?:if\s+exists\s+)?)["`[]?(\w+)["`\]]?/gi;
  for (const m of sql.matchAll(opdracht)) {
    const naam = (m[2] ?? "").toLowerCase();
    if (/^create/i.test(m[1] ?? "")) tabellen.add(naam);
    else tabellen.delete(naam);
  }
}
// Tabellen van D1 en SQLite zelf tellen niet.
for (const t of [...tabellen]) if (/^(?:sqlite_|_cf_|d1_)/.test(t)) tabellen.delete(t);
if (tabellen.size === 0) pass("geen tabellen in migrations/");

const tests = [...bestanden("worker", /\.test\.tsx?$/), ...bestanden("tests", /\.test\.tsx?$/)]
  .map((pad) => zonderCommentaar(readFileSync(pad, "utf8")))
  .join("\n");
const aanroep = /controleerAfscherming\(\s*\{[\s\S]{0,200}?\btabel:\s*["'`](\w+)["'`]/g;
const gedekt = new Set([...tests.matchAll(aanroep)].map((m) => (m[1] ?? "").toLowerCase()));

let open = {};
try {
  open = JSON.parse(readFileSync("stack.config.json", "utf8")).open_tabellen ?? {};
} catch {}
const zonder = [...tabellen].filter((t) => !gedekt.has(t) && !(t in open)).sort();

if (zonder.length === 0) {
  pass(`${tabellen.size} tabel(len): elk een A/B-test of een regel in open_tabellen`);
}

const uitleg = [
  ...zonder.map((t) => `- ${t}`),
  "",
  "Zet per tabel een A/B-test naast de route in worker/ (de hulp staat in tests/helpers/afscherming.ts):",
  "",
  '  it("<tabel>: B ziet de rij van A niet", async () => {',
  "    await controleerAfscherming({",
  '      tabel: "<tabel>",',
  '      maakRijAlsA: async (a) => ((await (await a.vraag("/api/<pad>", { method: "POST", body: {} })).json()) as { id: number }).id,',
  '      lijst: "/api/<pad>",',
  // biome-ignore lint/suspicious/noTemplateCurlyInString: voorbeeldcode in de uitleg, geen template
  "      rij: (id) => `/api/<pad>/${id}`,",
  "    });",
  "  });",
  "",
  "Ziet iedereen die binnen is alle rijen van deze tabel, en is dat de bedoeling? Zet hem dan",
  'met een reden in stack.config.json: "open_tabellen": { "<tabel>": "<waarom>" }.',
];

if (VERPLICHT) fail("Tabellen zonder A/B-test (gebruiker B ziet de rij van A niet):", uitleg);

const titel = `${zonder.length} tabel(len) zonder A/B-test: ${zonder.join(", ")}`;
if (process.env.GITHUB_ACTIONS) {
  console.log(
    `::warning title=A/B-test per tabel::${titel}. Vanaf de volgende uitgave van Stage Two is dit rood.`,
  );
}
console.log(`! ${titel}`);
console.log("  Nu nog een waarschuwing; vanaf de volgende uitgave van Stage Two is dit rood.");
for (const regel of uitleg) console.log(`  ${regel}`);
process.exit(0);
