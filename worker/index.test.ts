// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { testDatabase } from "../tests/helpers/d1";
import { nagebootsteSentry, testContext } from "../tests/helpers/sentry";
import type { Env } from "./env";
import worker, { app } from "./index";
import { vergeetSleutels } from "./lib/access";

const lokaal = (): Env => ({ DB: testDatabase(), OMGEVING: "lokaal" });
const vraag = (env: Env, pad: string, init?: RequestInit) => app.request(pad, init, env);

describe("de servercode", () => {
  it("is publiek gezond, maar verder dicht zonder geldige gebruiker", async () => {
    const env: Env = { DB: testDatabase(), ACCESS_TEAM: "team", ACCESS_AUD: "aud" };
    expect((await vraag(env, "/api/gezond")).status).toBe(200);
    expect((await vraag(env, "/api/ik")).status).toBe(401);
    expect((await vraag(env, "/api/items")).status).toBe(401);
  });

  it("blijft dicht als de app nog niet is ingericht (geen team of audience)", async () => {
    const env: Env = { DB: testDatabase() };
    expect(
      (await vraag(env, "/api/ik", { headers: { "Cf-Access-Jwt-Assertion": "a.b.c" } })).status,
    ).toBe(401);
  });

  it("bewaart een item met de gebruiker erbij en laat het terugzien", async () => {
    const env = lokaal();
    const nieuw = await vraag(env, "/api/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ titel: "  Eerste  " }),
    });
    expect(nieuw.status).toBe(201);
    expect(await nieuw.json()).toMatchObject({ titel: "Eerste", door: "lokaal@voorbeeld.nl" });
    const lijst = (await (await vraag(env, "/api/items")).json()) as { titel: string }[];
    expect(lijst.map((i) => i.titel)).toEqual(["Eerste"]);
  });

  it("weigert een item zonder titel", async () => {
    const r = await vraag(lokaal(), "/api/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ titel: " " }),
    });
    expect(r.status).toBe(400);
  });
});

describe("fouten in de servercode", () => {
  const DSN = "https://abc123@o1.ingest.sentry.io/42";
  const kapot: Env["DB"] = {
    prepare: () => {
      throw new Error("database stuk");
    },
  };

  /** Een geldig bewijs van Access voor iemand@voorbeeld.nl, en de sleutel om het te controleren. */
  async function ingelogd() {
    const b64 = (b: ArrayBuffer | string) => Buffer.from(b).toString("base64url");
    const paar = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
    if (!("privateKey" in paar)) throw new Error("geen sleutelpaar");
    const sleutel = { ...(await crypto.subtle.exportKey("jwk", paar.publicKey)), kid: "k1" };
    const kop = b64(JSON.stringify({ alg: "RS256", kid: "k1" }));
    const inhoud = b64(
      JSON.stringify({
        aud: ["aud"],
        email: "iemand@voorbeeld.nl",
        exp: Math.floor(Date.now() / 1000) + 300,
        iss: "https://team.cloudflareaccess.com",
      }),
    );
    const handtekening = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      paar.privateKey,
      new TextEncoder().encode(`${kop}.${inhoud}`),
    );
    return {
      token: `${kop}.${inhoud}.${b64(handtekening)}`,
      sleutels: () => Response.json({ keys: [sleutel] }),
    };
  }

  afterEach(() => {
    vergeetSleutels();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("geeft hetzelfde antwoord als zonder Sentry, en meldt de fout zonder persoonsgegevens", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { token, sleutels } = await ingelogd();
    const sentry = nagebootsteSentry(sleutels);
    const { ctx, klaar } = testContext();
    const env: Env = { DB: kapot, ACCESS_TEAM: "team", ACCESS_AUD: "aud", SENTRY_DSN: DSN };
    const koppen = {
      "Cf-Access-Jwt-Assertion": token,
      cookie: "sessie=geheim",
      "cf-connecting-ip": "203.0.113.9",
    };

    const r = await worker.fetch?.(
      new Request("https://app.voorbeeld.nl/api/items?zoek=privé", { headers: koppen }),
      env,
      ctx,
    );
    await klaar();
    const zonder = await vraag({ ...env, SENTRY_DSN: undefined }, "/api/items", {
      headers: koppen,
    });

    expect(r?.status).toBe(500);
    expect(await r?.json()).toEqual({ fout: "Er ging iets mis" });
    expect(zonder.status).toBe(500);
    expect(await zonder.json()).toEqual({ fout: "Er ging iets mis" });

    expect(sentry.fouten).toHaveLength(1);
    const melding = sentry.fouten[0];
    expect(melding?.exception?.values?.[0]?.value).toBe("database stuk");
    expect(melding?.environment).toBe("productie");
    expect(melding?.user).toBeUndefined();
    expect(melding?.request?.headers).toBeUndefined();
    expect(melding?.request?.cookies).toBeUndefined();
    const alles = JSON.stringify(melding);
    for (const prive of ["iemand@voorbeeld.nl", "geheim", "203.0.113.9", "privé", token]) {
      expect(alles).not.toContain(prive);
    }
  });

  it("verstuurt niets zonder DSN", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const sentry = nagebootsteSentry();
    const { ctx, klaar } = testContext();
    const r = await worker.fetch?.(
      new Request("https://app.voorbeeld.nl/api/items"),
      { DB: kapot, OMGEVING: "lokaal" },
      ctx,
    );
    await klaar();
    expect(r?.status).toBe(500);
    expect(sentry.verzonden()).toHaveLength(0);
  });
});
