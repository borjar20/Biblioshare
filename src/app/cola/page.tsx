import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ensureQueueOrder } from "@/lib/queue/ensure-queue-order";
import { getQueues } from "@/lib/queue/get-queues";
import { getQueueItems } from "@/lib/queue/get-queue-items";
import { backfillQueueSizes } from "@/lib/queue/backfill-queue-sizes";
import { getBookPace } from "@/lib/queue/get-reading-pace";
import { getMoviePace } from "@/lib/queue/get-movie-cadence";
import { computeQueueEstimates } from "@/lib/queue/compute-estimates";
import { QueueList } from "./queue-list";
import { QueueSummary } from "./queue-summary";
import { QueueManager } from "./queue-manager";

export const metadata: Metadata = {
  title: "Tus colas — Biblioshare",
};

// Sentinel for the "Sin cola" bucket in the ?cola query param (a real queue is
// a UUID). Keeps null — the DB meaning — out of the URL.
const NO_QUEUE = "none";

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ cola?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const t = await getTranslations("queue");

  await ensureQueueOrder(supabase, user.id);
  const queues = await getQueues(supabase, user.id);

  // Active tab: a queue id, or the "Sin cola" bucket. Default to the first
  // queue, falling back to the bucket when the user has no queues yet.
  const { cola } = await searchParams;
  const validQueueIds = new Set(queues.map((q) => q.id));
  const activeParam =
    cola && (cola === NO_QUEUE || validQueueIds.has(cola))
      ? cola
      : (queues[0]?.id ?? NO_QUEUE);
  const activeQueueId = activeParam === NO_QUEUE ? null : activeParam;

  let items = await getQueueItems(supabase, user.id, activeQueueId);

  const missingMovies = items
    .filter((item) => item.itemType === "movie" && item.durationMinutes === null)
    .map((item) => ({ id: item.itemId, tmdbId: item.tmdbId }));
  const missingSeries = items
    .filter(
      (item) =>
        item.itemType === "series" &&
        (item.totalEpisodes === null || item.episodeRuntimeMinutes === null)
    )
    .map((item) => ({ id: item.itemId, tmdbId: item.tmdbId }));

  if (missingMovies.length > 0 || missingSeries.length > 0) {
    await backfillQueueSizes(supabase, missingMovies, missingSeries);
    items = await getQueueItems(supabase, user.id, activeQueueId);
  }

  const [bookPace, moviePace] = await Promise.all([
    getBookPace(supabase, user.id),
    getMoviePace(supabase, user.id),
  ]);

  const estimates = computeQueueEstimates(items, bookPace, moviePace);

  const activeQueue = queues.find((q) => q.id === activeQueueId) ?? null;

  const tabs = [
    ...queues.map((q) => ({ key: q.id, label: q.name })),
    { key: NO_QUEUE, label: t("noQueue") },
  ];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <div className="flex gap-4 overflow-x-auto border-b border-border">
        {tabs.map((tab) => {
          const isActive = tab.key === activeParam;
          const href = tab.key === NO_QUEUE ? "/cola" : `/cola?cola=${tab.key}`;
          return (
            <Link
              key={tab.key}
              href={href}
              className={`-mb-px whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                isActive
                  ? "border-accent text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <QueueManager activeQueue={activeQueue} />

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <QueueSummary estimates={estimates} />
          <QueueList
            key={activeParam}
            queueId={activeQueueId}
            items={items}
            estimates={estimates.perItem}
          />
        </>
      )}
    </div>
  );
}
