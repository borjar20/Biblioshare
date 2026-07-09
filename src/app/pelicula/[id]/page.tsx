import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import {
  ItemManagePanel,
  type ManagedEntry,
} from "@/components/item-manage-panel";
import { WatchProviders } from "@/components/watch-providers";
import { CreditsSection } from "@/components/credits-section";
import { getWatchProviders } from "@/lib/catalog/tmdb";
import { sagaHref } from "@/lib/catalog/item-href";
import { ensureItemEnriched } from "@/lib/people/enrich-item";
import { getItemCredits } from "@/lib/people/get-item-credits";
import { getItemSaga } from "@/lib/sagas/get-item-saga";
import { parsePosition } from "@/lib/library/position";
import type { MediaStatus } from "@/lib/library/types";

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

  const [watchProviders, credits, saga] = await Promise.all([
    movie.tmdb_id ? getWatchProviders("movie", movie.tmdb_id) : null,
    getItemCredits(supabase, "movie", movie.id),
    getItemSaga(supabase, "movie", movie.id),
  ]);

  let entry: ManagedEntry | null = null;
  if (user) {
    const { data: row } = await supabase
      .from("library_entries")
      .select("id, status, rating, position, notes")
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
      };
    }
  }

  // El director/creador se muestra ahora con enlace en CreditsSection; aquí
  // quedan solo los metadatos sin ficha propia (año, duración, géneros).
  const metaLines = [
    movie.release_year ? String(movie.release_year) : null,
    movie.duration_minutes ? `${movie.duration_minutes} ${t("minutes")}` : null,
    movie.genres && movie.genres.length > 0 ? movie.genres.join(", ") : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:flex-row sm:items-start sm:px-6">
      <div className="relative aspect-[2/3] w-full max-w-xs shrink-0 overflow-hidden rounded-lg border border-border bg-surface-muted sm:w-56">
        {movie.cover_url ? (
          <Image
            src={movie.cover_url}
            alt={movie.title}
            fill
            sizes="(max-width: 768px) 80vw, 224px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
            {movie.title}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{movie.title}</h1>

        {metaLines.map((line, i) => (
          <p key={i} className="text-sm text-muted-foreground">
            {line}
          </p>
        ))}

        {saga && (
          <Link
            href={sagaHref(saga.sagaId)}
            className="inline-flex w-fit items-center rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground hover:bg-surface-muted"
          >
            {saga.position
              ? t("sagaPart", { name: saga.name, number: saga.position })
              : t("sagaLabel", { name: saga.name })}
          </Link>
        )}

        {movie.synopsis && (
          <p className="text-sm text-foreground">{movie.synopsis}</p>
        )}

        <CreditsSection credits={credits} />

        {watchProviders && <WatchProviders data={watchProviders} />}

        <ItemManagePanel
          itemType="movie"
          itemId={movie.id}
          entry={entry}
          sessions={[]}
        />
      </div>
    </div>
  );
}
