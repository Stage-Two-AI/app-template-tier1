// @vitest-environment node
import { describe, expect, it } from "vitest";
import { bepaalOntvangers } from "./mail";

const MAIL = {
  aan: ["klant@bedrijf.nl", " collega@bedrijf.nl "],
  cc: "baas@bedrijf.nl",
  bcc: ["archief@bedrijf.nl"],
  onderwerp: "Je bestelling",
};

describe("bepaalOntvangers: in test en lokaal nooit naar echte klanten", () => {
  it("laat de ontvangers in productie staan (OMGEVING leeg of productie)", () => {
    for (const OMGEVING of [undefined, "", "productie"]) {
      expect(bepaalOntvangers(MAIL, { OMGEVING, TESTMAIL_ADRES: "test@stagetwo.nl" })).toEqual({
        aan: ["klant@bedrijf.nl", "collega@bedrijf.nl"],
        cc: ["baas@bedrijf.nl"],
        bcc: ["archief@bedrijf.nl"],
        onderwerp: "Je bestelling",
      });
    }
  });

  it("stuurt in test en lokaal alleen naar het testadres, zonder cc en bcc, met [test] ervoor", () => {
    for (const OMGEVING of ["test", "lokaal"]) {
      expect(bepaalOntvangers(MAIL, { OMGEVING, TESTMAIL_ADRES: " test@stagetwo.nl " })).toEqual({
        aan: ["test@stagetwo.nl"],
        cc: [],
        bcc: [],
        onderwerp: "[test] Je bestelling",
      });
    }
  });

  it("verstuurt niets buiten productie zonder (geldig) testadres", () => {
    expect(bepaalOntvangers(MAIL, { OMGEVING: "test" })).toBeNull();
    expect(bepaalOntvangers(MAIL, { OMGEVING: "test", TESTMAIL_ADRES: "" })).toBeNull();
    expect(bepaalOntvangers(MAIL, { OMGEVING: "lokaal", TESTMAIL_ADRES: "geen adres" })).toBeNull();
  });

  it("behandelt een onbekende omgeving als test, niet als productie", () => {
    expect(bepaalOntvangers(MAIL, { OMGEVING: "Productie" })).toBeNull();
    expect(bepaalOntvangers(MAIL, { OMGEVING: "staging", TESTMAIL_ADRES: "t@x.nl" })?.aan).toEqual([
      "t@x.nl",
    ]);
  });
});
