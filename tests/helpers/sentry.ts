/**
 * Hulp voor de tests van de foutmelding in de servercode (worker/lib/fouten.ts). Sentry
 * verstuurt alles met `fetch`; deze hulp vangt die verzendingen op in plaats van ze echt te
 * versturen, en leest de fouten eruit. Ander verkeer (zoals de sleutels van Access) gaat naar
 * `anders`.
 */
import type { Event } from "@sentry/cloudflare";
import { vi } from "vitest";

export function nagebootsteSentry(anders?: (url: string) => Response) {
  const fouten: Event[] = [];
  const haal = vi.fn(async (invoer: RequestInfo | URL, init?: RequestInit) => {
    const url = String(invoer instanceof Request ? invoer.url : invoer);
    if (!url.includes("sentry.io")) {
      if (!anders) throw new Error(`onverwacht verzoek naar ${url}`);
      return anders(url);
    }
    const body = init?.body;
    const tekst = body instanceof Uint8Array ? new TextDecoder().decode(body) : String(body);
    // Een envelope is één JSON-object per regel; alleen de fout zelf heeft `exception`.
    for (const regel of tekst.split("\n").filter(Boolean)) {
      const deel: Event = JSON.parse(regel);
      if (deel.exception) fouten.push(deel);
    }
    return new Response("{}", { status: 200 });
  });
  vi.stubGlobal("fetch", haal);
  return {
    fouten,
    /** Alles wat naar Sentry ging (verzoeken naar sentry.io). */
    verzonden: () => haal.mock.calls.filter(([u]) => String(u).includes("sentry.io")),
  };
}

/**
 * Een nagebootste ExecutionContext. `klaar()` wacht op alles wat na het antwoord nog loopt
 * (`waitUntil`), zoals het versturen naar Sentry.
 */
export function testContext() {
  const lopend: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (belofte: Promise<unknown>) => {
      lopend.push(belofte);
    },
    passThroughOnException: () => {},
    props: {},
  } as ExecutionContext;
  const klaar = async () => {
    for (let i = 0; i < lopend.length; i++) await lopend[i]?.catch(() => {});
  };
  return { ctx, klaar };
}
