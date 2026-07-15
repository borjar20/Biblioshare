import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getQueues } from "@/lib/queue/get-queues";
import type { Queue } from "@/lib/queue/types";
import {
  LogPanel,
  type ManagedEntry,
} from "@/components/detail/log-panel";
import { WatchProviders } from "@/components/watch-providers";
import { CreditsSection } from "@/components/credits-section";
import { ItemHero } from "@/components/detail/item-hero";
import { ItemDetailTabs } from "@/components/detail/item-detail-tabs";
import { InfoPanel } from "@/components/detail/info-panel";
import { type MetaRow } from "@/components/detail/metadata-sidebar";
import { CommunityPanel } from "@/components/detail/community-panel";
import { SagaStrip } from "@/components/detail/saga-strip";
import { EditionsSection } from "@/components/detail/edition-details";
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
import { getPasses } from "@/lib/passes/get-passes";
import type { Pass } from "@/lib/passes/types";
import { CatalogEditor, EditFichaButton } from "@/components/detail/catalog-editor";

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
  let passes: Pass[] = [];
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
      passes = await getPasses(supabase, "movie", movie.id, user.id);
    }
    queues = await getQueues(supabase, user.id);
  }

  // La duración es de la VERSIÓN (movie_versions), no de la obra: no va en el
  // byline del hero. Ya se ve en el panel de la edición (EditionDetails).
  const byline =
    [movie.director || null, movie.release_year ? String(movie.release_year) : null]
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
          <CatalogEditor
            itemType="movie"
            itemId={movie.id}
            item={{
              title: movie.title,
              author: movie.director,
              synopsis: movie.synopsis,
              genres,
              year: movie.release_year,
              coverUrl: movie.cover_url,
            }}
            editions={editions}
            saga={saga ? { id: saga.sagaId, name: saga.name } : null}
            canContribute={canContribute}
          >
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
              {/* La sinopsis va DENTRO de EditionsSection: el mockup la pone
                  entre la tira de ediciones y el panel de metadatos, y así los
                  dos comparten el estado de "qué edición miro". */}
              <EditionsSection
                itemType="movie"
                itemId={movie.id}
                editions={editions}
                selectedEditionId={passes.find((p) => !p.finishedOn)?.editionId ?? null}
                canContribute={canContribute}
                workRows={metaRows}
                genres={genres}
                genresLabel={tDetail("genres")}
              >
                <InfoPanel
                  aboutLabel={tDetail("about")}
                  synopsis={movie.synopsis}
                  noSynopsisLabel={tDetail("noSynopsis")}
                  actions={<EditFichaButton />}
                  extra={
                    <>
                      <CreditsSection credits={credits} />
                      {watchProviders && <WatchProviders data={watchProviders} />}
                    </>
                  }
                />
              </EditionsSection>
            </div>
          </CatalogEditor>
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
          <LogPanel
            itemType="movie"
            itemId={movie.id}
            entry={entry}
            passes={passes}
            sessions={[]}
            editions={editions}
            queues={queues}
          />
        }
      />
    </div>
  );
}
