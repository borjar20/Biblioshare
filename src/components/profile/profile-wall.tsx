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
import { CoverTile } from "./cover-tile";

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
          <div className="flex flex-col gap-3">
            {month.segments.map((seg) =>
              seg.type === "card" ? (
                <FeedItem key={seg.card.id} entry={seg.card.entry} viewerLoggedIn={viewerLoggedIn} knownUsernames={known} hideActor />
              ) : (
                <ul key={`covers-${seg.covers[0].key}`} className="grid grid-cols-3 gap-2.5 lg:grid-cols-6">
                  {seg.covers.map((c) => (
                    <li key={c.key} className="relative">
                      <Link
                        href={c.postId ? `/post/${c.postId}` : itemHref(c.itemType, c.itemId)}
                        aria-label={c.reactions > 0
                          ? t("coverLabelWithReactions", { title: c.title, state: stateLabel(c), reactions: t("reactions", { count: c.reactions }) })
                          : t("coverLabel", { title: c.title, state: stateLabel(c) })}
                        className="block transition-transform motion-safe:hover:-translate-y-1"
                      >
                        <CoverTile cover={{ title: c.title, coverUrl: c.coverUrl }} sizes="(max-width: 1024px) 30vw, 140px" className={c.state.kind === "dropped" ? "opacity-55" : ""} />
                        <div aria-hidden="true" className={`absolute top-1.5 right-1.5 rounded-full bg-background/90 px-1.5 py-0.5 font-mono text-[9.5px] font-medium uppercase ${c.state.kind === "in_progress" ? "text-gold-ink" : ""}`}>
                          {c.state.kind === "rated" ? <RatingDots value={c.state.rating} size="sm" /> : stateLabel(c)}
                        </div>
                        {c.reactions > 0 && (
                          <span aria-hidden="true" className="absolute bottom-1.5 left-1.5 rounded-full bg-background/90 px-1.5 py-0.5 text-[10px]">❤ {c.reactions}</span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              ),
            )}
          </div>
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
