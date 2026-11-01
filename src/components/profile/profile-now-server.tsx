import { createClient } from "@/lib/supabase/server";
import { getProfileNow } from "@/lib/profile/now";
import { ProfilePet } from "@/components/pet/profile-pet";
import { NowView } from "./profile-now";

export async function ProfileNow({ userId }: { userId: string }) {
  // La mascota se resuelve en servidor y llega como nodo ya pintado.
  const [items, pet] = await Promise.all([
    createClient()
      .then((supabase) => getProfileNow(supabase, userId))
      .catch((error) => {
        // Una lectura secundaria fallida no debe tumbar el perfil: sin «Leyendo ahora».
        console.error("getProfileNow failed", error);
        return [];
      }),
    ProfilePet({ userId }),
  ]);
  return <NowView items={items} pet={pet} />;
}
