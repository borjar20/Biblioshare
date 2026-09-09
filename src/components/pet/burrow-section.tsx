import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getFollowCounts } from "@/lib/social/follows";
import { getBurrowPets, type BurrowResult } from "@/lib/pet/get-burrow";
import type { BurrowPet } from "@/lib/pet/burrow";
import { Burrow } from "./burrow";

/** Render under its own Suspense boundary; all data depends on the viewer. */
export async function BurrowSection({ own, viewerId, game = false }: { own: BurrowPet | null; viewerId: string; game?: boolean }) {
  const t = await getTranslations("pet");
  let result: BurrowResult = { ok: false };
  let followingCount = 0;
  try {
    const supabase = await createClient();
    const [pets, counts] = await Promise.all([
      getBurrowPets(supabase), getFollowCounts(supabase, viewerId),
    ]);
    result = pets;
    followingCount = counts.following;
  } catch {
    // Failure is local to this optional section, including follow-count failures.
  }
  if (result.ok) return <Burrow own={own} neighbors={result.rows} total={result.total} followingCount={followingCount} game={game} />;
  return <p role="status" className="text-sm text-muted-foreground">{t("burrow.error")}</p>;
}
