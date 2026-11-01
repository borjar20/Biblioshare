import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getProfilePet } from "@/lib/pet/get-profile-pet";
import { PetSprite } from "./pet-sprite";

/** Optional header detail, isolated under Suspense by ProfileHeader. */
export async function ProfilePet({ userId, variant = "card" }: { userId: string; variant?: "card" | "compact" }) {
  let pet;
  try {
    pet = await getProfilePet(await createClient(), userId);
  } catch {
    return null;
  }
  if (!pet) return null;
  const t = await getTranslations("pet");
  if (variant === "compact") {
    return (
      <div
        // Ventana de 72 px sobre el sprite a escala 1 (celda de 96 px), centrada:
        // el dibujo ocupa el centro de la celda y lo que se recorta es margen
        // vacío. Antes la caja medía 44 px y el sprite desbordaba hacia el borde
        // de la tarjeta, que lo cortaba. La escala tiene que ser entera
        // (`PetSprite`: 1 | 2 | 3) para que el pixel art no se emborrone.
        className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[10px] bg-surface-muted"
        data-testid="profile-pet"
        title={`${pet.name} · ${t(`classes.${pet.petClass}`)} · ${t(`stages.${pet.stage}`)}`}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <PetSprite stage={pet.stage} petClass={pet.petClass} mood="neutral" scale={1} label={pet.name} />
        </div>
      </div>
    );
  }
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
