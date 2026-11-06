/**
 * De A/B-test per tabel voor de servercode. Gebruiker A maakt via de API een eigen rij;
 * gebruiker B probeert hem via de API te zien, te wijzigen en te verwijderen, en mag niets.
 * Elke tabel uit migrations/ krijgt zo'n test, of staat met een reden in `open_tabellen` in
 * stack.config.json. `guard:tabellen-tests` controleert dat, door te zoeken naar
 * `controleerAfscherming({ tabel: "<naam>"` in de tests.
 *
 * A en B zijn twee echte gebruikers achter Cloudflare Access: elk verzoek krijgt een geldig,
 * ondertekend bewijs mee voor hun eigen mailadres, en de servercode controleert dat zoals in
 * productie (worker/lib/access.ts). Er wordt niets nagebootst behalve de sleutels van Access
 * en de database (tests/helpers/d1.ts).
 *
 * Gebruik, in een testbestand dat begint met `// @vitest-environment node`:
 *
 *   it("notities: B ziet de rij van A niet", async () => {
 *     await controleerAfscherming({
 *       tabel: "notities",
 *       maakRijAlsA: async (a) => {
 *         const r = await a.vraag("/api/notities", { method: "POST", body: { tekst: "van A" } });
 *         return ((await r.json()) as { id: number }).id;
 *       },
 *       lijst: "/api/notities",
 *       rij: (id) => `/api/notities/${id}`,
 *     });
 *   });
 *
 * Geeft de lijst geen kale lijst terug maar bijvoorbeeld `{ "notities": [...] }`, zeg dan met
 * `rijenUit: (antwoord) => (antwoord as { notities: unknown }).notities` waar de rijen staan.
 * Zonder dat is de test rood: een antwoord dat geen lijst is, zou anders als lege lijst tellen,
 * en dan ziet de test een lek nooit.
 *
 * Deze hulp is van de template en komt met elke versie mee.
 */
import { expect } from "vitest";
import type { Env } from "../../worker/env";
import { app as deApp } from "../../worker/index";
import { vergeetSleutels } from "../../worker/lib/access";
import { testDatabase } from "./d1";

const TEAM = "afscherming";
const AUD = "afscherming-aud";

type Verzoek = Omit<RequestInit, "body"> & { body?: unknown };

export type Actor = {
  email: string;
  /** Een verzoek aan de API als deze gebruiker. Een object als `body` gaat als JSON. */
  vraag: (pad: string, init?: Verzoek) => Promise<Response>;
};

type App = {
  request: (pad: string, init: RequestInit | undefined, env: Env) => Response | Promise<Response>;
};

const b64 = (b: ArrayBuffer | string) => Buffer.from(b).toString("base64url");

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
  const publiek = { ...(await crypto.subtle.exportKey("jwk", paar.publicKey)), kid: "afscherming" };
  const bewijs = async (email: string) => {
    const kop = b64(JSON.stringify({ alg: "RS256", kid: "afscherming" }));
    const inhoud = b64(
      JSON.stringify({
        aud: [AUD],
        email,
        exp: Math.floor(Date.now() / 1000) + 300,
        iss: `https://${TEAM}.cloudflareaccess.com`,
      }),
    );
    const handtekening = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      paar.privateKey,
      new TextEncoder().encode(`${kop}.${inhoud}`),
    );
    return `${kop}.${inhoud}.${b64(handtekening)}`;
  };
  return { publiek, bewijs };
}

export async function controleerAfscherming(o: {
  /** De tabel uit migrations/ die deze test afdekt. */
  tabel: string;
  /** A maakt via de API een eigen rij en geeft de id terug. */
  maakRijAlsA: (a: Actor) => Promise<string | number>;
  /** Het pad van de lijst, als die er is: B mag de rij van A daarin niet zien. */
  lijst?: string;
  /** Waar de rijen in het antwoord van `lijst` staan, als dat geen kale lijst is. */
  rijenUit?: (antwoord: unknown) => unknown;
  /** Het pad van één rij, als dat er is: B mag hem niet lezen, wijzigen of verwijderen. */
  rij?: (id: string | number) => string;
  /** De kolom met de sleutel. Standaard `id`. */
  sleutel?: string;
  /** Alleen voor de test van deze hulp: een andere app dan worker/index.ts. */
  app?: App;
  /** Alleen voor de test van deze hulp: een andere map met migraties. */
  migraties?: string;
  /** Extra bindings of variabelen voor de Worker. */
  env?: Partial<Env>;
}): Promise<void> {
  if (!o.lijst && !o.rij) throw new Error(`${o.tabel}: geef lijst of rij (of allebei) op`);
  if (!/^\w+$/.test(o.tabel)) throw new Error(`${o.tabel}: geen geldige tabelnaam`);
  const sleutel = o.sleutel ?? "id";
  if (!/^\w+$/.test(sleutel)) throw new Error(`${sleutel}: geen geldige kolomnaam`);
  const app: App = o.app ?? (deApp as unknown as App);
  const db = testDatabase(o.migraties);
  const env: Env = { DB: db, ACCESS_TEAM: TEAM, ACCESS_AUD: AUD, ...o.env };
  const { publiek, bewijs } = await sleutelpaar();

  // Alleen de sleutels van Access worden nagebootst; de rest gaat naar de gewone fetch.
  const vorige = globalThis.fetch;
  globalThis.fetch = (async (invoer: RequestInfo | URL, init?: RequestInit) => {
    const url = String(invoer instanceof Request ? invoer.url : invoer);
    if (url === `https://${TEAM}.cloudflareaccess.com/cdn-cgi/access/certs`) {
      return Response.json({ keys: [publiek] });
    }
    return vorige(invoer, init);
  }) as typeof fetch;
  vergeetSleutels();

  const actor = async (email: string): Promise<Actor> => {
    const token = await bewijs(email);
    return {
      email,
      vraag: async (pad, init = {}) => {
        const koppen = new Headers(init.headers);
        koppen.set("Cf-Access-Jwt-Assertion", token);
        let body = init.body as BodyInit | undefined;
        if (init.body !== undefined && typeof init.body !== "string") {
          body = JSON.stringify(init.body);
          koppen.set("content-type", "application/json");
        }
        return app.request(pad, { ...init, headers: koppen, body }, env);
      },
    };
  };

  try {
    const a = await actor("a@afscherming.voorbeeld.nl");
    const b = await actor("b@afscherming.voorbeeld.nl");
    const id = await o.maakRijAlsA(a);
    const rijVanA = () =>
      db.sqlite.prepare(`select * from "${o.tabel}" where "${sleutel}" = ?`).get(id) as
        | Record<string, unknown>
        | undefined;
    const voor = rijVanA();
    expect(voor, `${o.tabel}: de rij van A staat niet in de database`).toBeDefined();

    if (o.lijst) {
      const r = await b.vraag(o.lijst);
      if (r.status === 200) {
        const antwoord = (await r.json()) as unknown;
        const lijst = o.rijenUit ? o.rijenUit(antwoord) : antwoord;
        if (!Array.isArray(lijst)) {
          throw new Error(
            `${o.tabel}: ${o.lijst} gaf geen lijst maar ${JSON.stringify(antwoord).slice(0, 80)}; geef met rijenUit aan waar de rijen staan`,
          );
        }
        const rijen = lijst as Record<string, unknown>[];
        expect(
          rijen.filter((x) => String(x?.[sleutel]) === String(id)),
          `${o.tabel}: B ziet de rij van A in ${o.lijst}`,
        ).toEqual([]);
      } else {
        expect([401, 403, 404], `${o.tabel}: ${o.lijst} gaf ${r.status} aan B`).toContain(r.status);
      }
    }

    if (o.rij) {
      const pad = o.rij(id);
      const lees = await b.vraag(pad);
      expect([403, 404], `${o.tabel}: B leest de rij van A (${pad} gaf ${lees.status})`).toContain(
        lees.status,
      );
      for (const method of ["PUT", "PATCH", "DELETE"]) {
        const r = await b.vraag(pad, { method, body: { [sleutel]: id } });
        expect([403, 404, 405], `${o.tabel}: ${method} ${pad} als B gaf ${r.status}`).toContain(
          r.status,
        );
      }
    }

    expect(rijVanA(), `${o.tabel}: de rij van A is gewijzigd of weg na een poging van B`).toEqual(
      voor,
    );

    const zonder = await app.request(o.lijst ?? o.rij?.(id) ?? "/", undefined, env);
    expect(zonder.status, `${o.tabel}: zonder inlog geen 401`).toBe(401);
  } finally {
    globalThis.fetch = vorige;
    vergeetSleutels();
  }
}
