import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * De lokale stand (scripts/lib/lokaal.mjs): `.dev.vars` met `OMGEVING=lokaal` en het
 * testmailadres uit wrangler.jsonc, daarna de migraties op de lokale D1. De wrangler hier is
 * nagemaakt: hij onthoudt alleen waarmee hij werd aangeroepen.
 */
const LIB = resolve(__dirname, "../../scripts/lib/lokaal.mjs");

let map: string;

beforeEach(() => {
  map = mkdtempSync(join(tmpdir(), "lokaal-"));
  mkdirSync(join(map, "node_modules/wrangler/bin"), { recursive: true });
  writeFileSync(
    join(map, "node_modules/wrangler/bin/wrangler.js"),
    'require("node:fs").appendFileSync("wrangler.log", JSON.stringify(process.argv.slice(2)) + "\\n");',
  );
});

afterEach(() => {
  rmSync(map, { recursive: true, force: true });
});

function klaarzetten(testmail: string) {
  writeFileSync(
    join(map, "wrangler.jsonc"),
    `// uitleg\n{ "name": "app", "vars": { "TESTMAIL_ADRES": ${JSON.stringify(testmail)} } }`,
  );
  const code = `import(${JSON.stringify(LIB)}).then((m) => console.log(m.zetLokaalKlaar()))`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    cwd: map,
    encoding: "utf8",
  });
  return { ok: r.stdout.trim() === "true", devVars: readFileSync(join(map, ".dev.vars"), "utf8") };
}

describe("zetLokaalKlaar", () => {
  it("zet OMGEVING=lokaal en het testmailadres uit wrangler.jsonc in .dev.vars", () => {
    const r = klaarzetten("test@bedrijf.nl");
    expect(r.ok).toBe(true);
    expect(r.devVars).toBe("OMGEVING=lokaal\nTESTMAIL_ADRES=test@bedrijf.nl\n");
    expect(readFileSync(join(map, "wrangler.log"), "utf8")).toContain(
      '["d1","migrations","apply","DB","--local"]',
    );
  });

  it("laat de rest van .dev.vars staan en volgt een gewijzigd adres", () => {
    writeFileSync(
      join(map, ".dev.vars"),
      "OMGEVING=lokaal\nRESEND_API_KEY=re_test\nTESTMAIL_ADRES=oud@bedrijf.nl",
    );
    const r = klaarzetten("nieuw@bedrijf.nl");
    expect(r.devVars).toBe(
      "OMGEVING=lokaal\nRESEND_API_KEY=re_test\nTESTMAIL_ADRES=nieuw@bedrijf.nl",
    );
    expect(klaarzetten("").devVars).toBe(
      "OMGEVING=lokaal\nRESEND_API_KEY=re_test\nTESTMAIL_ADRES=",
    );
  });
});
