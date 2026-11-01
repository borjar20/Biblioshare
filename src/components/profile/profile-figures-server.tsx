import { createClient } from "@/lib/supabase/server";
import type { LibraryStats } from "@/lib/library/get-library-stats";
import { getProfileRating } from "@/lib/profile/figures";
import { FiguresView } from "./profile-figures";

export async function ProfileFigures({ userId, stats }: { userId: string; stats: LibraryStats }) {
  let rating: { average: number | null; count: number };
  try {
    rating = await getProfileRating(await createClient(), userId);
  } catch (error) {
    // Una lectura secundaria fallida no debe tumbar el perfil: sin nota media.
    console.error("getProfileRating failed", error);
    rating = { average: null, count: 0 };
  }
  return <FiguresView stats={stats} rating={rating} />;
}
