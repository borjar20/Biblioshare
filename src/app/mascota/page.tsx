import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { getOwnProfile } from "@/lib/profile/get-profile-by-username";
import { SHELL_READ } from "@/lib/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { deriveAttributes, suggestClass } from "@/lib/pet/derive";
import { getPetCounts } from "@/lib/pet/get-pet-counts";
import { getPetSnapshot } from "@/lib/pet/get-pet-snapshot";
import { HatchForm } from "@/components/pet/hatch-form";
import { PetDetail } from "@/components/pet/pet-detail";
import { BurrowSection } from "@/components/pet/burrow-section";
import { TrainingPanel } from "@/components/pet/training/training-panel";

export const metadata: Metadata = { title: "Mascota — Biblioshare" };

// Todo depende de la sesión: nada de `use cache` (#437). La lectura va bajo
// <Suspense> para que el armazón salga sin esperar a Supabase.
export default async function MascotaPage() {
  const t = await getTranslations("pet");
  return (
    <div className={`mx-auto flex w-full ${SHELL_READ} flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8`}>
      <PageHeader title={t("title")} />
      <Suspense fallback={<div aria-hidden className="h-64 animate-pulse rounded-card bg-surface-muted" />}>
        <PetContent />
      </Suspense>
    </div>
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
      <BurrowSection viewerId={user.id} own={pet ? { name: pet.name, petClass: pet.petClass, stage: pet.stage } : null} />
    </Suspense>
  );

  if (!pet) {
    // Eclosión: la sugerencia sale del historial (spec §2). Sin historial → null.
    const { counts } = await getPetCounts(supabase, user.id);
    return <><HatchForm suggested={suggestClass(deriveAttributes(counts))} />{burrow}</>;
  }
  return <><PetDetail pet={pet} burrow={burrow} /><TrainingPanel /></>;
}
