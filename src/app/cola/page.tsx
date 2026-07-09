import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ensureQueueOrder } from "@/lib/queue/ensure-queue-order";
import { getQueueItems } from "@/lib/queue/get-queue-items";
import { backfillQueueSizes } from "@/lib/queue/backfill-queue-sizes";
import { getBookPace, getSeriesPace } from "@/lib/queue/get-reading-pace";
import { getMoviePace } from "@/lib/queue/get-movie-cadence";
import { computeQueueEstimates } from "@/lib/queue/compute-estimates";
import { QueueList } from "./queue-list";
import { QueueSummary } from "./queue-summary";

export const metadata: Metadata = {
  title: "Tu cola — Biblioshare",
};

export default async function QueuePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const t = await getTranslations("queue");

  await ensureQueueOrder(supabase, user.id);
  let items = await getQueueItems(supabase, user.id);

  const missingMovies = items
    .filter((item) => item.itemType === "movie" && item.durationMinutes === null)
    .map((item) => ({ id: item.itemId, tmdbId: item.tmdbId }));
  const missingSeries = items
    .filter((item) => item.itemType === "series" && item.totalEpisodes === null)
    .map((item) => ({ id: item.itemId, tmdbId: item.tmdbId }));

  if (missingMovies.length > 0 || missingSeries.length > 0) {
    await backfillQueueSizes(supabase, missingMovies, missingSeries);
    items = await getQueueItems(supabase, user.id);
  }

  const [bookPace, seriesPace, moviePace] = await Promise.all([
    getBookPace(supabase, user.id),
    getSeriesPace(supabase, user.id),
    getMoviePace(supabase, user.id),
  ]);

  const estimates = computeQueueEstimates(items, bookPace, seriesPace, moviePace);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <QueueSummary estimates={estimates} />
          <QueueList items={items} estimates={estimates.perItem} />
        </>
      )}
    </div>
  );
}
