import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { getOwnProfile } from "@/lib/profile/get-profile-by-username";
import { deriveAttributes, suggestClass } from "@/lib/pet/derive";
import { getPetCounts } from "@/lib/pet/get-pet-counts";
import { getPetSnapshot } from "@/lib/pet/get-pet-snapshot";
import { HatchForm } from "@/components/pet/hatch-form";
import { PetGame } from "@/components/pet/game/pet-game";
import gameStyles from "@/components/pet/game/pet-game.module.css";
import { BurrowSection } from "@/components/pet/burrow-section";
import { getAdventureStateFor } from "@/lib/pet/adventure/get-state";
import type { AdventureState } from "@/lib/pet/adventure/types";
import { getShopStateFor } from "@/lib/pet/shop/get-state";
import type { ShopState } from "@/lib/pet/shop/types";

export const metadata: Metadata = { title: "Mascota — Biblioshare" };

// Todo depende de la sesión: nada de `use cache` (#437). La lectura va bajo
// <Suspense> para que el armazón salga sin esperar a Supabase.
export default async function MascotaPage() {
  const t = await getTranslations("pet");
  return (
    <Suspense fallback={<div className={gameStyles.game} aria-busy="true" aria-label={t("title")}><div className={gameStyles.header}><Link className={gameStyles.returnLink} href="/">← Biblioshare</Link><h1>{t("game.sections.camp")}</h1></div><div className={gameStyles.content}><div aria-hidden className="h-80 animate-pulse rounded-lg bg-surface-muted" /></div></div>}>
        <PetContent />
      </Suspense>
  );
}

async function PetContent() {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/mascota"));
  const profile = await getOwnProfile(user.id);
  if (!profile?.username) redirect("/onboarding");

  const supabase = await createClient();
  const pet = await getPetSnapshot(supabase, user.id);
  const burrow = (
    <Suspense fallback={<div aria-hidden className="h-40 animate-pulse rounded-card bg-surface-muted" />}>
      <BurrowSection viewerId={user.id} game own={pet ? { name: pet.name, petClass: pet.petClass, stage: pet.stage, level: pet.level } : null} />
    </Suspense>
  );

  if (!pet) {
    // Eclosión: la sugerencia sale del historial (spec §2). Sin historial → null.
    const { counts } = await getPetCounts(supabase, user.id);
    return <PetGame key={user.id} userId={user.id} pet={null} adventure={null} shop={null} burrow={burrow} hatch={<HatchForm suggested={suggestClass(deriveAttributes(counts))} />} />;
  }
  let adventure: AdventureState | null = null;
  try { adventure = await getAdventureStateFor(supabase, user.id); }
  catch (error) { console.error("pet game adventure", error); }
  let shop: ShopState | null = null;
  try { shop = await getShopStateFor(user.id); }
  catch (error) { console.error("pet game shop", error); }
  return <PetGame key={user.id} userId={user.id} pet={pet} adventure={adventure} shop={shop} burrow={burrow} />;
}
