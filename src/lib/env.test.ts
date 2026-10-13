import { describe, expect, it } from "vitest";
import { env, envSchema } from "./env";

describe("env", () => {
  it("is standaard geen testomgeving", () => {
    expect(env.VITE_OMGEVING).toBeUndefined();
  });

  it("behandelt een lege variabele als niet gezet, zoals GitHub Actions die doorgeeft", () => {
    const uitkomst = envSchema.safeParse({ VITE_OMGEVING: "", VITE_SENTRY_DSN: "" });
    expect(uitkomst.success).toBe(true);
    expect(uitkomst.data?.VITE_OMGEVING).toBeUndefined();
  });

  it("weigert een onbekende omgeving", () => {
    expect(envSchema.safeParse({ VITE_OMGEVING: "productie" }).success).toBe(false);
  });
});
