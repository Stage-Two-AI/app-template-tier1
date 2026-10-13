import { describe, expect, it } from "vitest";
import { itemInputSchema } from "@/lib/validation";

describe("itemInputSchema", () => {
  it("accepteert een normale omschrijving en haalt spaties weg", () => {
    expect(itemInputSchema.parse({ titel: "  Twee dozen potgrond  " }).titel).toBe(
      "Twee dozen potgrond",
    );
  });

  it("weigert een lege omschrijving en meer dan 120 tekens", () => {
    expect(itemInputSchema.safeParse({ titel: "   " }).success).toBe(false);
    expect(itemInputSchema.safeParse({ titel: "a".repeat(121) }).success).toBe(false);
  });
});
