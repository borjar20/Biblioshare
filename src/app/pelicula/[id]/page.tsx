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
import { EditionStrip } from "@/components/detail/edition-strip";
import { StatusBadge } from "@/components/ui/status-badge";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { getWatchProviders } from "@/lib/catalog/tmdb";
import { getCommunity } from "@/lib/community/get-community";
import { getEditions } from "@/lib/editions/get-editions";
import { ensureItemEnriched } from "@/lib/people/enrich-item";
import { getItemCredits } from "@/lib/people/get-item-credits";
import { getItemSaga } from "@/lib/sagas/get-item-saga";
import { getSaga } from "@/lib/sagas/get-saga";
import type { SagaMember } from "@/lib/sagas/types";
import { parsePosition } from "@/lib/library/position";
import type { MediaStatus } from "@/lib/library/types";
import { SagaAssignForm } from "@/components/saga-assign-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: movie } = await supabase
    .from("movies")
    .select("title")
    .eq("id", id)
    .maybeSingle();

  return { title: movie ? `${movie.title} — Biblioshare` : "Biblioshare" };
}

export default async function MovieDetailPage({
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
    { data: movie },
    {
      data: { user },
    },
  ] = await Promise.all([
    supabase
      .from("movies")
      .select(
        "id, title, director, cover_url, synopsis, release_year, duration_minutes, genres, tmdb_id",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);

  if (!movie) notFound();

  await ensureItemEnriched(supabase, "movie", {
    id: movie.id,
    tmdbId: movie.tmdb_id,
  });

  const [watchProviders, credits, saga, editions] = await Promise.all([
    movie.tmdb_id ? getWatchProviders("movie", movie.tmdb_id) : null,
    getItemCredits(supabase, "movie", movie.id),
    getItemSaga(supabase, "movie", movie.id),
    getEditions(supabase, "movie", movie.id),
  ]);

  let entry: ManagedEntry | null = null;
  let queues: Queue[] = [];
  if (user) {
    const { data: row } = await supabase
      .from("library_entries")
      .select("id, status, rating, position, notes, queue_id")
      .eq("user_id", user.id)
      .eq("item_type", "movie")
      .eq("item_id", movie.id)
      .maybeSingle();
    if (row) {
      entry = {
        entryId: row.id,
        status: row.status as MediaStatus,
        rating: row.rating,
        position: parsePosition("movie", row.position),
        notes: row.notes,
        queueId: row.queue_id,
      };
    }
    queues = await getQueues(supabase, user.id);
  }

  const byline =
    [
      movie.director || null,
      movie.release_year ? String(movie.release_year) : null,
      movie.duration_minutes
        ? `${movie.duration_minutes} ${t("minutes")}`
        : null,
    ]
      .filter(Boolean)
      .join(" · ") || null;

  const canContribute = user
    ? hasMinRole(await getCurrentUserRole(supabase), "collaborator")
    : false;

  const metaRows: MetaRow[] = [];
  if (movie.director)
    metaRows.push({ label: tMeta("director"), value: movie.director });
  if (movie.release_year)
    metaRows.push({ label: tMeta("year"), value: String(movie.release_year) });
  if (movie.duration_minutes)
    metaRows.push({
      label: tMeta("runtime"),
      value: `${movie.duration_minutes} ${t("minutes")}`,
    });

  const genres = movie.genres ?? [];
  const community = await getCommunity(supabase, "movie", movie.id);

  let sagaMembers: SagaMember[] = [];
  if (saga) {
    const full = await getSaga(supabase, saga.sagaId);
    sagaMembers = full?.members ?? [];
  }

  return (
    <div className="flex flex-col">
      <ItemHero
        itemType="movie"
        mediaLabel={tDetail("mediaLabel.movie")}
        title={movie.title}
        byline={byline}
        genres={genres}
        coverUrl={movie.cover_url}
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
        itemType="movie"
        labels={{
          info: tDetail("tabInfo"),
          community: tDetail("tabCommunity"),
          log: tDetail("tabLog"),
        }}
        info={
          <div className="flex flex-col gap-10">
            {saga && sagaMembers.length >= 1 && (
              <SagaStrip
                members={sagaMembers}
                currentType="movie"
                currentId={movie.id}
                sagaId={saga.sagaId}
                sagaName={saga.name}
                label={tDetail("saga")}
              />
            )}
            <EditionStrip
              itemType="movie"
              itemId={movie.id}
              editions={editions}
              selectedEditionId={null}
              canContribute={canContribute}
            />
            <InfoPanel
              aboutLabel={tDetail("about")}
              synopsis={movie.synopsis}
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
            {canContribute && (
              <SagaAssignForm
                itemType="movie"
                itemId={movie.id}
                currentSaga={saga ? { id: saga.sagaId, name: saga.name } : null}
              />
            )}
          </div>
        }
        community={
          <div className="flex flex-col gap-10">
            <CommunityPanel
              itemType="movie"
              community={community}
              viewerLoggedIn={Boolean(user)}
            />
          </div>
        }
        log={
          <ItemManagePanel
            itemType="movie"
            itemId={movie.id}
            entry={entry}
            sessions={[]}
            queues={queues}
          />
        }
      />
    </div>
  );
}
