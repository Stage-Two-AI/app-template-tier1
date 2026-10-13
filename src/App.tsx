import { ItemsPage } from "@/features/items/items-page";
import { env } from "@/lib/env";

export function App() {
  return (
    <>
      {env.VITE_OMGEVING === "test" && (
        <p className="bg-amber-200 px-3 py-1 text-center text-xs text-amber-950" role="status">
          Testomgeving: dit is de testdatabase, niet de echte app.
        </p>
      )}
      <ItemsPage />
    </>
  );
}
