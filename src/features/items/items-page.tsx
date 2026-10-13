import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiFout, api } from "@/lib/api";
import { itemInputSchema } from "@/lib/validation";

/** Zoals de servercode hem teruggeeft (worker/routes/items.ts). */
type Item = { id: number; titel: string; door: string; gemaakt_op: string };

/** Voorbeeldscherm: een lijst die je aanvult. Vervang hem als je de app bouwt. */
export function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [ik, setIk] = useState<string | null>(null);
  const [titel, setTitel] = useState("");
  const [fout, setFout] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);

  const haalOp = useCallback(async () => {
    try {
      setItems(await api<Item[]>("/items"));
      setFout(null);
    } catch (f) {
      setFout(
        f instanceof ApiFout && f.status === 401
          ? "Je bent niet ingelogd."
          : "De lijst kon niet geladen worden.",
      );
    }
    setLaden(false);
  }, []);

  useEffect(() => {
    void haalOp();
    api<{ email: string }>("/ik")
      .then((g) => setIk(g.email))
      .catch(() => setIk(null));
  }, [haalOp]);

  async function voegToe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invoer = itemInputSchema.safeParse({ titel });
    if (!invoer.success) {
      setFout(invoer.error.issues[0]?.message ?? "Deze invoer klopt niet.");
      return;
    }
    try {
      await api<Item>("/items", { method: "POST", body: JSON.stringify(invoer.data) });
    } catch (f) {
      setFout(f instanceof ApiFout ? f.message : "Toevoegen is niet gelukt.");
      return;
    }
    setTitel("");
    setFout(null);
    await haalOp();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Mijn lijst</h1>
        {ik ? <span className="text-sm text-muted-foreground">{ik}</span> : null}
      </header>

      <form className="flex items-end gap-3" onSubmit={voegToe} noValidate>
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="titel">Nieuw item</Label>
          <Input
            id="titel"
            name="titel"
            value={titel}
            onChange={(event) => setTitel(event.target.value)}
            placeholder="Waar gaat het over?"
          />
        </div>
        <Button type="submit">Toevoegen</Button>
      </form>

      {fout ? (
        <p role="alert" className="text-sm text-destructive">
          {fout}
        </p>
      ) : null}

      {laden ? (
        <p className="text-sm text-muted-foreground">Bezig met laden…</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Items">
          {items.map((item) => (
            <li key={item.id} className="rounded-md border bg-card p-3 text-sm">
              {item.titel}
            </li>
          ))}
          {items.length === 0 ? (
            <li className="text-sm text-muted-foreground">Nog niets toegevoegd.</li>
          ) : null}
        </ul>
      )}
    </main>
  );
}
