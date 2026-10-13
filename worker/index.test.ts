// @vitest-environment node
import { describe, expect, it } from "vitest";
import { testDatabase } from "../tests/helpers/d1";
import type { Env } from "./env";
import { app } from "./index";

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
