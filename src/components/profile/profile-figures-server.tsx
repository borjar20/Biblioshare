import { createClient } from "@/lib/supabase/server";
import type { LibraryStats } from "@/lib/library/get-library-stats";
import { getProfileRating } from "@/lib/profile/figures";
import { FiguresView } from "./profile-figures";

export async function ProfileFigures({ userId, stats }: { userId: string; stats: LibraryStats }) {
  const rating = await getProfileRating(await createClient(), userId);
  return <FiguresView stats={stats} rating={rating} />;
}
