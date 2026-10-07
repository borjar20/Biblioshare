import Link from "next/link";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { getPublicReleases } from "@/lib/releases/queries";
import { addDays, madridDay } from "@/lib/releases/precision";
import { RouteMessages } from "@/components/route-messages";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarIcon } from "@/components/ui/icons";
import { HomeExpandable } from "@/components/home/home-expandable";
import { ReleaseRetry } from "./release-retry";
import { ReleaseWorkCard } from "./release-work-card";

/** Público; la landing conserva su presentación original. */
export async function ThisWeekReleases({ expandable = false }: { expandable?: boolean } = {}) {
  await connection();
  const t = await getTranslations("releases");
  const panel = await getTranslations("homePanels");
  const today = madridDay(new Date());
  const dayOfWeek = new Date(`${today}T12:00:00Z`).getUTCDay();
  const sunday = addDays(today, dayOfWeek === 0 ? 0 : 7 - dayOfWeek);
  const result = await Promise.allSettled([getPublicReleases({ market: "ES", language: "es", from: today, to: sunday, includeUndated: false, completeness: "complete", limit: 3 })]);
  const works = result[0].status === "fulfilled" ? result[0].value : [];
  const content = <section aria-labelledby={expandable ? undefined : "novedades-semana"} className={`min-w-0 ${expandable ? "home-week-focus home-focus-card" : ""}`} tabIndex={expandable ? -1 : undefined}>
    <div className="home-week-heading mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="novedades-semana" className="home-week-title font-serif text-xl font-semibold">{t("weekTitle")}</h2>
      <Link href="/novedades" className="home-week-navigation inline-flex min-h-11 items-center text-xs text-muted-foreground underline hover:text-foreground">{t("weekLink")}</Link>
    </div>
    {result[0].status === "rejected" ? <div className="home-week-empty"><EmptyState variant="panel" glyph={<CalendarIcon className="h-5 w-5" />} title={t("loadErrorTitle")} message={t("loadErrorBody")} action={<ReleaseRetry />} /></div>
      : works.length === 0 ? <div className="home-week-empty"><EmptyState variant="panel" glyph={<CalendarIcon className="h-5 w-5" />} title={t("weekEmpty")} /></div>
        : <div className="home-release-list flex min-w-0 flex-col gap-3">{works.map((work, index) => expandable
          ? <div key={work.workKey} className="home-release-work-slot" style={{ ["--home-fan-x" as string]: `${index * 23}px`, ["--home-fan-tilt" as string]: `${works.length > 1 ? index === 0 ? -7 : index === works.length - 1 ? 7 : 0 : 0}deg` }}><ReleaseWorkCard releases={work.releases} compact homeCompact /></div>
          : <ReleaseWorkCard key={work.workKey} releases={work.releases} compact />)}</div>}
  </section>;
  return <RouteMessages ns={["releases"]}>{expandable
    ? <HomeExpandable title={t("weekTitle")} openLabel={panel("openReleases")} closeLabel={panel("close")}
        className="home-releases-panel home-releases-morph home-shared-panel" summary={<span>{t("weekTitle")}</span>}
        sectionHeading={<h2 className="home-shared-title">{t("weekTitle")}</h2>} focus={content}>{null}</HomeExpandable>
    : content}</RouteMessages>;
}
