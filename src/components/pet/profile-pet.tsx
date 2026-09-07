import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getProfilePet } from "@/lib/pet/get-profile-pet";
import { PetSprite } from "./pet-sprite";

/** Optional header detail, isolated under Suspense by ProfileHeader. */
export async function ProfilePet({ userId }: { userId: string }) {
  let pet;
  try {
    pet = await getProfilePet(await createClient(), userId);
  } catch {
    return null;
  }
  if (!pet) return null;
  const t = await getTranslations("pet");
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-card border border-border bg-surface-muted px-3 py-2" data-testid="profile-pet">
      <div className="shrink-0">
        <PetSprite stage={pet.stage} petClass={pet.petClass} mood="neutral" scale={1} label={pet.name} />
      </div>
      <div className="min-w-0">
        <p className="break-words font-serif font-semibold">{pet.name}</p>
        <p className="text-sm text-muted-foreground">{t(`classes.${pet.petClass}`)} · {t(`stages.${pet.stage}`)}</p>
      </div>
    </div>
  );
}
