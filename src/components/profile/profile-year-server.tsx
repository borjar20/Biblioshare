import { createClient } from "@/lib/supabase/server";
import { getProfileYear } from "@/lib/profile/year";
import { YearView } from "./profile-year";

export async function ProfileYear({ userId, isOwner }: { userId: string; isOwner: boolean }) {
  let data: Awaited<ReturnType<typeof getProfileYear>>;
  try {
    data = await getProfileYear(await createClient(), userId);
  } catch (error) {
    // Una lectura secundaria fallida no debe tumbar el perfil: sin bloque del año.
    console.error("getProfileYear failed", error);
    data = null;
  }
  return <YearView data={data} isOwner={isOwner} />;
}
