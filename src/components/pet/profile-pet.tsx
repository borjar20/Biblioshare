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
        // Sin ancho ni alto fijos y a 3/4 de escala: la celda del sprite mide
        // 96 px a escala 1, y una caja de 44 px la desbordaba hacia el borde de
        // la tarjeta, que la recortaba (`overflow-hidden` por el fondo difuminado).
        // A media escala el dibujo (que ocupa solo el centro de la celda) se leía
        // demasiado pequeño.
        className="flex shrink-0 items-center justify-center rounded-[10px] bg-surface-muted p-1"
        data-testid="profile-pet"
        title={`${pet.name} · ${t(`classes.${pet.petClass}`)} · ${t(`stages.${pet.stage}`)}`}
      >
        <PetSprite stage={pet.stage} petClass={pet.petClass} mood="neutral" scale={0.75} label={pet.name} />
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
