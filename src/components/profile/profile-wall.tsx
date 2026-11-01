"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { FeedEntry } from "@/lib/social/feed";
import { loadMoreProfileFeed } from "@/lib/social/feed-actions";
import { itemHref } from "@/lib/catalog/item-href";
import { buildProfileWall, madridMonthKey, wallMonthLabel, type WallCover } from "@/lib/profile/wall";
import { FeedItem } from "@/components/social/feed-item";
import { RatingDots } from "@/components/ui/rating-dots";
import { formatDots } from "@/lib/rating/dots";
import { HeartIcon } from "@/components/ui/icons";
import { CoverTile } from "./cover-tile";

// Recuento de reacciones de una obra del muro, con el mismo icono que el feed.
// Decorativo: el número ya va en el nombre accesible del enlace.
function ReactionBadge({ count, className }: { count: number; className: string }) {
  return (
    <span aria-hidden="true" className={`inline-flex items-center gap-1 rounded-full bg-background/90 px-1.5 py-0.5 text-[10px] leading-none ${className}`}>
      <HeartIcon className="h-3 w-3" />
      {count}
    </span>
  );
}

// El muro de la actividad (spec §5): las mismas publicaciones que la lista de
// antes, agrupadas por mes; cada obra una vez con su último estado y las
// publicaciones sin portada intercaladas como tarjetas (`FeedItem`, con sus
// reacciones y comentarios). «Cargar más» añade eventos y el muro se
// reconstruye entero, así un mes partido entre páginas queda unido.
export function ProfileWall({
  actorId,
  initialEvents,
  initialCursor,
  initialKnownUsernames,
  viewerLoggedIn,
}: {
  actorId: string;
  initialEvents: FeedEntry[];
  initialCursor: string | null;
  initialKnownUsernames: string[];
  viewerLoggedIn: boolean;
}) {
  const t = useTranslations("profile.visual.wall");
  const tFeed = useTranslations("feed");
  const [extra, setExtra] = useState<FeedEntry[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [known, setKnown] = useState(initialKnownUsernames);
  const [isPending, startTransition] = useTransition();

  const months = useMemo(() => buildProfileWall([...initialEvents, ...extra]), [initialEvents, extra]);
  const currentKey = madridMonthKey(new Date().toISOString());

  function stateLabel(c: WallCover): string {
    switch (c.state.kind) {
      case "rated": {
        const value = formatDots(c.state.rating);
        return value === null ? t("finished") : t("rated", { value });
      }
      case "dropped": return t("dropped");
      case "finished": return t("finished");
      case "in_progress": return t("inProgress");
      case "episodes": return t("episodes", { season: c.state.season === null ? "none" : String(c.state.season), count: c.state.count });
    }
  }

  function loadMore() {
    startTransition(async () => {
      const page = await loadMoreProfileFeed(actorId, cursor);
      setExtra((prev) => [...prev, ...page.events]);
      setCursor(page.nextCursor);
      setKnown((prev) => [...new Set([...prev, ...page.knownUsernames])]);
    });
  }

  return (
    <div data-testid="profile-wall" className="flex flex-col gap-2">
      {months.map((month) => (
        <section key={month.key} aria-labelledby={`wall-${month.key}`}>
          <h3 id={`wall-${month.key}`} suppressHydrationWarning className="pt-4 pb-2 font-mono text-[11px] font-medium uppercase tracking-[.09em] text-muted-foreground">
            {t("month", { label: wallMonthLabel(month.key, currentKey), count: month.coverCount })}
          </h3>
          <ul className="grid grid-flow-row-dense grid-cols-3 gap-2.5 lg:grid-cols-6">
            {month.items.map((item) => {
              if (item.type === "card") {
                return (
                  <li key={item.card.id} className="col-span-full">
                    <FeedItem entry={item.card.entry} viewerLoggedIn={viewerLoggedIn} knownUsernames={known} hideActor />
                  </li>
                );
              }
              const c = item.cover;
              const review = c.review;
              const reactionsText = c.reactions > 0 ? t("reactions", { count: c.reactions }) : null;
              const state = stateLabel(c);
              const label = !review
                ? reactionsText
                  ? t("coverLabelWithReactions", { title: c.title, state, reactions: reactionsText })
                  : t("coverLabel", { title: c.title, state })
                : review.isSpoiler
                  ? reactionsText
                    ? t("spoilerReviewLabelWithReactions", { title: c.title, state, reactions: reactionsText })
                    : t("spoilerReviewLabel", { title: c.title, state })
                  : reactionsText
                    ? t("reviewLabelWithReactions", { title: c.title, state, excerpt: review.excerpt, reactions: reactionsText })
                    : t("reviewLabel", { title: c.title, state, excerpt: review.excerpt });
              const postId = review?.postId ?? c.postId;
              const href = postId ? `/post/${postId}` : itemHref(c.itemType, c.itemId);
              const dim = c.state.kind === "dropped" ? "opacity-55" : "";

              if (!review) {
                return (
                  <li key={c.key} className="relative">
                    <Link href={href} aria-label={label} className="block transition-transform motion-safe:hover:-translate-y-1">
                      <CoverTile cover={{ title: c.title, coverUrl: c.coverUrl }} sizes="(max-width: 1024px) 30vw, 140px" className={dim} />
                      <div aria-hidden="true" className={`absolute top-1.5 right-1.5 rounded-full bg-background/90 px-1.5 py-0.5 font-mono text-[9.5px] font-medium uppercase ${c.state.kind === "in_progress" ? "text-gold-ink" : ""}`}>
                        {c.state.kind === "rated" ? <RatingDots value={c.state.rating} size="sm" /> : state}
                      </div>
                      {c.reactions > 0 && <ReactionBadge count={c.reactions} className="absolute bottom-1.5 left-1.5" />}
                    </Link>
                  </li>
                );
              }

              // Reseña con texto: baldosa de 2 columnas, a la altura de una portada.
              const rating = review.rating ?? (c.state.kind === "rated" ? c.state.rating : null);
              return (
                <li key={c.key} className="col-span-2">
                  {/* `h-full`: la fila la puede estirar una portada suelta más alta;
                      la tarjeta ocupa ese alto en vez de quedarse corta. */}
                  <Link
                    href={href}
                    aria-label={label}
                    className="flex h-full min-h-11 items-stretch gap-2.5 rounded-card border border-border bg-surface p-2 transition-transform motion-safe:hover:-translate-y-1"
                  >
                    <div className="w-[38%] shrink-0">
                      <CoverTile cover={{ title: c.title, coverUrl: c.coverUrl }} sizes="(max-width: 1024px) 20vw, 90px" className={dim} />
                    </div>
                    <div aria-hidden="true" className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden">
                      <span className="line-clamp-2 font-serif text-[13px] font-semibold leading-tight text-foreground">{c.title}</span>
                      {rating !== null ? (
                        <RatingDots value={rating} size="sm" />
                      ) : (
                        <span className={`font-mono text-[9.5px] font-medium uppercase ${c.state.kind === "in_progress" ? "text-gold-ink" : "text-muted-foreground"}`}>{state}</span>
                      )}
                      <p className={`line-clamp-3 font-serif text-[12px] leading-snug ${review.isSpoiler ? "text-muted-foreground" : "italic text-foreground"}`}>
                        {review.isSpoiler ? t("spoilerReview") : review.excerpt}
                      </p>
                      {/* En el flujo de la columna, al pie: absoluta se salía de la
                          tarjeta cuando la fila era más alta y pisaba la cita. */}
                      {c.reactions > 0 && <ReactionBadge count={c.reactions} className="mt-auto self-end" />}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {cursor && (
        <button
          type="button"
          disabled={isPending}
          onClick={loadMore}
          className="mt-4 self-center rounded-full border border-border px-5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted disabled:opacity-50"
        >
          {tFeed("loadMore")}
        </button>
      )}
    </div>
  );
}
