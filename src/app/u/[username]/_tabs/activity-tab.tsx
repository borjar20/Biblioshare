import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getMonthlyActivity } from "@/lib/diary/get-monthly-activity";
import { getRecentReviews } from "@/lib/social/recent-reviews";
import { getLibraryItems } from "@/lib/library/get-library-items";
import { ActivityChart } from "@/components/activity-chart";
import { FavoritesShelf } from "@/components/favorites-shelf";
import { FeedCard } from "@/components/social/feed-card";

// Actividad: la cara pública del perfil.
export async function ActivityTab({
  userId,
  viewerLoggedIn,
}: {
  userId: string;
  viewerLoggedIn: boolean;
}) {
  const supabase = await createClient();
  const t = await getTranslations("profile");
  const [months, recentReviews, favorites] = await Promise.all([
    getMonthlyActivity(supabase, userId),
    getRecentReviews(supabase, userId),
    getLibraryItems(supabase, userId, { favoritesOnly: true }),
  ]);

  return (
    <>
      <div className="rounded-card border border-border bg-surface shadow-card p-4">
        <ActivityChart months={months} />
      </div>
      <FavoritesShelf items={favorites} />
      {recentReviews.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t("recentReviews")}
          </h2>
          {recentReviews.map((event) => (
            <FeedCard
              key={event.id}
              event={event}
              viewerLoggedIn={viewerLoggedIn}
              hideActor
            />
          ))}
        </div>
      )}
    </>
  );
}
