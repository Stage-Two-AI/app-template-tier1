// @vitest-environment node
import * as Sentry from "@sentry/cloudflare";
import { afterEach, describe, expect, it, vi } from "vitest";
import { testDatabase } from "../../tests/helpers/d1";
import { nagebootsteSentry, testContext } from "../../tests/helpers/sentry";
import type { Env } from "../env";
import { sentryOpties } from "./fouten";

const DSN = "https://abc123@o1.ingest.sentry.io/42";
const cron = { cron: "0 7 * * *", scheduledTime: Date.now(), noRetry: () => {} };

/** Een Worker met een geplande taak die misgaat, ingepakt zoals in worker/index.ts. */
function metFoutInCron() {
  const worker: ExportedHandler<Env> = {
    async scheduled() {
      throw new Error("cron stuk");
    },
  };
  return Sentry.withSentry(sentryOpties, worker);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sentryOpties", () => {
  it("staat uit zonder DSN, en lokaal altijd, ook met een DSN", () => {
    expect(sentryOpties({ DB: testDatabase() }).dsn).toBe("");
    expect(sentryOpties({ DB: testDatabase(), SENTRY_DSN: "" }).dsn).toBe("");
    expect(sentryOpties({ DB: testDatabase(), SENTRY_DSN: DSN, OMGEVING: "lokaal" }).dsn).toBe("");
    expect(sentryOpties({ DB: testDatabase(), SENTRY_DSN: DSN }).dsn).toBe(DSN);
  });

  it("geeft de omgeving mee: productie zonder OMGEVING, test op de preview", () => {
    expect(sentryOpties({ DB: testDatabase() }).environment).toBe("productie");
    expect(sentryOpties({ DB: testDatabase(), OMGEVING: "test" }).environment).toBe("test");
  });

  it("stuurt geen persoonsgegevens mee (het equivalent van sendDefaultPii: false)", () => {
    expect(sentryOpties({ DB: testDatabase(), SENTRY_DSN: DSN }).dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
      databaseQueryData: false,
    });
  });
});

describe("withSentry met sentryOpties", () => {
  it("meldt een fout in een geplande taak, en de taak faalt nog steeds", async () => {
    const sentry = nagebootsteSentry();
    const { ctx, klaar } = testContext();
    const env: Env = { DB: testDatabase(), SENTRY_DSN: DSN, OMGEVING: "test" };
    await expect(metFoutInCron().scheduled?.(cron, env, ctx)).rejects.toThrow("cron stuk");
    await klaar();
    expect(sentry.fouten).toHaveLength(1);
    expect(sentry.fouten[0]?.exception?.values?.[0]?.value).toBe("cron stuk");
    expect(sentry.fouten[0]?.environment).toBe("test");
  });

  it("verstuurt niets zonder DSN of lokaal", async () => {
    const sentry = nagebootsteSentry();
    for (const env of [
      { DB: testDatabase() },
      { DB: testDatabase(), SENTRY_DSN: DSN, OMGEVING: "lokaal" },
    ] satisfies Env[]) {
      const { ctx, klaar } = testContext();
      await expect(metFoutInCron().scheduled?.(cron, env, ctx)).rejects.toThrow("cron stuk");
      await klaar();
    }
    expect(sentry.verzonden()).toHaveLength(0);
  });

  it("crasht niet op een ongeldige DSN, en verstuurt dan niets", async () => {
    const sentry = nagebootsteSentry();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { ctx, klaar } = testContext();
    const env: Env = { DB: testDatabase(), SENTRY_DSN: "geen-dsn" };
    await expect(metFoutInCron().scheduled?.(cron, env, ctx)).rejects.toThrow("cron stuk");
    await klaar();
    expect(sentry.verzonden()).toHaveLength(0);
  });
});
