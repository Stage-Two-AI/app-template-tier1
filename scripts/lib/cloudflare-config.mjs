import { readFileSync } from "node:fs";

/**
 * `wrangler.jsonc` beschrijft hoe deze app op Cloudflare draait (tier 1). Het bestand
 * is van het project, want naam, adres en database verschillen per app, maar een paar regels
 * gelden voor elke app in deze stack:
 *
 *   - één Worker: de gebouwde schermen als statische bestanden, de servercode in
 *     `worker/index.ts` (`main`), en `/api/*` gaat altijd eerst naar die code
 *     (`assets.run_worker_first`);
 *   - diepe links vallen terug op index.html (`single-page-application`);
 *   - precies één adres, en dat staat achter Access. Er zijn twee standen:
 *       standaard: een eigen domein (`routes` met `custom_domain: true`) en
 *                  `workers_dev: false`, zodat er geen tweede adres naast staat;
 *       tijdelijk: geen `routes` en `workers_dev: true`, zolang er nog geen domein is.
 *   - opslag alleen in D1 (`d1_databases`) en R2 (`r2_buckets`). Geen KV, Durable Objects,
 *     queues of andere opslag: één soort database en één soort bestanden, overal hetzelfde.
 *   - een omgeving `env.preview` met een eígen D1 en R2: de previews van pull requests
 *     raken nooit de echte gegevens. De uitrol van een preview gebruikt altijd deze
 *     omgeving uit main, nooit die uit de pull request.
 *   - `vars.OMGEVING` mag nooit `lokaal` zijn: die stand zet de controle van Access uit en
 *     hoort alleen in `.dev.vars` op je eigen computer.
 */
const TOEGESTAAN = new Set([
  "$schema",
  "name",
  "main",
  "compatibility_date",
  "compatibility_flags",
  "assets",
  "routes",
  "workers_dev",
  "preview_urls",
  "observability",
  "vars",
  "keep_vars",
  "d1_databases",
  "r2_buckets",
  "ai",
  "triggers",
  "env",
]);

/**
 * Binnen `env.<naam>`: alleen wat per omgeving verschilt. `routes`, `workers_dev`, `main`
 * en `triggers` horen alleen bovenaan: een preview krijgt geen eigen adres, geen andere code
 * en geen geplande taken.
 */
const TOEGESTAAN_IN_ENV = new Set(["vars", "d1_databases", "r2_buckets", "ai", "observability"]);

/** Bekende opslag van Cloudflare die deze stack niet gebruikt; die krijgt een eigen melding. */
const OPSLAG = new Set([
  "kv_namespaces",
  "durable_objects",
  "queues",
  "vectorize",
  "hyperdrive",
  "workflows",
  "analytics_engine_datasets",
  "secrets_store_secrets",
]);

const STANDEN =
  "Er zijn twee standen: de standaardstand (een route met `custom_domain: true` en `workers_dev: false`) " +
  "en de tijdelijke stand, alleen zolang er nog geen eigen domein is (geen `routes` en `workers_dev: true`).";

/** JSON met `//`- en `/* *\/`-commentaar, zoals wrangler.jsonc dat toestaat. */
function leesJsonc(tekst) {
  let uit = "";
  let inString = false;
  for (let i = 0; i < tekst.length; i++) {
    const teken = tekst[i];
    if (inString) {
      uit += teken;
      if (teken === "\\") {
        uit += tekst[++i] ?? "";
      } else if (teken === '"') {
        inString = false;
      }
    } else if (teken === '"') {
      inString = true;
      uit += teken;
    } else if (teken === "/" && tekst[i + 1] === "/") {
      while (i < tekst.length && tekst[i] !== "\n") i++;
      uit += "\n";
    } else if (teken === "/" && tekst[i + 1] === "*") {
      i += 2;
      while (i < tekst.length && !(tekst[i] === "*" && tekst[i + 1] === "/")) i++;
      i++;
    } else {
      uit += teken;
    }
  }
  return JSON.parse(uit.replace(/,(\s*[}\]])/g, "$1"));
}

function fout(melding) {
  throw new Error(`wrangler.jsonc: ${melding}`);
}

function isObject(waarde) {
  return typeof waarde === "object" && waarde !== null && !Array.isArray(waarde);
}

/** De meldingen voor elke sleutel die niet op de lijst staat, met het pad erbij. */
function sleutelFouten(object, toegestaan, padVoorvoegsel) {
  const fouten = [];
  for (const sleutel of Object.keys(object)) {
    if (toegestaan.has(sleutel)) continue;
    const pad = `\`${padVoorvoegsel}${sleutel}\``;
    if (OPSLAG.has(sleutel)) {
      fouten.push(`${pad} hoort er niet in: gegevens staan in D1, bestanden in R2.`);
    } else {
      fouten.push(
        `${pad} staat niet op de lijst van toegestane sleutels. Is deze sleutel echt nodig, meld het dan bij Stage Two.`,
      );
    }
  }
  return fouten;
}

/**
 * Leest en controleert wrangler.jsonc. Geeft de Worker-naam en de stand terug, en in de
 * standaardstand het eigen domein (in de tijdelijke stand is `hostname` null: het
 * workers.dev-adres hangt af van het subdomein van het account).
 */
export function cloudflareConfig(pad = "wrangler.jsonc") {
  let tekst;
  try {
    tekst = readFileSync(pad, "utf8");
  } catch (oorzaak) {
    const ontbreekt = oorzaak?.code === "ENOENT";
    fout(
      ontbreekt
        ? `het bestand ${pad} ontbreekt. Elke app in deze stack draait op Cloudflare en heeft het nodig.`
        : `het bestand ${pad} is niet te lezen (${oorzaak?.code ?? oorzaak?.message}).`,
    );
  }
  let config;
  try {
    config = leesJsonc(tekst);
  } catch (oorzaak) {
    fout(`het bestand ${pad} is geen geldige JSON: ${oorzaak?.message}`);
  }
  if (!isObject(config)) fout("het bestand hoort één object te bevatten.");

  if (typeof config.name !== "string" || config.name === "") fout("`name` ontbreekt.");

  const fouten = sleutelFouten(config, TOEGESTAAN, "");
  if (config.env !== undefined) {
    if (!isObject(config.env)) fouten.push("`env` hoort een object met omgevingen te zijn.");
    else {
      for (const [naam, omgeving] of Object.entries(config.env)) {
        if (!isObject(omgeving)) fouten.push(`\`env.${naam}\` hoort een object te zijn.`);
        else fouten.push(...sleutelFouten(omgeving, TOEGESTAAN_IN_ENV, `env.${naam}.`));
      }
    }
  }
  if (fouten.length) fout(fouten.join("\n  "));

  if (config.main !== "worker/index.ts") {
    fout('`main` moet "worker/index.ts" zijn: daar staat de servercode van deze app.');
  }
  const eerst = config.assets?.run_worker_first;
  if (!Array.isArray(eerst) || !eerst.includes("/api/*")) {
    fout(
      '`assets.run_worker_first` moet "/api/*" bevatten, anders komt /api niet bij de servercode.',
    );
  }
  for (const [plek, vars] of [
    ["", config.vars],
    ...Object.entries(config.env ?? {}).map(([n, o]) => [`env.${n}.`, o?.vars]),
  ]) {
    if (isObject(vars) && vars.OMGEVING === "lokaal") {
      fout(
        `\`${plek}vars.OMGEVING\` is "lokaal": die stand zet de controle van Access uit en hoort alleen in .dev.vars.`,
      );
    }
  }
  const preview = config.env?.preview;
  if (!isObject(preview)) {
    fout("`env.preview` ontbreekt: de previews van pull requests hebben een eigen D1 en R2 nodig.");
  }
  const ids = (lijst) =>
    Array.isArray(lijst) ? lijst.map((d) => d?.database_id ?? d?.bucket_name) : [];
  const samen = (a, b) => ids(a).filter((x) => x && ids(b).includes(x));
  const gedeeld = [
    ...samen(config.d1_databases, preview.d1_databases),
    ...samen(config.r2_buckets, preview.r2_buckets),
  ];
  if (gedeeld.length) {
    fout(
      `\`env.preview\` gebruikt dezelfde opslag als productie (${gedeeld.join(", ")}); een preview hoort een eigen D1 en R2 te hebben.`,
    );
  }

  if (config.assets?.not_found_handling !== "single-page-application") {
    fout(
      '`assets.not_found_handling` moet "single-page-application" zijn, anders werken diepe links niet.',
    );
  }

  const routes = config.routes ?? [];
  if (!Array.isArray(routes)) fout("`routes` hoort een lijst te zijn.");
  if (config.workers_dev === true) {
    if (routes.length > 0) {
      fout(
        `\`workers_dev\` staat aan naast \`routes\`: dan heeft de app twee adressen. ${STANDEN}`,
      );
    }
    return { worker: config.name, stand: "tijdelijk", hostname: null };
  }
  if (config.workers_dev !== false) {
    fout(
      `\`workers_dev\` ontbreekt; zonder die regel zet wrangler het workers.dev-adres aan. ${STANDEN}`,
    );
  }
  const domein = routes[0];
  if (domein?.custom_domain !== true || typeof domein.pattern !== "string" || !domein.pattern) {
    fout(
      `er staat geen route met \`custom_domain: true\` in, dus de app heeft geen adres. ${STANDEN}`,
    );
  }
  // Eén uitzondering: www.<domein> naast het domein zelf. De beheer-repo zet de deur op
  // allebei; de app stuurt www zelf door naar het domein.
  const www = `www.${domein.pattern}`;
  const tweede = routes[1];
  const isWww = routes.length === 2 && tweede?.custom_domain === true && tweede.pattern === www;
  if (routes.length > 1 && !isWww) {
    fout(
      `er staan ${routes.length} routes in, maar de standaardstand heeft één route: het eigen domein (eventueel met www.<domein> als tweede). ` +
        `Access beschermt alleen die adressen, dus elke andere route (een tweede domein of een zone-route) staat open. ${STANDEN}`,
    );
  }
  return {
    worker: config.name,
    stand: "standaard",
    hostname: domein.pattern,
    ...(isWww ? { alias: www } : {}),
  };
}

/** Leest wrangler.jsonc zonder te controleren (de controle is `cloudflareConfig`). */
export function leesWrangler(pad = "wrangler.jsonc") {
  return leesJsonc(readFileSync(pad, "utf8"));
}

const NUL_ID = /^0{8}-0{4}-0{4}-0{4}-0{11}\d$/;

/**
 * Is de app ingericht? Zolang de id's van de database in wrangler.jsonc nog de nullen uit de
 * template zijn, heeft App inrichten (beheer-repo) de database nog niet aangemaakt, en slaat
 * de uitrol over.
 */
export function isIngericht(pad = "wrangler.jsonc") {
  const config = leesWrangler(pad);
  const ids = [...(config.d1_databases ?? []), ...(config.env?.preview?.d1_databases ?? [])].map(
    (d) => d?.database_id ?? "",
  );
  return ids.length > 0 && ids.every((id) => id && !NUL_ID.test(id));
}

/**
 * De config voor het uploaden van een preview, gemaakt uit de wrangler.jsonc van main: de naam
 * `<app>-preview`, de opslag van `env.preview`, en de al gebouwde code uit de pull request
 * (`main` en `assets.directory` wijzen naar de opgehaalde bestanden, `no_bundle`). Zo kan
 * een pull request wel zijn eigen code meesturen, maar nooit de opslag van productie: die
 * staat niet in de config van de preview.
 */
export function previewConfig(config, { worker, assets }) {
  const preview = config.env?.preview;
  if (!isObject(preview)) fout("`env.preview` ontbreekt.");
  return {
    name: `${config.name}-preview`,
    main: worker,
    // De code is al gebouwd (vite build in de pull request); niet opnieuw bundelen, wel alle
    // losse stukken naast index.js meenemen.
    no_bundle: true,
    find_additional_modules: true,
    rules: [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }],
    compatibility_date: config.compatibility_date,
    ...(config.compatibility_flags ? { compatibility_flags: config.compatibility_flags } : {}),
    assets: { ...config.assets, directory: assets },
    workers_dev: true,
    preview_urls: true,
    observability: preview.observability ?? config.observability ?? { enabled: true },
    vars: { ...(preview.vars ?? {}), OMGEVING: "test" },
    d1_databases: preview.d1_databases ?? [],
    r2_buckets: preview.r2_buckets ?? [],
    ...(preview.ai ? { ai: preview.ai } : {}),
  };
}
