import { cache } from "react";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { getPublicReleases } from "@/lib/releases/queries";
import { addDays, madridDay } from "@/lib/releases/precision";
import { releaseCover } from "@/lib/releases/quality";
import { RouteMessages } from "@/components/route-messages";
import { EmptyState } from "@/components/ui/empty-state";
import { AppLogoIcon, CalendarIcon } from "@/components/ui/icons";
import { ReleaseRetry } from "./release-retry";
import { ReleaseWorkCard } from "./release-work-card";
import { releaseWorkHref } from "./release-view";
import styles from "./releases.module.css";

// React.cache deduplicates only within the current server render. This public
// query uses a sessionless client; neither personal state nor persistent cache.
const thisWeekWorks = cache(async (limit: number) => {
  await connection();
  const today = madridDay(new Date());
  const dayOfWeek = new Date(`${today}T12:00:00Z`).getUTCDay();
  const sunday = addDays(today, dayOfWeek === 0 ? 0 : 7 - dayOfWeek);
  return getPublicReleases({ market: "ES", language: "es", from: today, to: sunday,
    includeUndated: false, completeness: "complete", limit });
});

/** The public landing uses four slots; the personal Home keeps its narrow rail. */
export async function ThisWeekReleases({ wide = false }: { wide?: boolean } = {}) {
  const t = await getTranslations("releases");
  const [result] = await Promise.allSettled([thisWeekWorks(wide ? 4 : 3)]);
  return <RouteMessages ns={["releases"]}>
    <section aria-labelledby="novedades-semana" className="min-w-0">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3 border-t border-border pt-5">
        <h2 id="novedades-semana" className="font-serif text-2xl font-medium">{t("weekTitle")}</h2>
        <Link href="/novedades" className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">{t("weekLink")}</Link>
      </div>
      {result.status === "rejected" ? <EmptyState variant="panel" glyph={<CalendarIcon className="h-5 w-5" />} title={t("loadErrorTitle")} message={t("loadErrorBody")} action={<ReleaseRetry />} />
        : result.value.length === 0 ? <EmptyState variant="panel" glyph={<CalendarIcon className="h-5 w-5" />} title={t("weekEmpty")} />
          : <div className={wide ? styles.weekGrid : "flex min-w-0 flex-col gap-3"}>{result.value.map((work) => <ReleaseWorkCard key={work.workKey} releases={work.releases} compact />)}</div>}
    </section>
  </RouteMessages>;
}

export async function PublicReleaseFan() {
  const t = await getTranslations("releases");
  const [result] = await Promise.allSettled([thisWeekWorks(4)]);
  const works = result.status === "fulfilled" ? result.value.slice(0, 3) : [];
  return <div className={styles.fan} role="group" aria-label={t("fanLabel")}>
    {works.length ? <div className={styles.fanCovers} data-cover-count={works.length}>
      {works.map((work) => {
        const cover = releaseCover(work.releases);
        const href = work.releases.map(releaseWorkHref).find(Boolean) ?? `/novedades?lanzamiento=${work.releases[0].id}`;
        return cover ? <Link key={work.workKey} href={href} className={styles.fanCover} aria-label={t("viewDetails", { title: work.title })}>
          <Image src={cover} alt="" fill unoptimized sizes="(max-width: 640px) 120px, 150px" className="object-cover" />
        </Link> : null;
      })}
    </div> : <div aria-hidden className={styles.fanBrand}><AppLogoIcon className="h-28 w-28" /></div>}
    <p className={styles.fanCaption}>{t("fanCaption")}</p>
  </div>;
}