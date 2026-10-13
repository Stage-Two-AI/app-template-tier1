// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../env";
import { LOKALE_GEBRUIKER, vergeetSleutels, wieIsHet } from "./access";

const b64 = (b: ArrayBuffer | Uint8Array | string) =>
  Buffer.from(typeof b === "string" ? b : b instanceof Uint8Array ? b : new Uint8Array(b)).toString(
    "base64url",
  );

async function sleutelpaar() {
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
  const publiek = { ...(await crypto.subtle.exportKey("jwk", paar.publicKey)), kid: "k1" };
  return { privaat: paar.privateKey, publiek };
}

async function token(privaat: CryptoKey, inhoud: Record<string, unknown>, kid = "k1") {
  const kop = b64(JSON.stringify({ alg: "RS256", kid }));
  const body = b64(JSON.stringify(inhoud));
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privaat,
    new TextEncoder().encode(`${kop}.${body}`),
  );
  return `${kop}.${body}.${b64(sig)}`;
}

const ENV: Env = {
  DB: {
    prepare: () => {
      throw new Error("niet nodig");
    },
  },
  ACCESS_TEAM: "team",
  ACCESS_AUD: "aud-1,aud-2",
};
const nu = () => Math.floor(Date.now() / 1000);
const geldig = {
  aud: ["aud-2"],
  email: "Iemand@Voorbeeld.nl",
  exp: nu() + 300,
  iss: "https://team.cloudflareaccess.com",
};

describe("wieIsHet: het bewijs van Access", () => {
  let paar: Awaited<ReturnType<typeof sleutelpaar>>;
  let haal: typeof fetch;
  beforeEach(async () => {
    vergeetSleutels();
    paar = await sleutelpaar();
    haal = async () => new Response(JSON.stringify({ keys: [paar.publiek] }));
  });
  const met = (t: string) =>
    new Request("https://app/api/ik", { headers: { "Cf-Access-Jwt-Assertion": t } });

  it("leest het mailadres uit een geldig bewijs", async () => {
    expect(await wieIsHet(met(await token(paar.privaat, geldig)), ENV, haal)).toEqual({
      email: "iemand@voorbeeld.nl",
    });
  });

  it("weigert verlopen, verkeerde audience, verkeerde uitgever, onbekende sleutel en geknoei", async () => {
    for (const inhoud of [
      { ...geldig, exp: nu() - 1 },
      { ...geldig, aud: ["andere-app"] },
      { ...geldig, iss: "https://ander.cloudflareaccess.com" },
      { ...geldig, email: undefined },
    ]) {
      expect(await wieIsHet(met(await token(paar.privaat, inhoud)), ENV, haal)).toBeNull();
    }
    expect(await wieIsHet(met(await token(paar.privaat, geldig, "k2")), ENV, haal)).toBeNull();
    const [kop, , sig] = (await token(paar.privaat, geldig)).split(".");
    const vervalst = `${kop}.${b64(JSON.stringify({ ...geldig, email: "baas@voorbeeld.nl" }))}.${sig}`;
    expect(await wieIsHet(met(vervalst), ENV, haal)).toBeNull();
    expect(await wieIsHet(new Request("https://app/api/ik"), ENV, haal)).toBeNull();
  });

  it("is dicht zonder team of audience, en alleen lokaal is er een vaste testgebruiker", async () => {
    const t = await token(paar.privaat, geldig);
    expect(await wieIsHet(met(t), { ...ENV, ACCESS_AUD: "" }, haal)).toBeNull();
    expect(await wieIsHet(met(t), { ...ENV, ACCESS_TEAM: undefined }, haal)).toBeNull();
    expect(
      await wieIsHet(new Request("https://app/api/ik"), { ...ENV, OMGEVING: "lokaal" }, haal),
    ).toEqual(LOKALE_GEBRUIKER);
    expect(
      await wieIsHet(new Request("https://app/api/ik"), { ...ENV, OMGEVING: "test" }, haal),
    ).toBeNull();
  });
});
