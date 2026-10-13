/**
 * Praten met de servercode (worker/, alles onder /api). De browser stuurt het bewijs van
 * Cloudflare Access vanzelf mee (een cookie), dus hier is geen inlog nodig.
 */
export class ApiFout extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function api<T>(pad: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api${pad}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const tekst = await r.text();
  const inhoud: unknown = tekst ? JSON.parse(tekst) : null;
  if (!r.ok) {
    const fout =
      typeof inhoud === "object" &&
      inhoud !== null &&
      "fout" in inhoud &&
      typeof inhoud.fout === "string"
        ? inhoud.fout
        : `Er ging iets mis (${r.status})`;
    throw new ApiFout(fout, r.status);
  }
  return inhoud as T;
}
