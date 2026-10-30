import { createClient } from "@/lib/supabase/server";
import { getProfileNow } from "@/lib/profile/now";
import { ProfilePet } from "@/components/pet/profile-pet";
import { NowView } from "./profile-now";

export async function ProfileNow({ userId }: { userId: string }) {
  // La mascota se resuelve en servidor y llega como nodo ya pintado.
  const [items, pet] = await Promise.all([
    createClient().then((supabase) => getProfileNow(supabase, userId)),
    ProfilePet({ userId, variant: "compact" }),
  ]);
  return <NowView items={items} pet={pet} />;
}
