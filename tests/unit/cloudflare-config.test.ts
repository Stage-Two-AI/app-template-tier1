import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * `wrangler.jsonc` is van het project (naam, adres en database verschillen per app), maar een
 * paar regels moeten in elke app gelijk zijn. `scripts/lib/cloudflare-config.mjs` controleert
 * dat; deze test draait die controle zoals CI dat doet: als los Node-proces in een map.
 */
const LIB = resolve(__dirname, "../../scripts/lib/cloudflare-config.mjs");
const TEMPLATE = readFileSync(resolve(__dirname, "../../wrangler.jsonc"), "utf8");

let map: string;
beforeEach(() => {
  map = mkdtempSync(join(tmpdir(), "cf-config-"));
});
afterEach(() => {
  rmSync(map, { recursive: true, force: true });
});

const d1 = (id: string) => [
  { binding: "DB", database_name: `db-${id}`, database_id: id, migrations_dir: "migrations" },
];
const r2 = (naam: string) => [{ binding: "BESTANDEN", bucket_name: naam }];

const GOED = {
  name: "app",
  main: "worker/index.ts",
  compatibility_date: "2026-10-01",
  assets: { not_found_handling: "single-page-application", run_worker_first: ["/api/*"] },
  workers_dev: false,
  preview_urls: true,
  routes: [{ pattern: "app.klant.nl", custom_domain: true }],
  d1_databases: d1("prod"),
  r2_buckets: r2("app"),
  env: {
    preview: { vars: { OMGEVING: "test" }, d1_databases: d1("test"), r2_buckets: r2("app-test") },
  },
};

function controleer(config: object | string): { code: number | null; uitvoer: string } {
  writeFileSync(
    join(map, "wrangler.jsonc"),
    typeof config === "string" ? config : JSON.stringify(config),
  );
  const code = `import(${JSON.stringify(LIB)}).then((m) => console.log(JSON.stringify(m.cloudflareConfig())))`;
  const r = spawnSync("node", ["--input-type=module", "-e", code], { cwd: map, encoding: "utf8" });
  return { code: r.status, uitvoer: `${r.stdout}${r.stderr}` };
}

describe("cloudflareConfig: één Worker met servercode, D1 en R2", () => {
  it("laat de wrangler.jsonc van de template door (tijdelijke stand, met commentaar)", () => {
    const r = controleer(TEMPLATE);
    expect(r.code, r.uitvoer).toBe(0);
    expect(JSON.parse(r.uitvoer)).toMatchObject({ stand: "tijdelijk" });
  });

  it("geeft naam, stand en domein terug in de standaardstand", () => {
    const r = controleer(GOED);
    expect(r.code, r.uitvoer).toBe(0);
    expect(JSON.parse(r.uitvoer)).toEqual({
      worker: "app",
      stand: "standaard",
      hostname: "app.klant.nl",
    });
  });

  it("eist de servercode in worker/index.ts en /api eerst naar de Worker", () => {
    expect(controleer({ ...GOED, main: "src/index.ts" }).uitvoer).toContain("`main` moet");
    const zonderApi = { ...GOED, assets: { not_found_handling: "single-page-application" } };
    expect(controleer(zonderApi).uitvoer).toContain("run_worker_first");
  });

  it("weigert opslag buiten D1 en R2, ook binnen env.preview", () => {
    const kv = controleer({ ...GOED, kv_namespaces: [{ binding: "X", id: "y" }] });
    expect(kv.code).toBe(1);
    expect(kv.uitvoer).toContain("gegevens staan in D1, bestanden in R2");
    const preview = { ...GOED.env.preview, durable_objects: { bindings: [] } };
    expect(controleer({ ...GOED, env: { preview } }).uitvoer).toContain(
      "env.preview.durable_objects",
    );
  });

  it("eist een preview met een eigen D1 en R2", () => {
    const { env: _weg, ...zonder } = GOED;
    expect(controleer(zonder).uitvoer).toContain("`env.preview` ontbreekt");
    const zelfdeDb = {
      ...GOED,
      env: { preview: { ...GOED.env.preview, d1_databases: d1("prod") } },
    };
    expect(controleer(zelfdeDb).uitvoer).toContain("dezelfde opslag als productie (prod)");
    const zelfdeR2 = { ...GOED, env: { preview: { ...GOED.env.preview, r2_buckets: r2("app") } } };
    expect(controleer(zelfdeR2).uitvoer).toContain("dezelfde opslag als productie (app)");
  });

  it("geeft een preview geen eigen adres, code of geplande taken", () => {
    for (const sleutel of ["routes", "workers_dev", "main", "triggers"]) {
      const preview = { ...GOED.env.preview, [sleutel]: sleutel === "workers_dev" };
      expect(controleer({ ...GOED, env: { preview } }).uitvoer).toContain(`env.preview.${sleutel}`);
    }
  });

  it("weigert de lokale stand (geen Access) in wrangler.jsonc", () => {
    expect(controleer({ ...GOED, vars: { OMGEVING: "lokaal" } }).uitvoer).toContain(
      "vars.OMGEVING",
    );
    const preview = { ...GOED.env.preview, vars: { OMGEVING: "lokaal" } };
    expect(controleer({ ...GOED, env: { preview } }).uitvoer).toContain(
      "env.preview.vars.OMGEVING",
    );
  });

  it("houdt de twee standen voor het adres", () => {
    const tweeAdressen = { ...GOED, workers_dev: true };
    expect(controleer(tweeAdressen).uitvoer).toContain("twee adressen");
    const { workers_dev: _w, ...zonderWorkersDev } = GOED;
    expect(controleer(zonderWorkersDev).uitvoer).toContain("`workers_dev` ontbreekt");
    const zonderDomein = { ...GOED, routes: [] };
    expect(controleer(zonderDomein).uitvoer).toContain("geen route met `custom_domain: true`");
    const tweeDomeinen = {
      ...GOED,
      routes: [...GOED.routes, { pattern: "b.klant.nl", custom_domain: true }],
    };
    expect(controleer(tweeDomeinen).uitvoer).toContain("precies één route");
  });

  it("laat cron, Workers AI en observability toe", () => {
    const r = controleer({
      ...GOED,
      triggers: { crons: ["0 7 * * *"] },
      ai: { binding: "AI" },
      observability: { enabled: true },
    });
    expect(r.code, r.uitvoer).toBe(0);
  });
});

describe("isIngericht en previewConfig", () => {
  const lib = (code: string) => {
    const r = spawnSync(
      "node",
      ["--input-type=module", "-e", `import(${JSON.stringify(LIB)}).then((m) => { ${code} })`],
      {
        cwd: map,
        encoding: "utf8",
      },
    );
    return `${r.stdout}${r.stderr}`.trim();
  };

  it("is pas ingericht als de database-id's geen nullen meer zijn", () => {
    writeFileSync(join(map, "wrangler.jsonc"), TEMPLATE);
    expect(lib("console.log(m.isIngericht())")).toBe("false");
    writeFileSync(join(map, "wrangler.jsonc"), JSON.stringify(GOED));
    expect(lib("console.log(m.isIngericht())")).toBe("true");
  });

  it("neemt de opslag van env.preview, de naam <app>-preview en de gebouwde code, nooit de opslag van productie", () => {
    writeFileSync(join(map, "wrangler.jsonc"), JSON.stringify(GOED));
    const uit = JSON.parse(
      lib(
        'console.log(JSON.stringify(m.previewConfig(m.leesWrangler(), { worker: "/p/w.js", assets: "/p/c" })))',
      ),
    );
    expect(uit.name).toBe("app-preview");
    expect(uit.main).toBe("/p/w.js");
    expect(uit.assets.directory).toBe("/p/c");
    expect(uit.no_bundle).toBe(true);
    expect(uit.d1_databases[0].database_id).toBe("test");
    expect(uit.r2_buckets[0].bucket_name).toBe("app-test");
    expect(uit.vars.OMGEVING).toBe("test");
    expect(uit.routes).toBeUndefined();
    expect(JSON.stringify(uit)).not.toContain('"prod"');
  });
});
