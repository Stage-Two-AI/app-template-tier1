/**
 * Wie doet dit verzoek? Cloudflare Access staat voor de app en stuurt bij elk doorgelaten
 * verzoek een ondertekend bewijs mee (de kop `Cf-Access-Jwt-Assertion`). Deze code
 * controleert dat bewijs tegen de publieke sleutels van het Zero Trust-team en leest het
 * mailadres eruit. Zonder geldig bewijs: niemand (een publiek pad, of iemand die om de deur
 * heen probeert).
 *
 * Alleen Web Crypto, geen extra pakketten.
 */
import type { Env } from "../env";

export type Gebruiker = { email: string };

type Jwk = JsonWebKey & { kid?: string };
type Kop = { alg?: string; kid?: string };
type Inhoud = { aud?: string | string[]; email?: string; exp?: number; nbf?: number; iss?: string };

/** De vaste testgebruiker in de lokale stand. */
export const LOKALE_GEBRUIKER: Gebruiker = { email: "lokaal@voorbeeld.nl" };

const SLEUTELS_GELDIG_MS = 60 * 60 * 1000;
let sleutelCache: { team: string; tot: number; sleutels: Jwk[] } | null = null;

function base64url(tekst: string): Uint8Array {
  const b64 = tekst
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(tekst.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function json<T>(deel: string): T {
  return JSON.parse(new TextDecoder().decode(base64url(deel))) as T;
}

async function sleutels(team: string, haal: typeof fetch): Promise<Jwk[]> {
  if (sleutelCache && sleutelCache.team === team && sleutelCache.tot > Date.now()) {
    return sleutelCache.sleutels;
  }
  const r = await haal(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error(`sleutels van Access niet op te halen (${r.status})`);
  const { keys } = (await r.json()) as { keys?: Jwk[] };
  sleutelCache = { team, tot: Date.now() + SLEUTELS_GELDIG_MS, sleutels: keys ?? [] };
  return sleutelCache.sleutels;
}

/** Alleen voor de tests: begin met een lege cache. */
export function vergeetSleutels(): void {
  sleutelCache = null;
}

/**
 * De gebruiker achter dit verzoek, of null. In de lokale stand altijd de vaste
 * testgebruiker. Zonder ACCESS_TEAM of ACCESS_AUD (de app is nog niet ingericht) is er nooit
 * een gebruiker: dan blijft alles dicht.
 */
export async function wieIsHet(
  request: Request,
  env: Env,
  haal: typeof fetch = fetch,
): Promise<Gebruiker | null> {
  if (env.OMGEVING === "lokaal") return LOKALE_GEBRUIKER;
  const team = env.ACCESS_TEAM?.replace(/\.cloudflareaccess\.com$/, "");
  const audiences = (env.ACCESS_AUD ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  if (!team || audiences.length === 0) return null;

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  const delen = token?.split(".");
  if (!delen || delen.length !== 3) return null;
  const [kopDeel, inhoudDeel, handtekening] = delen as [string, string, string];
  try {
    const kop = json<Kop>(kopDeel);
    if (kop.alg !== "RS256") return null;
    const jwk = (await sleutels(team, haal)).find((k) => k.kid === kop.kid);
    if (!jwk) return null;
    const sleutel = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const klopt = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      sleutel,
      base64url(handtekening),
      new TextEncoder().encode(`${kopDeel}.${inhoudDeel}`),
    );
    if (!klopt) return null;
    const inhoud = json<Inhoud>(inhoudDeel);
    const nu = Math.floor(Date.now() / 1000);
    if (typeof inhoud.exp !== "number" || inhoud.exp < nu) return null;
    if (typeof inhoud.nbf === "number" && inhoud.nbf > nu + 60) return null;
    if (inhoud.iss !== `https://${team}.cloudflareaccess.com`) return null;
    const aud = Array.isArray(inhoud.aud) ? inhoud.aud : [inhoud.aud];
    if (!aud.some((a) => typeof a === "string" && audiences.includes(a))) return null;
    if (typeof inhoud.email !== "string" || !inhoud.email) return null;
    return { email: inhoud.email.toLowerCase() };
  } catch {
    return null;
  }
}
