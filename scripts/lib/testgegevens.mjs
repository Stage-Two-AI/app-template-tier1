import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { leesWrangler } from "./cloudflare-config.mjs";

/**
 * Echte gegevens op je eigen computer (`pnpm data:test`, en de preview van de Claude-app).
 *
 * Testdatabase verversen in de beheer-repo zet elke nacht een kopie van productie in de
 * testomgeving van deze app, en bewaart daarna een artifact `testgegevens-<app>` (3 dagen):
 *   - `d1.sql`: alleen de gegevens van de test-D1, zonder `d1_migrations` en `_cf_*`;
 *   - `bestanden.json`: per bestand in de test-R2 een tijdelijke leeslink (7 dagen).
 * Dit script haalt dat artifact op met `gh`, waarmee je al bent ingelogd. Wie bij de
 * beheer-repo mag, kan het ophalen; er is geen sleutel van Cloudflare voor nodig.
 *
 * Wat het daarna doet, alleen lokaal (alles met `--local`, in `.wrangler/`):
 *   1. de lokale D1 leegmaken, alle migraties draaien en `d1.sql` inladen;
 *   2. `bestanden.json` als `_lokaal/bestanden.json` in de lokale R2 zetten. De servercode
 *      haalt een ontbrekend bestand daarmee pas op als het gevraagd wordt
 *      (worker/lib/bestanden.ts);
 *   3. `scripts/lokaal-rol.sql` draaien, als dat bestand opdrachten bevat: daarmee krijgt de
 *      vaste lokale gebruiker lokaal@voorbeeld.nl een rol, want die staat niet in productie;
 *   4. onthouden wanneer dat was (`.wrangler/testgegevens.json`), zodat de preview na een
 *      dag opnieuw ververst.
 * Eerst wordt alles opgehaald en gecontroleerd; pas dan gaat de lokale D1 leeg. Mislukt het
 * inladen, dan blijft een lege D1 met alle migraties over, zoals zonder testgegevens.
 */

export const STAAT = join(".wrangler", "testgegevens.json");
export const LIJST = "_lokaal/bestanden.json";
const ROL = join("scripts", "lokaal-rol.sql");
const DAG_MS = 24 * 60 * 60 * 1000;
const WRANGLER = join("node_modules", "wrangler", "bin", "wrangler.js");

/** Een fout met een zin voor de gebruiker. */
class Mislukt extends Error {}

/** Moet de preview de testgegevens (opnieuw) laden? Bij de eerste keer en na een dag. */
export function moetVerversen(staat, nu = Date.now()) {
  const geladen = Date.parse(staat?.geladen ?? "");
  return !(geladen <= nu && nu - geladen < DAG_MS);
}

export function leesStaat(pad = STAAT) {
  try {
    return JSON.parse(readFileSync(pad, "utf8"));
  } catch {
    return null;
  }
}

/** Organisatie en repo uit de GitHub-remote, of null. */
export function repoUitRemote(url) {
  const m = /github\.com[/:]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(url.trim());
  return m ? { org: m[1], repo: m[2] } : null;
}

function draai(opdracht, args, { timeout = 120_000 } = {}) {
  const uit = spawnSync(opdracht, args, {
    encoding: "utf8",
    timeout,
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" },
  });
  if (uit.error?.code === "ENOENT") {
    throw new Mislukt(`${opdracht} ontbreekt op deze computer. Draai /stagetwo-tier1:installatie.`);
  }
  if (uit.error) throw new Mislukt(`${opdracht} liep vast (${uit.error.message}).`);
  return { ok: uit.status === 0, stdout: uit.stdout ?? "", stderr: uit.stderr ?? "" };
}

function eersteRegel(tekst) {
  return (
    tekst
      .split("\n")
      .map((r) => r.trim())
      .find(Boolean) ?? "geen melding"
  );
}

function gh(args, opties) {
  const uit = draai("gh", args, opties);
  if (!uit.ok)
    throw new Mislukt(`gh ${args[0]} ${args[1] ?? ""} mislukte: ${eersteRegel(uit.stderr)}`);
  return uit.stdout;
}

function wrangler(args) {
  const uit = draai(process.execPath, [WRANGLER, ...args], { timeout: 600_000 });
  if (!uit.ok) {
    throw new Mislukt(
      `wrangler ${args.slice(0, 2).join(" ")} mislukte:\n${(uit.stderr || uit.stdout).trim()}`,
    );
  }
  return uit.stdout;
}

/**
 * Organisatie en app-naam. De app-naam is de naam van de app in `toegang.json` van de
 * beheer-repo, en daarmee het achtervoegsel van het artifact. Die naam is de naam van de
 * app-repo: App inrichten krijgt één invoer `app` en gebruikt die zowel als repo
 * (`<org>/<app>`) als als sleutel in toegang.json. De Worker-naam in wrangler.jsonc is
 * meestal hetzelfde (nieuwe-app zet hem zo), maar kan bij een overgezette app afwijken; de
 * repo-naam niet. Daarom komen organisatie en app allebei uit de git-remote `origin`.
 */
export function appUitGit() {
  const uit = draai("git", ["remote", "get-url", "origin"]);
  const repo = uit.ok ? repoUitRemote(uit.stdout) : null;
  if (!repo) {
    throw new Mislukt("Deze map heeft geen GitHub-remote `origin`, dus de app is niet te bepalen.");
  }
  return { org: repo.org, app: repo.repo };
}

/**
 * De beheer-repo van tier 1 waar deze app in staat: `STAGETWO_BEHEER_REPO` als die is gezet
 * (`naam` of `org/naam`), anders de repo's in de organisatie die eindigen op `-beheer-tier1`
 * (`stagetwo-beheer-tier1` ook). Is er één, dan die. Zijn er meer (Stage Two zelf heeft er
 * twee), dan de enige waarin de app in `toegang.json` onder `apps` staat.
 */
export function vindBeheerRepo(org, app, omgeving = process.env) {
  const gekozen = omgeving.STAGETWO_BEHEER_REPO?.trim();
  if (gekozen) return gekozen.includes("/") ? gekozen : `${org}/${gekozen}`;
  const namen = JSON.parse(gh(["repo", "list", org, "--json", "name", "--limit", "1000"]))
    .map((r) => r.name)
    .filter((n) => typeof n === "string" && n.endsWith("-beheer-tier1"));
  if (namen.length === 0) {
    throw new Mislukt(
      `Geen beheer-repo gevonden in ${org} (of je mag er niet bij). Zet STAGETWO_BEHEER_REPO als hij anders heet.`,
    );
  }
  if (namen.length === 1) return `${org}/${namen[0]}`;
  const metApp = namen.filter((n) => staatInToegang(`${org}/${n}`, app));
  if (metApp.length === 1) return `${org}/${metApp[0]}`;
  throw new Mislukt(
    metApp.length === 0
      ? `${app} staat in geen van de beheer-repo's in ${org} (${namen.join(", ")}). Kies er een met STAGETWO_BEHEER_REPO.`
      : `${app} staat in meer dan één beheer-repo in ${org} (${metApp.join(", ")}). Kies er een met STAGETWO_BEHEER_REPO.`,
  );
}

/** Staat `app` in `toegang.json` van `repo` onder `apps`? Niet te lezen telt als nee. */
function staatInToegang(repo, app) {
  const r = draai("gh", [
    "api",
    `repos/${repo}/contents/toegang.json`,
    "-H",
    "Accept: application/vnd.github.raw",
  ]);
  if (!r.ok) return false;
  try {
    return Object.hasOwn(JSON.parse(r.stdout)?.apps ?? {}, app);
  } catch {
    return false;
  }
}

/** Het nieuwste artifact `testgegevens-<app>` dat nog niet verlopen is. */
export function nieuwsteArtifact(beheer, app) {
  const naam = `testgegevens-${app}`;
  const { artifacts = [] } = JSON.parse(
    gh(["api", `repos/${beheer}/actions/artifacts?name=${naam}&per_page=100`]),
  );
  const geldig = artifacts
    .filter((a) => a?.name === naam && !a.expired && a.workflow_run?.id)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  if (!geldig[0]) {
    throw new Mislukt(
      `Geen testgegevens voor ${app} in ${beheer}. Draait Testdatabase verversen daar al voor deze app?`,
    );
  }
  return geldig[0];
}

/** Bevat dit SQL-bestand iets anders dan commentaar? */
export function heeftOpdrachten(sql) {
  return (
    sql
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/--.*$/gm, "")
      .replace(/[\s;]/g, "") !== ""
  );
}

const naamSql = (naam) => `"${naam.replaceAll('"', '""')}"`;

/** Alles weg (tabellen en views), ook `d1_migrations`, zodat de migraties opnieuw draaien. */
export function leegSql(objecten) {
  return [
    "PRAGMA defer_foreign_keys = on;",
    ...objecten
      .filter((o) => o.type === "view")
      .map((o) => `DROP VIEW IF EXISTS ${naamSql(o.name)};`),
    ...objecten
      .filter((o) => o.type === "table")
      .map((o) => `DROP TABLE IF EXISTS ${naamSql(o.name)};`),
  ].join("\n");
}

/** Alle rijen weg, behalve de lijst van migraties: wat een migratie zelf invoegt, staat ook in d1.sql. */
export function wisRijenSql(objecten) {
  return [
    "PRAGMA defer_foreign_keys = on;",
    ...objecten
      .filter((o) => o.type === "table" && o.name !== "d1_migrations")
      .map((o) => `DELETE FROM ${naamSql(o.name)};`),
  ].join("\n");
}

const OBJECTEN_SQL =
  "select type, name from sqlite_master where type in ('table', 'view') " +
  "and substr(name, 1, 7) <> 'sqlite_' and substr(name, 1, 4) <> '_cf_'";

function objecten() {
  const uit = JSON.parse(
    wrangler(["d1", "execute", "DB", "--local", "--json", "--command", OBJECTEN_SQL]),
  );
  return (Array.isArray(uit) ? uit : [uit]).flatMap((r) => r?.results ?? []);
}

function voerUit(map, naam, sql) {
  const pad = join(map, naam);
  writeFileSync(pad, sql);
  wrangler(["d1", "execute", "DB", "--local", "--file", pad]);
}

/** Lege lokale D1 met alle migraties: de stand zonder testgegevens. */
function bouwOpnieuw(map) {
  voerUit(map, "leeg.sql", leegSql(objecten()));
  wrangler(["d1", "migrations", "apply", "DB", "--local"]);
}

function leesLijst(pad) {
  if (!existsSync(pad)) return null;
  const lijst = JSON.parse(readFileSync(pad, "utf8"));
  if (typeof lijst?.geldig_tot !== "string" || typeof lijst.bestanden !== "object") {
    throw new Mislukt("bestanden.json in het artifact heeft niet de verwachte vorm.");
  }
  return lijst;
}

/**
 * Haalt de testgegevens op en laadt ze lokaal. Geeft een korte samenvatting terug; gooit een
 * fout met een zin voor de gebruiker als het niet lukt.
 */
export function laadTestgegevens({ log = console.log } = {}) {
  const { org, app } = appUitGit();
  const beheer = vindBeheerRepo(org, app);
  const artifact = nieuwsteArtifact(beheer, app);
  log(`Testgegevens van ${app} ophalen uit ${beheer} (van ${artifact.created_at})…`);

  const map = mkdtempSync(join(tmpdir(), "testgegevens-"));
  try {
    const download = join(map, "artifact");
    gh(
      [
        "run",
        "download",
        String(artifact.workflow_run.id),
        "-R",
        beheer,
        "-n",
        artifact.name,
        "-D",
        download,
      ],
      { timeout: 600_000 },
    );
    const d1 = join(download, "d1.sql");
    if (!existsSync(d1)) throw new Mislukt("Het artifact bevat geen d1.sql.");
    const lijst = leesLijst(join(download, "bestanden.json"));

    // Vanaf hier verandert de lokale D1. Alles hierboven kon nog zonder gevolgen mislukken.
    try {
      bouwOpnieuw(map);
      voerUit(map, "wis.sql", wisRijenSql(objecten()));
      voerUit(map, "d1.sql", `PRAGMA defer_foreign_keys = on;\n${readFileSync(d1, "utf8")}`);
    } catch (fout) {
      try {
        bouwOpnieuw(map);
      } catch {
        // De oorspronkelijke fout is belangrijker; de preview zet de migraties zo nodig zelf.
      }
      throw fout;
    }

    const bucket = leesWrangler().r2_buckets?.[0]?.bucket_name;
    let bestanden = 0;
    if (lijst && bucket) {
      wrangler([
        "r2",
        "object",
        "put",
        `${bucket}/${LIJST}`,
        "--local",
        "--file",
        join(download, "bestanden.json"),
        "--content-type",
        "application/json",
      ]);
      bestanden = Object.keys(lijst.bestanden ?? {}).length;
    } else if (!lijst) {
      log("Het artifact bevat geen bestanden.json; bestanden uit test zijn lokaal niet te zien.");
    }

    const rol = existsSync(ROL) && heeftOpdrachten(readFileSync(ROL, "utf8"));
    if (rol) wrangler(["d1", "execute", "DB", "--local", "--file", ROL]);

    const staat = {
      app,
      beheer,
      artifact: artifact.id,
      gemaakt: artifact.created_at,
      geladen: new Date().toISOString(),
    };
    mkdirSync(".wrangler", { recursive: true });
    writeFileSync(STAAT, `${JSON.stringify(staat, null, 2)}\n`);
    return { ...staat, bestanden, rol, linksGeldigTot: lijst?.geldig_tot ?? null };
  } finally {
    rmSync(map, { recursive: true, force: true });
  }
}

/** Een korte regel over wat er geladen is. */
export function samenvatting(uit) {
  return [
    `✓ Testgegevens van ${uit.app} geladen (van ${uit.gemaakt}).`,
    uit.bestanden ? `  ${uit.bestanden} bestanden op te halen tot ${uit.linksGeldigTot}.` : "",
    uit.rol
      ? "  scripts/lokaal-rol.sql gaf lokaal@voorbeeld.nl een rol."
      : "  Geen scripts/lokaal-rol.sql: lokaal@voorbeeld.nl heeft geen rol.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Voor de preview: laden bij de eerste start en daarna als de gegevens ouder zijn dan een
 * dag. Mislukt het, dan een waarschuwing en verder met de lokale database zoals hij is.
 */
export function verversAlsNodig({ log = console.log, waarschuw = console.warn } = {}) {
  if (!moetVerversen(leesStaat())) return false;
  try {
    log(samenvatting(laadTestgegevens({ log })));
    return true;
  } catch (fout) {
    const reden = fout instanceof Mislukt ? fout.message : String(fout?.message ?? fout);
    waarschuw(
      `⚠ Testgegevens niet geladen: ${reden}\n  De app start met de lokale database zoals hij was.`,
    );
    return false;
  }
}
