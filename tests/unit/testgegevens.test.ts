import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * `pnpm data:test` (scripts/testgegevens.mjs) haalt met `gh` de testgegevens uit de
 * beheer-repo en laadt ze met `wrangler --local` in de lokale D1 en R2. Deze tests draaien het
 * echte script in een lege map, met een nagemaakte `gh` (op PATH) en een nagemaakte wrangler
 * (in node_modules). Er gaat niets naar GitHub of Cloudflare.
 */
const ROOT = resolve(__dirname, "../..");
const SCRIPT = join(ROOT, "scripts/testgegevens.mjs");
const LIB = join(ROOT, "scripts/lib/testgegevens.mjs");

/** De nagemaakte gh: antwoorden uit scenario.json, elke aanroep in gh.log. */
const NEP_GH = `#!/usr/bin/env node
const { appendFileSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const args = process.argv.slice(2);
const s = JSON.parse(readFileSync(process.env.NEP_SCENARIO, "utf8"));
appendFileSync(process.env.NEP_GH_LOG, JSON.stringify(args) + "\\n");
const sleutel = args.join(" ");
if (args[0] === "run" && args[1] === "download") {
  if (!s.download) { console.error("no artifact"); process.exit(1); }
  const map = args[args.indexOf("-D") + 1];
  mkdirSync(map, { recursive: true });
  for (const [naam, inhoud] of Object.entries(s.download)) writeFileSync(join(map, naam), inhoud);
  process.exit(0);
}
// De langste passende sleutel wint: "api repos/x/y/actions" gaat voor "api repos/x/y".
const passend = Object.entries(s.antwoorden)
  .filter(([begin]) => sleutel.startsWith(begin))
  .sort((a, b) => b[0].length - a[0].length);
for (const [, antwoord] of passend.slice(0, 1)) {
  {
    if (antwoord === null) { console.error("HTTP 404: Not Found"); process.exit(1); }
    process.stdout.write(typeof antwoord === "string" ? antwoord : JSON.stringify(antwoord));
    process.exit(0);
  }
}
console.error("onbekende aanroep: " + sleutel);
process.exit(1);
`;

/** De nagemaakte wrangler: elke aanroep (met de inhoud van --file) in wrangler.log. */
const NEP_WRANGLER = `const { appendFileSync, readFileSync } = require("node:fs");
const args = process.argv.slice(2);
const i = args.indexOf("--file");
const bestand = i === -1 ? null : readFileSync(args[i + 1], "utf8");
appendFileSync(process.env.NEP_WRANGLER_LOG, JSON.stringify({ args, bestand }) + "\\n");
const faal = process.env.NEP_WRANGLER_FAAL;
if (faal && (bestand ?? "").includes(faal)) { console.error("SQLITE_ERROR: " + faal); process.exit(1); }
if (args.includes("--json")) {
  process.stdout.write(JSON.stringify([{ results: [
    { type: "table", name: "items" },
    { type: "table", name: "d1_migrations" },
    { type: "view", name: "overzicht" },
  ], success: true }]));
}
`;

const WRANGLER_JSONC = `{
  "name": "mijn-app",
  "r2_buckets": [{ "binding": "BESTANDEN", "bucket_name": "ce-mijn-app", "jurisdiction": "eu" }],
}`;

const ARTIFACTS = {
  artifacts: [
    {
      id: 1,
      name: "testgegevens-mijn-app",
      expired: false,
      created_at: "2026-10-26T02:41:00Z",
      workflow_run: { id: 11 },
    },
    {
      id: 3,
      name: "testgegevens-mijn-app",
      expired: true,
      created_at: "2026-10-28T02:41:00Z",
      workflow_run: { id: 33 },
    },
    {
      id: 2,
      name: "testgegevens-mijn-app",
      expired: false,
      created_at: "2026-10-27T02:41:00Z",
      workflow_run: { id: 22 },
    },
  ],
};

const D1_SQL = "INSERT INTO items VALUES(1,'echt','klant@bedrijf.nl','2026-10-27');\n";
const BESTANDEN_JSON = JSON.stringify({
  geldig_tot: "2026-11-03T02:41:00Z",
  bestanden: { "foto.jpg": "https://r2.example/foto.jpg?X-Amz-Signature=x" },
});

type Scenario = {
  antwoorden: Record<string, unknown>;
  download?: Record<string, string> | null;
};

const STANDAARD: Scenario = {
  antwoorden: {
    "api repos/klant-org/stagetwo-beheer-tier1": "klant-org/stagetwo-beheer-tier1",
    "api repos/klant-org/stagetwo-beheer-tier1/actions/artifacts": ARTIFACTS,
  },
  download: { "d1.sql": D1_SQL, "bestanden.json": BESTANDEN_JSON },
};

let map: string;

beforeEach(() => {
  map = mkdtempSync(join(tmpdir(), "testgegevens-"));
  mkdirSync(join(map, "bin"));
  writeFileSync(join(map, "bin", "gh"), NEP_GH);
  chmodSync(join(map, "bin", "gh"), 0o755);
  mkdirSync(join(map, "node_modules/wrangler/bin"), { recursive: true });
  writeFileSync(join(map, "node_modules/wrangler/bin/wrangler.js"), NEP_WRANGLER);
  writeFileSync(join(map, "wrangler.jsonc"), WRANGLER_JSONC);
  spawnSync("git", ["init", "-q"], { cwd: map });
  spawnSync("git", ["remote", "add", "origin", "git@github.com:klant-org/mijn-app.git"], {
    cwd: map,
  });
  scenario(STANDAARD);
});

afterEach(() => {
  rmSync(map, { recursive: true, force: true });
});

function scenario(s: Scenario) {
  writeFileSync(join(map, "scenario.json"), JSON.stringify(s));
}

function draai(args: string[], extra: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, args, {
    cwd: map,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${join(map, "bin")}${delimiter}${process.env.PATH ?? ""}`,
      NEP_SCENARIO: join(map, "scenario.json"),
      NEP_GH_LOG: join(map, "gh.log"),
      NEP_WRANGLER_LOG: join(map, "wrangler.log"),
      STAGETWO_BEHEER_REPO: "",
      ...extra,
    },
  });
  return { code: r.status, uitvoer: `${r.stdout}${r.stderr}` };
}

const dataTest = (extra?: Record<string, string>) => draai([SCRIPT], extra);
const lib = (code: string, extra?: Record<string, string>) =>
  draai(
    ["--input-type=module", "-e", `import(${JSON.stringify(LIB)}).then((m) => { ${code} })`],
    extra,
  );

function regels(naam: string): string[] {
  const pad = join(map, naam);
  return existsSync(pad) ? readFileSync(pad, "utf8").trim().split("\n").filter(Boolean) : [];
}
const ghAanroepen = () => regels("gh.log").map((r) => (JSON.parse(r) as string[]).join(" "));
const wranglerAanroepen = () =>
  regels("wrangler.log").map((r) => JSON.parse(r) as { args: string[]; bestand: string | null });

describe("pnpm data:test: echte gegevens in de lokale D1 en R2", () => {
  it("haalt het nieuwste geldige artifact op en laadt het, alleen met --local", () => {
    const r = dataTest();
    expect(r.code, r.uitvoer).toBe(0);
    expect(r.uitvoer).toContain("Testgegevens van mijn-app geladen");

    expect(ghAanroepen().find((a) => a.startsWith("run download"))).toMatch(
      /^run download 22 -R klant-org\/stagetwo-beheer-tier1 -n testgegevens-mijn-app -D /,
    );

    const aanroepen = wranglerAanroepen();
    for (const { args } of aanroepen) {
      expect(args).toContain("--local");
      expect(args).not.toContain("--remote");
    }
    const bestanden = aanroepen.map((a) => a.bestand ?? "");
    const leeg = bestanden.findLastIndex((b) => b.includes('DROP TABLE IF EXISTS "items"'));
    const migraties = aanroepen.findLastIndex((a) =>
      a.args.join(" ").startsWith("d1 migrations apply"),
    );
    const wis = bestanden.findIndex((b) => b.includes('DELETE FROM "items"'));
    const laad = bestanden.findIndex((b) => b.includes("INSERT INTO items"));
    expect(leeg).toBeGreaterThan(-1);
    expect(migraties).toBeGreaterThan(leeg);
    expect(wis).toBeGreaterThan(migraties);
    expect(laad).toBeGreaterThan(wis);

    // Alles weg, ook de lijst van migraties, zodat ze opnieuw draaien; de interne tabellen
    // van D1 (_cf_*, sqlite_*) blijven buiten de lijst die wrangler teruggeeft.
    expect(bestanden[leeg]).toContain('DROP TABLE IF EXISTS "d1_migrations"');
    expect(bestanden[leeg]).toContain('DROP VIEW IF EXISTS "overzicht"');
    expect(bestanden[wis]).not.toContain("d1_migrations");
    expect(bestanden[laad]).toMatch(/^PRAGMA defer_foreign_keys = on;/);

    const r2 = aanroepen.find((a) => a.args[0] === "r2");
    expect(r2?.args.slice(0, 4)).toEqual([
      "r2",
      "object",
      "put",
      "ce-mijn-app/_lokaal/bestanden.json",
    ]);
    expect(r2?.bestand).toBe(BESTANDEN_JSON);

    const staat = JSON.parse(readFileSync(join(map, ".wrangler/testgegevens.json"), "utf8"));
    expect(staat).toMatchObject({
      app: "mijn-app",
      beheer: "klant-org/stagetwo-beheer-tier1",
      artifact: 2,
      gemaakt: "2026-10-27T02:41:00Z",
    });

    // De gewone lokale stand staat er ook: OMGEVING=lokaal in .dev.vars.
    expect(readFileSync(join(map, ".dev.vars"), "utf8")).toMatch(/^OMGEVING=lokaal$/m);
  });

  it("zoekt de enige repo die eindigt op -beheer-tier1 als stagetwo-beheer-tier1 er niet is", () => {
    scenario({
      ...STANDAARD,
      antwoorden: {
        "api repos/klant-org/stagetwo-beheer-tier1": null,
        "repo list klant-org": [
          { name: "mijn-app" },
          { name: "kl-beheer-tier1" },
          { name: "kl-beheer-tier2" },
        ],
        "api repos/klant-org/kl-beheer-tier1/actions/artifacts": ARTIFACTS,
      },
    });
    const r = dataTest();
    expect(r.code, r.uitvoer).toBe(0);
    expect(ghAanroepen().some((a) => a.includes("-R klant-org/kl-beheer-tier1"))).toBe(true);
  });

  it("stopt bij twee kandidaten, en neemt STAGETWO_BEHEER_REPO als die is gezet", () => {
    scenario({
      ...STANDAARD,
      antwoorden: {
        "api repos/klant-org/stagetwo-beheer-tier1": null,
        "repo list klant-org": [{ name: "a-beheer-tier1" }, { name: "b-beheer-tier1" }],
        "api repos/klant-org/eigen-beheer/actions/artifacts": ARTIFACTS,
      },
    });
    const twee = dataTest();
    expect(twee.code).toBe(1);
    expect(twee.uitvoer).toContain("STAGETWO_BEHEER_REPO");
    expect(wranglerAanroepen().some((a) => a.args[0] === "r2")).toBe(false);

    const gekozen = dataTest({ STAGETWO_BEHEER_REPO: "eigen-beheer" });
    expect(gekozen.code, gekozen.uitvoer).toBe(0);
  });

  it("laat de lokale D1 met rust als er geen artifact is", () => {
    scenario({
      ...STANDAARD,
      antwoorden: {
        ...STANDAARD.antwoorden,
        "api repos/klant-org/stagetwo-beheer-tier1/actions/artifacts": {
          artifacts: [{ ...ARTIFACTS.artifacts[1] }],
        },
      },
    });
    const r = dataTest();
    expect(r.code).toBe(1);
    expect(r.uitvoer).toContain("Geen testgegevens voor mijn-app");
    // Alleen de gewone migraties van de lokale stand, niets leeggemaakt.
    expect(wranglerAanroepen().map((a) => a.args.slice(0, 2).join(" "))).toEqual(["d1 migrations"]);
  });

  it("bouwt een lege D1 met alle migraties op als het inladen mislukt, en onthoudt niets", () => {
    const r = dataTest({ NEP_WRANGLER_FAAL: "INSERT INTO items" });
    expect(r.code).toBe(1);
    expect(r.uitvoer).toContain("SQLITE_ERROR");
    const aanroepen = wranglerAanroepen();
    const laad = aanroepen.findIndex((a) => (a.bestand ?? "").includes("INSERT INTO items"));
    const daarna = aanroepen.slice(laad + 1).map((a) => a.bestand ?? a.args.slice(0, 2).join(" "));
    expect(daarna.some((b) => b.includes('DROP TABLE IF EXISTS "items"'))).toBe(true);
    expect(daarna.at(-1)).toBe("d1 migrations");
    expect(existsSync(join(map, ".wrangler/testgegevens.json"))).toBe(false);
  });

  it("draait scripts/lokaal-rol.sql alleen als er meer dan commentaar in staat", () => {
    mkdirSync(join(map, "scripts"));
    writeFileSync(
      join(map, "scripts/lokaal-rol.sql"),
      readFileSync(join(ROOT, "scripts/lokaal-rol.sql")),
    );
    expect(dataTest().code).toBe(0);
    expect(wranglerAanroepen().some((a) => a.args.includes("scripts/lokaal-rol.sql"))).toBe(false);

    rmSync(join(map, "wrangler.log"));
    writeFileSync(
      join(map, "scripts/lokaal-rol.sql"),
      "-- rol\ninsert into rollen (email, rol) values ('lokaal@voorbeeld.nl', 'beheerder');\n",
    );
    const r = dataTest();
    expect(r.code, r.uitvoer).toBe(0);
    const rol = wranglerAanroepen().at(-1);
    expect(rol?.args).toContain("scripts/lokaal-rol.sql");
    expect(rol?.bestand).toContain("lokaal@voorbeeld.nl");
  });
});

describe("de preview ververst bij de eerste start en daarna eens per dag", () => {
  it("moetVerversen: zonder staat, met een kapotte staat en na een dag wel; binnen een dag niet", () => {
    const r = lib(`
      const nu = Date.parse("2026-10-28T12:00:00Z");
      const uur = (n) => ({ geladen: new Date(nu - n * 3600_000).toISOString() });
      console.log(JSON.stringify([
        m.moetVerversen(null, nu),
        m.moetVerversen({ geladen: "gisteren" }, nu),
        m.moetVerversen(uur(2), nu),
        m.moetVerversen(uur(23), nu),
        m.moetVerversen(uur(25), nu),
        m.moetVerversen(uur(-5), nu),
      ]));
    `);
    expect(JSON.parse(r.uitvoer)).toEqual([true, true, false, false, true, true]);
  });

  it("doet niets met recente gegevens, en waarschuwt alleen als het mislukt", () => {
    mkdirSync(join(map, ".wrangler"));
    writeFileSync(
      join(map, ".wrangler/testgegevens.json"),
      JSON.stringify({ geladen: new Date().toISOString() }),
    );
    const vers = lib("console.log(m.verversAlsNodig())");
    expect(vers.uitvoer.trim()).toBe("false");
    expect(ghAanroepen()).toEqual([]);

    rmSync(join(map, ".wrangler/testgegevens.json"));
    scenario({ antwoorden: {} });
    const offline = lib("console.log(m.verversAlsNodig())");
    expect(offline.code).toBe(0);
    expect(offline.uitvoer).toContain("⚠ Testgegevens niet geladen");
    expect(offline.uitvoer).toMatch(/^false$/m);
  });

  it("scripts/preview.mjs ververst na het klaarzetten van de lokale stand en vóór vite", () => {
    const preview = readFileSync(join(ROOT, "scripts/preview.mjs"), "utf8");
    const klaar = preview.indexOf("if (!zetLokaalKlaar())");
    const ververs = preview.indexOf("verversAlsNodig();");
    expect(klaar).toBeGreaterThan(-1);
    expect(ververs).toBeGreaterThan(klaar);
    expect(preview.indexOf("const poort")).toBeGreaterThan(ververs);
  });

  it("is te starten als pnpm data:test, en de bestanden staan in het manifest", () => {
    const pakket = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    expect(pakket.scripts["data:test"]).toBe("node scripts/testgegevens.mjs");
    const manifest = JSON.parse(readFileSync(join(ROOT, ".claude/stack-manifest.json"), "utf8"));
    expect(manifest.vanDeTemplate.vervangen).toEqual(
      expect.arrayContaining([
        "scripts/testgegevens.mjs",
        "scripts/lib/testgegevens.mjs",
        "worker/lib/bestanden.ts",
        "worker/lib/mail.ts",
      ]),
    );
    expect(manifest.vanHetProject).toContain("scripts/lokaal-rol.sql");
  });
});
