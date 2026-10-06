import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { itemHref } from "@/lib/catalog/item-href";
import type { LibraryItem } from "@/lib/library/types";
import styles from "./library-highlights.module.css";

/** Every pinned work shares one presentation; the query's order is preserved. */
export async function LibraryHighlights({ items }: { items: LibraryItem[] }) {
  if (items.length === 0) return null;

  const [profile, library, sessions] = await Promise.all([
    getTranslations("profile"),
    getTranslations("library"),
    getTranslations("item.sessions"),
  ]);

  return (
    <section className={styles.highlights} aria-label={profile("highlights")}>
      <h2 className={styles.heading}>{profile("highlights")}</h2>
      <ul className={styles.grid}>
        {items.map((favorite) => {
          const href = itemHref(favorite.itemType, favorite.itemId);
          // Movies register their viewing in the detail page and have no sessions.
          const activePassId = favorite.activePassId?.trim();
          const sessionHref = favorite.status === "in_progress" &&
            favorite.itemType !== "movie" && activePassId
            ? `/sesion/${activePassId}`
            : null;

          return (
            <li key={favorite.entryId} className={styles.slot}>
              <article aria-label={favorite.title} className={styles.card}>
                <Link
                  href={href}
                  aria-label={favorite.title}
                  className={styles.coverLink}
                  data-media-type={favorite.itemType}
                >
                  <span className={styles.cover}>
                    {favorite.coverUrl ? (
                      <Image
                        src={favorite.coverUrl}
                        alt=""
                        fill
                        sizes="(max-width: 359px) 64px, (max-width: 639px) 80px, 96px"
                        className={styles.coverImage}
                      />
                    ) : (
                      <span aria-hidden className={styles.coverFallback}>{favorite.title}</span>
                    )}
                  </span>
                </Link>
                <div className={styles.content}>
                  <h3 className={styles.title}>{favorite.title}</h3>
                  {favorite.subtitle && <p className={styles.subtitle}>{favorite.subtitle}</p>}
                  <span className={styles.status} data-status={favorite.status}>
                    <span aria-hidden className={styles.statusDot} />
                    {favorite.upToDate ? library("upToDate") : library(`status.${favorite.status}`)}
                  </span>
                </div>
                <div className={styles.actions}>
                  <Link href={href} className={styles.detailAction}>
                    {library("highlights.viewItem")}
                  </Link>
                  {sessionHref && (
                    <Link href={sessionHref} className={styles.sessionAction}>
                      {sessions("add")}
                    </Link>
                  )}
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
