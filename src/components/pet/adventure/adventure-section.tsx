import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getAdventureStateFor } from "@/lib/pet/adventure/get-state";
import { AdventurePanel } from "./adventure-panel";

// Depende de la sesión: nunca `use cache`; la página lo envuelve en <Suspense>.
export async function AdventureSection({ viewerId }: { viewerId: string }) {
  const t = await getTranslations("pet.adventure");
  const supabase = await createClient();
  const state = await getAdventureStateFor(supabase, viewerId);
  return <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 shadow-card" aria-labelledby="adventure-section-title" data-testid="pet-adventures">
    <div><h2 id="adventure-section-title" className="font-serif text-xl font-semibold">{t("title")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("intro")}</p></div>
    <AdventurePanel initial={state} />
  </section>;
}
