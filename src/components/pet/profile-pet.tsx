import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getProfilePet } from "@/lib/pet/get-profile-pet";
import { PetSprite } from "./pet-sprite";

/** Mascota compacta de «Leyendo ahora»; se aísla bajo el Suspense de ProfileNow. */
export async function ProfilePet({ userId }: { userId: string }) {
  let pet;
  try {
    pet = await getProfilePet(await createClient(), userId);
  } catch {
    return null;
  }
  if (!pet) return null;
  const t = await getTranslations("pet");
  const description = `${pet.name} · ${t(`classes.${pet.petClass}`)} · ${t(`stages.${pet.stage}`)}`;
  return (
    <div
      // Ventana de 72 px sobre el sprite a escala 1 (celda de 96 px), centrada:
      // el dibujo ocupa el centro de la celda y lo que se recorta es margen
      // vacío. Antes la caja medía 44 px y el sprite desbordaba hacia el borde
      // de la tarjeta, que lo cortaba. La escala tiene que ser entera
      // (`PetSprite`: 1 | 2 | 3) para que el pixel art no se emborrone.
      className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[10px] bg-surface-muted"
      data-testid="profile-pet"
      title={description}
    >
      <span className="sr-only">{description}</span>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <PetSprite stage={pet.stage} petClass={pet.petClass} mood="neutral" scale={1} label={pet.name} />
      </div>
    </div>
  );
}
