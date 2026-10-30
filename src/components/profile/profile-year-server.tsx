import { createClient } from "@/lib/supabase/server";
import { getProfileYear } from "@/lib/profile/year";
import { YearView } from "./profile-year";

export async function ProfileYear({ userId, isOwner }: { userId: string; isOwner: boolean }) {
  return <YearView data={await getProfileYear(await createClient(), userId)} isOwner={isOwner} />;
}
