import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { itemHref } from "@/lib/catalog/item-href";
import type { LibraryItem } from "@/lib/library/types";
import styles from "./library-highlights.module.css";

/** The query's pinned order decides the hero; all remaining favorites stay visible. */
export async function LibraryHighlights({ items }: { items: LibraryItem[] }) {
  const [primary, ...remaining] = items;
  if (!primary) return null;

  const [profile, library, sessions] = await Promise.all([
    getTranslations("profile"),
    getTranslations("library"),
    getTranslations("item.sessions"),
  ]);
  const href = itemHref(primary.itemType, primary.itemId);
  // Movies register their viewing in the detail page and have no sessions.
  const sessionHref = primary.status === "in_progress" &&
    primary.itemType !== "movie" && primary.activePassId
    ? `/sesion/${primary.activePassId}`
    : null;

  return (
    <section className={styles.highlights}>
      <article aria-label={primary.title} className={styles.hero}>
        <div className={styles.content}>
          <div className={styles.labels}>
            <h2 className={styles.heading}>{profile("highlights")}</h2>
            <span className={styles.status} data-status={primary.status}>
              <span aria-hidden className={styles.statusDot} />
              {primary.upToDate ? library("upToDate") : library(`status.${primary.status}`)}
            </span>
          </div>
          <h3 className={styles.title}>{primary.title}</h3>
          {primary.subtitle && <p className={styles.subtitle}>{primary.subtitle}</p>}
          <div className={styles.actions}>
            {sessionHref && (
              <Link href={sessionHref} className={styles.primaryAction}>
                {sessions("add")}
              </Link>
            )}
            <Link href={href} className={sessionHref ? styles.detailAction : styles.primaryAction}>
              {library("highlights.viewItem")}
            </Link>
          </div>
        </div>
        <Link
          href={href}
          aria-label={primary.title}
          className={styles.heroCover}
          data-media-type={primary.itemType}
        >
          <span className={styles.cover}>
            {primary.coverUrl ? (
              <Image
                src={primary.coverUrl}
                alt=""
                fill
                sizes="(max-width: 639px) 88px, (max-width: 1023px) 130px, 154px"
                className={styles.coverImage}
              />
            ) : (
              <span aria-hidden className={styles.coverFallback}>{primary.title}</span>
            )}
          </span>
        </Link>
      </article>
      {remaining.length > 0 && (
        <ul className={styles.more}>
          {remaining.map((favorite) => (
            <li key={favorite.entryId}>
              <Link href={itemHref(favorite.itemType, favorite.itemId)} className={styles.moreLink}>
                <span className={styles.thumbnail}>
                  {favorite.coverUrl && (
                    <Image src={favorite.coverUrl} alt="" fill sizes="44px" className={styles.coverImage} />
                  )}
                </span>
                <span className={styles.moreTitle}>{favorite.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
