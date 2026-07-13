import Link from "next/link";
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

// Sentinel for the "Sin cola" bucket in the ?cola query param (a real queue is
// a UUID). Keeps null — the DB meaning — out of the URL.
const NO_QUEUE = "none";

// El antiguo /cola, ahora la pestaña "Colas" de /coleccion.
export async function QueuesPanel({
  userId,
  activeParam: colaParam,
}: {
  userId: string;
  activeParam?: string;
}) {
  const supabase = await createClient();
  const t = await getTranslations("queue");

  await ensureQueueOrder(supabase, userId);
  const queues = await getQueues(supabase, userId);

  // Active tab: a queue id, or the "Sin cola" bucket. Default to the first
  // queue, falling back to the bucket when the user has no queues yet.
  const validQueueIds = new Set(queues.map((q) => q.id));
  const activeParam =
    colaParam && (colaParam === NO_QUEUE || validQueueIds.has(colaParam))
      ? colaParam
      : (queues[0]?.id ?? NO_QUEUE);
  const activeQueueId = activeParam === NO_QUEUE ? null : activeParam;

  let items = await getQueueItems(supabase, userId, activeQueueId);

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
    items = await getQueueItems(supabase, userId, activeQueueId);
  }

  const [bookPace, moviePace] = await Promise.all([
    getBookPace(supabase, userId),
    getMoviePace(supabase, userId),
  ]);

  const estimates = computeQueueEstimates(items, bookPace, moviePace);
  const activeQueue = queues.find((q) => q.id === activeQueueId) ?? null;

  const tabs = [
    ...queues.map((q) => ({ key: q.id, label: q.name })),
    { key: NO_QUEUE, label: t("noQueue") },
  ];

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">{t("description")}</p>

      <div className="flex gap-4 overflow-x-auto border-b border-border">
        {tabs.map((tab) => {
          const isActive = tab.key === activeParam;
          // Siempre explícito, incluido NO_QUEUE: sin el parámetro se cae al
          // default (la primera cola), y la pestaña "Sin cola" quedaba
          // inalcanzable en cuanto tenías una cola creada.
          const href = `/coleccion?tab=colas&cola=${tab.key}`;
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
