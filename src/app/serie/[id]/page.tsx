import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getQueues } from "@/lib/queue/get-queues";
import type { Queue } from "@/lib/queue/types";
import {
  ItemManagePanel,
  type ManagedEntry,
} from "@/components/item-manage-panel";
import { WatchProviders } from "@/components/watch-providers";
import { CreditsSection } from "@/components/credits-section";
import { ItemHero } from "@/components/detail/item-hero";
import { ItemDetailTabs } from "@/components/detail/item-detail-tabs";
import { InfoPanel } from "@/components/detail/info-panel";
import {
  MetadataSidebar,
  type MetaRow,
} from "@/components/detail/metadata-sidebar";
import { CommunityPanel } from "@/components/detail/community-panel";
import { SagaStrip } from "@/components/detail/saga-strip";
import { StatusBadge } from "@/components/ui/status-badge";
import { getWatchProviders } from "@/lib/catalog/tmdb";
import { getCommunity } from "@/lib/community/get-community";
import { ensureItemEnriched } from "@/lib/people/enrich-item";
import { getItemCredits } from "@/lib/people/get-item-credits";
import { getItemSaga } from "@/lib/sagas/get-item-saga";
import { getSaga } from "@/lib/sagas/get-saga";
import type { SagaMember } from "@/lib/sagas/types";
import { parsePosition } from "@/lib/library/position";
import { getSessions } from "@/lib/sessions/get-sessions";
import type { ProgressSession } from "@/lib/sessions/types";
import type { MediaStatus } from "@/lib/library/types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: series } = await supabase
    .from("series")
    .select("title")
    .eq("id", id)
    .maybeSingle();

  return { title: series ? `${series.title} — Biblioshare` : "Biblioshare" };
}

export default async function SeriesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("item");
  const tDetail = await getTranslations("detail");
  const tMeta = await getTranslations("detail.meta");
  const tLibrary = await getTranslations("library");
  const supabase = await createClient();

  const [
    { data: series },
    {
      data: { user },
    },
  ] = await Promise.all([
    supabase
      .from("series")
      .select(
        "id, title, creator, cover_url, synopsis, release_year, total_seasons, total_episodes, genres, tmdb_id",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);

  if (!series) notFound();

  await ensureItemEnriched(supabase, "series", {
    id: series.id,
    tmdbId: series.tmdb_id,
  });

  const [watchProviders, credits, saga] = await Promise.all([
    series.tmdb_id ? getWatchProviders("tv", series.tmdb_id) : null,
    getItemCredits(supabase, "series", series.id),
    getItemSaga(supabase, "series", series.id),
  ]);

  let entry: ManagedEntry | null = null;
  let sessions: ProgressSession[] = [];
  let queues: Queue[] = [];
  if (user) {
    const { data: row } = await supabase
      .from("library_entries")
      .select("id, status, rating, position, notes, queue_id")
      .eq("user_id", user.id)
      .eq("item_type", "series")
      .eq("item_id", series.id)
      .maybeSingle();
    if (row) {
      entry = {
        entryId: row.id,
        status: row.status as MediaStatus,
        rating: row.rating,
        position: parsePosition("series", row.position),
        notes: row.notes,
        queueId: row.queue_id,
      };
      sessions = await getSessions(supabase, row.id, "series");
    }
    queues = await getQueues(supabase, user.id);
  }

  const byline =
    [
      series.creator || null,
      series.release_year ? String(series.release_year) : null,
    ]
      .filter(Boolean)
      .join(" · ") || null;

  const metaRows: MetaRow[] = [];
  if (series.creator)
    metaRows.push({ label: tMeta("creator"), value: series.creator });
  if (series.release_year)
    metaRows.push({ label: tMeta("year"), value: String(series.release_year) });
  if (series.total_seasons)
    metaRows.push({
      label: tMeta("seasons"),
      value: `${series.total_seasons} ${t("seasons")}`,
    });
  if (series.total_episodes)
    metaRows.push({
      label: tMeta("episodes"),
      value: `${series.total_episodes} ${t("episodes")}`,
    });

  const genres = series.genres ?? [];
  const community = await getCommunity(supabase, "series", series.id);

  let sagaMembers: SagaMember[] = [];
  if (saga) {
    const full = await getSaga(supabase, saga.sagaId);
    sagaMembers = full?.members ?? [];
  }

  return (
    <div className="flex flex-col">
      <ItemHero
        itemType="series"
        mediaLabel={tDetail("mediaLabel.series")}
        title={series.title}
        byline={byline}
        genres={genres}
        coverUrl={series.cover_url}
        avgRating={community.avgRating}
        ratingCount={community.ratingCount}
        ratingsLabel={tDetail("ratings")}
        backLabel={tDetail("back")}
        statusSlot={
          entry ? (
            <StatusBadge
              status={entry.status}
              label={tLibrary(`status.${entry.status}`)}
            />
          ) : null
        }
      />

      <ItemDetailTabs
        itemType="series"
        labels={{
          info: tDetail("tabInfo"),
          community: tDetail("tabCommunity"),
          log: tDetail("tabLog"),
        }}
        info={
          <InfoPanel
            aboutLabel={tDetail("about")}
            synopsis={series.synopsis}
            noSynopsisLabel={tDetail("noSynopsis")}
            sidebar={
              <MetadataSidebar
                rows={metaRows}
                genres={genres}
                genresLabel={tDetail("genres")}
              />
            }
            extra={
              <>
                <CreditsSection credits={credits} />
                {watchProviders && <WatchProviders data={watchProviders} />}
              </>
            }
          />
        }
        community={
          <div className="flex flex-col gap-10">
            {saga && sagaMembers.length >= 2 && (
              <SagaStrip
                members={sagaMembers}
                currentType="series"
                currentId={series.id}
                sagaName={saga.name}
                label={tDetail("saga")}
              />
            )}
            <CommunityPanel itemType="series" community={community} />
          </div>
        }
        log={
          <ItemManagePanel
            itemType="series"
            itemId={series.id}
            entry={entry}
            sessions={sessions}
            queues={queues}
          />
        }
      />
    </div>
  );
}
