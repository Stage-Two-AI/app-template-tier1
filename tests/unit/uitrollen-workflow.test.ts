import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * De uitrol-workflow bepaalt wie welke sleutel te zien krijgt. Een pull request mag
 * nooit bij de sleutels van productie of van de inrichting: GitHub geeft secrets van
 * een omgeving aan elke job die die omgeving noemt, ook op een PR-tak.
 */
const WORKFLOWS = resolve(__dirname, "../../.github/workflows");

type Stap = {
  name?: string;
  shell?: string;
  id?: string;
  run?: string;
  uses?: string;
  if?: string;
  with?: Record<string, string | number | boolean>;
  env?: Record<string, string>;
};
type Job = {
  if?: string;
  environment?: string | { name: string };
  permissions?: Record<string, string>;
  steps: Stap[];
};
type Workflow = { on: Record<string, unknown>; jobs: Record<string, Job> };

function lees(naam: string): Workflow {
  return parse(readFileSync(join(WORKFLOWS, naam), "utf8")) as Workflow;
}

function omgeving(job: Job): string | undefined {
  return typeof job.environment === "string" ? job.environment : job.environment?.name;
}

const uitrollen = lees("uitrollen.yml");
const previewUitrollen = lees("preview-uitrollen.yml");

function job(naam: string, wf: Workflow = uitrollen): Job {
  const gevonden = wf.jobs[naam];
  if (!gevonden) throw new Error(`job ${naam} ontbreekt`);
  return gevonden;
}

function stapIndex(j: Job, zoek: (s: Stap) => boolean): number {
  const i = j.steps.findIndex(zoek);
  if (i < 0) throw new Error("stap ontbreekt");
  return i;
}

/** Het begin van een GitHub-expressie, zoals hij in de YAML staat. */
const EXPRESSIE = ["$", "{{"].join("");

/** Een volledige GitHub-expressie, bijvoorbeeld voor `vars.X`. */
function gh(inhoud: string): string {
  return `${EXPRESSIE} ${inhoud} }}`;
}

const runs = (j: Job) => j.steps.map((s) => s.run ?? "").join("\n");

describe("uitrollen.yml: productie", () => {
  const prod = job("productie");

  it("rolt alleen uit bij een push op main, in omgeving production", () => {
    expect(prod.if).toContain("github.event_name == 'push'");
    expect(prod.if).toContain("refs/heads/main");
    expect(omgeving(prod)).toBe("production");
  });

  it("slaat over zolang de app niet is ingericht: geen sleutel, nullen in wrangler.jsonc of geen ACCESS_AUD", () => {
    const check = prod.steps.find((s) => s.id === "check");
    expect(check?.run).toContain("isIngericht()");
    expect(check?.run).toContain("CLOUDFLARE_API_TOKEN ontbreekt");
    expect(check?.run).toContain("ACCESS_AUD ontbreekt");
    expect(check?.env?.ACCESS_AUD).toBe(gh("vars.ACCESS_AUD"));
  });

  it("migreert eerst de testdatabase, dan productie, en rolt daarna pas uit", () => {
    const test = stapIndex(prod, (s) =>
      (s.run ?? "").includes("migrations apply DB --remote --env preview"),
    );
    const productie = stapIndex(prod, (s) => /migrations apply DB --remote -c/.test(s.run ?? ""));
    const deploy = stapIndex(prod, (s) => (s.run ?? "").includes("wrangler deploy"));
    expect(test).toBeLessThan(productie);
    expect(productie).toBeLessThan(deploy);
  });

  it("geeft de servercode het team en de audiences van Access mee", () => {
    const deploy = prod.steps.find((s) => (s.run ?? "").includes("wrangler deploy"));
    expect(deploy?.run).toContain('--var "ACCESS_TEAM:$ACCESS_TEAM"');
    expect(deploy?.run).toContain('--var "ACCESS_AUD:$ACCESS_AUD"');
    expect(deploy?.env?.ACCESS_TEAM).toBe(gh("vars.ACCESS_TEAM"));
  });
});

describe("uitrollen.yml: de PR-job bouwt alleen, zonder sleutels", () => {
  const pr = job("preview");

  it("draait alleen op een PR uit deze repo, zonder omgeving en zonder secrets", () => {
    expect(pr.if).toContain("github.event_name == 'pull_request'");
    expect(pr.if).toContain("head.repo.full_name == github.repository");
    expect(omgeving(pr)).toBeUndefined();
    expect(JSON.stringify(pr)).not.toContain("secrets.");
    expect(pr.permissions).toEqual({ contents: "read" });
  });

  it("bouwt met de testbalk en bewaart schermen en servercode, zonder de config van de PR", () => {
    const bouw = pr.steps.find((s) => s.run === "pnpm build");
    expect(bouw?.env?.VITE_OMGEVING).toBe("test");
    expect(runs(pr)).toContain('rm -f "$RUNNER_TEMP/preview/worker/wrangler.json"');
    const bewaar = pr.steps.find((s) => s.uses?.startsWith("actions/upload-artifact"));
    expect(bewaar?.with?.name).toBe("preview-dist");
  });
});

describe("preview-uitrollen.yml: de upload vanaf main", () => {
  const up = job("preview", previewUitrollen);

  it("draait na Uitrollen, in omgeving preview, met main uitgecheckt", () => {
    expect(Object.keys(previewUitrollen.on)).toEqual(["workflow_run"]);
    expect(omgeving(up)).toBe("preview");
    const checkout = up.steps.find((s) => s.uses?.startsWith("actions/checkout"));
    expect(checkout?.with?.ref).toBe("main");
  });

  it("maakt de config uit main (env.preview) en uploadt alleen de gebouwde code uit de PR", () => {
    const config = stapIndex(up, (s) => (s.run ?? "").includes("scripts/preview-config.mjs"));
    const upload = stapIndex(up, (s) => (s.run ?? "").includes("wrangler versions upload"));
    expect(config).toBeLessThan(upload);
    const run = up.steps[upload]?.run ?? "";
    expect(run).toContain('-c "$MAP/wrangler.json"');
    expect(run).toContain('--preview-alias "pr-$PR"');
    expect(run).toContain("set -o pipefail");
    expect(run).not.toContain("wrangler deploy");
  });

  it("zet nergens een GitHub-expressie in een run-regel", () => {
    for (const s of up.steps) expect(s.run ?? "", s.name).not.toContain(EXPRESSIE);
  });
});

describe("sleutels per omgeving, in alle workflows", () => {
  const bestanden = readdirSync(WORKFLOWS).filter((f) => f.endsWith(".yml"));

  it("geen job die op een pull request kan draaien noemt production", () => {
    for (const naam of bestanden) {
      const wf = lees(naam);
      const opPr = "pull_request" in (wf.on ?? {}) || "pull_request_target" in (wf.on ?? {});
      if (!opPr) continue;
      for (const [jobNaam, job] of Object.entries(wf.jobs)) {
        const env = omgeving(job);
        if (env === "production") {
          expect(job.if ?? "", `${naam}/${jobNaam}`).toContain("github.event_name == 'push'");
        }
      }
    }
  });

  it("een job na een andere run (workflow_run) noemt hooguit omgeving preview", () => {
    for (const naam of bestanden) {
      const wf = lees(naam);
      if (!("workflow_run" in (wf.on ?? {}))) continue;
      for (const [jobNaam, job] of Object.entries(wf.jobs)) {
        const env = omgeving(job);
        if (env !== undefined) expect(env, `${naam}/${jobNaam}`).toBe("preview");
      }
    }
  });
});
