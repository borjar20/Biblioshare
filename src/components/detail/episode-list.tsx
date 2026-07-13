"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { EpisodeRow } from "@/lib/series/get-episode-data";
import { averageRating } from "@/lib/series/rating-scale";
import { setEpisodeWatched, rateEpisode } from "@/lib/series/episode-actions";
import { CheckIcon, NoteIcon, ChevronDownIcon } from "@/components/ui/icons";
import { EpisodeRating } from "./episode-rating";
import type { SeasonGroup, GridSource } from "./episode-grid";

const dateFmt = new Intl.DateTimeFormat("es", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : dateFmt.format(d);
}

// Lista por temporadas colapsables (§7.36): checkmark de visto, valoración por
// dots y reseña expandible. La fuente (mis notas / comunidad) alterna entre la
// vista interactiva del propio usuario y la agregada de la comunidad.
export function EpisodeList({
  seriesId,
  seasons,
  source,
  isLoggedIn,
}: {
  seriesId: string;
  seasons: SeasonGroup[];
  source: GridSource;
  isLoggedIn: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {seasons.map((s) => (
        <SeasonSection
          key={s.season}
          seriesId={seriesId}
          group={s}
          source={source}
          isLoggedIn={isLoggedIn}
        />
      ))}
    </div>
  );
}

function SeasonSection({
  seriesId,
  group,
  source,
  isLoggedIn,
}: {
  seriesId: string;
  group: SeasonGroup;
  source: GridSource;
  isLoggedIn: boolean;
}) {
  const t = useTranslations("episode");
  const [open, setOpen] = useState(group.season === 1);

  const { watched, avg } = useMemo(() => {
    const watchedCount = group.episodes.filter((e) => e.own.watched).length;
    const ratings = group.episodes
      .map((e) => (source === "mine" ? e.own.rating : e.avgRating))
      .filter((r): r is number => r !== null);
    return { watched: watchedCount, avg: averageRating(ratings) };
  }, [group.episodes, source]);

  return (
    <section className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 border-l-2 border-type-series px-4 py-3 text-left"
      >
        <h3 className="font-serif text-base font-semibold text-foreground">
          {t("season", { n: group.season })}
        </h3>
        <span className="font-mono text-[10px] text-muted-foreground">
          {t("episodeCount", { count: group.episodes.length })}
        </span>
        {isLoggedIn && (
          <span
            className={`font-mono text-[10px] ${
              watched === group.episodes.length
                ? "text-status-completed"
                : "text-muted-foreground"
            }`}
          >
            {t("watchedCount", { watched, total: group.episodes.length })}
          </span>
        )}
        {avg !== null && (
          <span className="font-mono text-[10px] text-type-series">
            {t("avgShort", { value: avg.toFixed(1) })}
          </span>
        )}
        <ChevronDownIcon
          className={`ml-auto h-4 w-4 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <ul className="divide-y divide-border">
          {group.episodes.map((ep) => (
            <EpisodeItem
              key={ep.episode}
              seriesId={seriesId}
              episode={ep}
              source={source}
              isLoggedIn={isLoggedIn}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function EpisodeItem({
  seriesId,
  episode,
  source,
  isLoggedIn,
}: {
  seriesId: string;
  episode: EpisodeRow;
  source: GridSource;
  isLoggedIn: boolean;
}) {
  const t = useTranslations("episode");
  const [isPending, startTransition] = useTransition();
  const [watched, setWatched] = useState(episode.own.watched);
  const [rating, setRating] = useState<number | null>(episode.own.rating);
  const [review, setReview] = useState(episode.own.review ?? "");
  const [open, setOpen] = useState(false);

  const interactive = source === "mine" && isLoggedIn;
  const meta = [
    episode.runtimeMinutes ? t("runtime", { n: episode.runtimeMinutes }) : null,
    formatDate(episode.airDate),
  ]
    .filter(Boolean)
    .join(" · ");

  const displayRating = source === "mine" ? rating : episode.avgRating;

  const toggleWatched = () => {
    const next = !watched;
    setWatched(next);
    if (!next) {
      setRating(null);
      setReview("");
    }
    startTransition(() =>
      setEpisodeWatched(seriesId, episode.season, episode.episode, next)
    );
  };

  const save = (nextRating: number | null, nextReview: string) => {
    setWatched(true);
    setRating(nextRating);
    startTransition(() =>
      rateEpisode(seriesId, episode.season, episode.episode, nextRating, nextReview || null)
    );
  };

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      {interactive ? (
        <button
          type="button"
          onClick={toggleWatched}
          disabled={isPending}
          aria-label={t("watched")}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-60 ${
            watched
              ? "border-type-series bg-type-series/15 text-type-series"
              : "border-border text-transparent hover:border-type-series hover:text-type-series/40"
          }`}
        >
          <CheckIcon className="h-3.5 w-3.5" />
        </button>
      ) : (
        <span className="w-7 shrink-0" />
      )}

      <span className="w-7 shrink-0 font-mono text-[11px] text-muted-foreground">
        {t("episodeShort", { n: episode.episode })}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-medium text-foreground">
            {episode.title ?? t("untitled")}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <EpisodeRating
              rating={displayRating}
              onRate={interactive ? (r) => save(r, review) : undefined}
              disabled={isPending}
            />
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-label={t("details")}
              className="relative flex h-7 items-center gap-0.5 rounded-md border border-border px-1.5 text-muted-foreground hover:text-foreground"
            >
              <NoteIcon className="h-3.5 w-3.5" />
              {source === "mine" && Boolean(episode.own.review) && (
                <span className="h-1 w-1 rounded-full bg-type-series" />
              )}
              <ChevronDownIcon
                className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
              />
            </button>
          </div>
        </div>

        {meta && (
          <span className="font-mono text-[10px] text-muted-foreground">{meta}</span>
        )}

        {open && (
          <div className="mt-1 flex flex-col gap-2">
            {episode.synopsis && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {episode.synopsis}
              </p>
            )}

            {interactive ? (
              <div className="flex flex-col gap-2 border-l-2 border-type-series/40 pl-3">
                <textarea
                  value={review}
                  onChange={(e) => setReview(e.target.value)}
                  rows={2}
                  placeholder={t("reviewPlaceholder")}
                  className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => save(rating, review)}
                  disabled={isPending}
                  className="self-start rounded-full border border-border px-3 py-1 text-[11px] text-foreground hover:bg-surface-muted disabled:opacity-60"
                >
                  {t("save")}
                </button>
              </div>
            ) : (
              displayRating !== null && (
                <p className="font-mono text-[10px] text-muted-foreground">
                  {t("communityCount", { count: episode.ratingCount })}
                </p>
              )
            )}
          </div>
        )}
      </div>
    </li>
  );
}
