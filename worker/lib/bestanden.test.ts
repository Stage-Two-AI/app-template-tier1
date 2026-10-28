// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { LIJST, leesBestand } from "./bestanden";

/** Een nagebootste R2: alleen get en put, met de inhoud als tekst. */
function nepR2(inhoud: Record<string, string> = {}) {
  const opslag = new Map(Object.entries(inhoud));
  const gelezen: string[] = [];
  const object = (sleutel: string, tekst: string) => ({
    key: sleutel,
    text: async () => tekst,
    json: async () => JSON.parse(tekst) as unknown,
    arrayBuffer: async () => new TextEncoder().encode(tekst).buffer,
  });
  const r2 = {
    get: vi.fn(async (sleutel: string) => {
      gelezen.push(sleutel);
      const tekst = opslag.get(sleutel);
      return tekst === undefined ? null : object(sleutel, tekst);
    }),
    put: vi.fn(async (sleutel: string, waarde: ArrayBuffer, _opties?: R2PutOptions) => {
      opslag.set(sleutel, new TextDecoder().decode(waarde));
      return object(sleutel, opslag.get(sleutel) ?? "");
    }),
  };
  return { r2: r2 as unknown as R2Bucket, opslag, gelezen, put: r2.put };
}

const MORGEN = new Date(Date.now() + 86_400_000).toISOString();
const GISTEREN = new Date(Date.now() - 86_400_000).toISOString();
const lijst = (geldig_tot: string, bestanden: Record<string, string>) =>
  JSON.stringify({ geldig_tot, bestanden });

const haalOk = () =>
  vi.fn(
    async (_link: string | URL | Request) =>
      new Response("foto-inhoud", { headers: { "content-type": "image/jpeg" } }),
  );

describe("leesBestand: bestanden uit R2", () => {
  it("geeft een bestand dat er is gewoon terug, in elke omgeving", async () => {
    for (const OMGEVING of [undefined, "test", "lokaal"]) {
      const { r2 } = nepR2({ "foto.jpg": "inhoud" });
      const haal = haalOk();
      const bestand = await leesBestand({ OMGEVING, BESTANDEN: r2 }, "foto.jpg", haal);
      expect(await bestand?.text()).toBe("inhoud");
      expect(haal).not.toHaveBeenCalled();
    }
  });

  it("geeft een fout als de app geen R2 heeft", async () => {
    await expect(leesBestand({}, "foto.jpg")).rejects.toThrow("BESTANDEN");
  });
});

describe("leesBestand: in productie en de preview nooit ophalen bij test", () => {
  it("geeft null voor een ontbrekend bestand en kijkt niet in de lijst, ook als die er staat", async () => {
    for (const OMGEVING of [undefined, "", "productie", "test", "Lokaal"]) {
      const { r2, gelezen, put } = nepR2({
        [LIJST]: lijst(MORGEN, { "foto.jpg": "https://r2.example/foto.jpg" }),
      });
      const haal = haalOk();
      expect(await leesBestand({ OMGEVING, BESTANDEN: r2 }, "foto.jpg", haal)).toBeNull();
      expect(haal).not.toHaveBeenCalled();
      expect(put).not.toHaveBeenCalled();
      expect(gelezen).toEqual(["foto.jpg"]);
    }
  });

  it("geeft de lijst met leeslinks nooit terug, ook lokaal niet", async () => {
    for (const OMGEVING of [undefined, "test", "lokaal"]) {
      const { r2 } = nepR2({ [LIJST]: lijst(MORGEN, {}) });
      expect(await leesBestand({ OMGEVING, BESTANDEN: r2 }, LIJST)).toBeNull();
    }
  });
});

describe("leesBestand: lokaal een ontbrekend bestand ophalen", () => {
  it("haalt het op met de leeslink, bewaart het lokaal en geeft het terug", async () => {
    const { r2, opslag, put } = nepR2({
      [LIJST]: lijst(MORGEN, { "map/foto.jpg": "https://r2.example/foto.jpg?sig=x" }),
    });
    const haal = haalOk();
    const bestand = await leesBestand({ OMGEVING: "lokaal", BESTANDEN: r2 }, "map/foto.jpg", haal);
    expect(await bestand?.text()).toBe("foto-inhoud");
    expect(haal).toHaveBeenCalledWith("https://r2.example/foto.jpg?sig=x");
    expect(opslag.get("map/foto.jpg")).toBe("foto-inhoud");
    expect(put.mock.calls[0]?.[2]).toEqual({ httpMetadata: { contentType: "image/jpeg" } });

    // De tweede keer staat het lokaal en wordt er niets meer opgehaald.
    await leesBestand({ OMGEVING: "lokaal", BESTANDEN: r2 }, "map/foto.jpg", haal);
    expect(haal).toHaveBeenCalledTimes(1);
  });

  it("geeft null zonder lijst, met verlopen links, of als het bestand er niet in staat", async () => {
    const waarschuwing = vi.spyOn(console, "warn").mockImplementation(() => {});
    const gevallen: Record<string, string>[] = [
      {},
      { [LIJST]: lijst(GISTEREN, { "foto.jpg": "https://r2.example/foto.jpg" }) },
      { [LIJST]: lijst(MORGEN, { "ander.jpg": "https://r2.example/ander.jpg" }) },
      { [LIJST]: lijst(MORGEN, { "foto.jpg": "http://niet-versleuteld/foto.jpg" }) },
      { [LIJST]: "geen json" },
    ];
    for (const inhoud of gevallen) {
      const { r2 } = nepR2(inhoud);
      const haal = haalOk();
      expect(await leesBestand({ OMGEVING: "lokaal", BESTANDEN: r2 }, "foto.jpg", haal)).toBeNull();
      expect(haal).not.toHaveBeenCalled();
    }
    expect(waarschuwing).toHaveBeenCalledWith(expect.stringContaining("pnpm data:test"));
    waarschuwing.mockRestore();
  });

  it("geeft null als de leeslink niet werkt, en bewaart dan niets", async () => {
    const waarschuwing = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { r2, put } = nepR2({
      [LIJST]: lijst(MORGEN, { "foto.jpg": "https://r2.example/foto.jpg" }),
    });
    const haal = vi.fn(async () => new Response("weg", { status: 403 }));
    expect(await leesBestand({ OMGEVING: "lokaal", BESTANDEN: r2 }, "foto.jpg", haal)).toBeNull();
    expect(put).not.toHaveBeenCalled();
    waarschuwing.mockRestore();
  });
});
