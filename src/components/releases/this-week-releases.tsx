import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { getPublicReleases } from "@/lib/releases/queries";
import { addDays, madridDay } from "@/lib/releases/precision";
import { releaseCover } from "@/lib/releases/quality";
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
  const content = <section aria-labelledby="novedades-semana" className="min-w-0">
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="novedades-semana" className="home-week-title font-serif text-xl font-semibold">{t("weekTitle")}</h2>
      <Link href="/novedades" className="inline-flex min-h-11 items-center text-xs text-muted-foreground underline hover:text-foreground">{t("weekLink")}</Link>
    </div>
    {result[0].status === "rejected" ? <EmptyState variant="panel" glyph={<CalendarIcon className="h-5 w-5" />} title={t("loadErrorTitle")} message={t("loadErrorBody")} action={<ReleaseRetry />} />
      : works.length === 0 ? <EmptyState variant="panel" glyph={<CalendarIcon className="h-5 w-5" />} title={t("weekEmpty")} />
        : <div className="flex min-w-0 flex-col gap-3">{works.map((work) => <ReleaseWorkCard key={work.workKey} releases={work.releases} compact homeCompact={expandable} />)}</div>}
  </section>;
  return <RouteMessages ns={["releases"]}>{expandable ? <HomeExpandable title={t("weekTitle")} openLabel={panel("openReleases")} closeLabel={panel("close")} className="home-releases-panel" summary={<><span className="home-preview-name">{t("weekTitle")}</span>{works.length ? <span className="home-preview-fan">{works.map((work) => { const cover = releaseCover(work.releases); return <span key={work.workKey} className="home-panel-preview-cover">{cover && <Image src={cover} alt="" fill unoptimized sizes="29px" className="object-cover" />}</span>; })}</span> : <span className="home-preview-meta">{result[0].status === "rejected" ? t("loadErrorTitle") : t("weekEmpty")}</span>}</>}>{content}</HomeExpandable> : content}</RouteMessages>;
}
