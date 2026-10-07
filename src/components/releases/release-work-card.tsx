"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { CulturalRelease } from "@/lib/releases/types";
import { formatReleaseDate } from "@/lib/releases/precision";
import { releaseCover, releaseInformationGaps, releaseSynopsis } from "@/lib/releases/quality";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { PendingReleaseAction, ReleaseNoticeAction } from "./release-actions";
import { releaseReviewDate, releaseWorkHref, safeReleaseUrl, type ReleaseUserState } from "./release-view";

export function ReleaseWorkCard({ releases, authenticated = false, userState = {}, stateAvailable = true, returnPath = "/novedades", compact = false, homeCompact = false, limited = false, showSynopsis = false }: {
  releases: CulturalRelease[];
  authenticated?: boolean;
  userState?: ReleaseUserState;
  stateAvailable?: boolean;
  returnPath?: string;
  compact?: boolean;
  limited?: boolean;
  showSynopsis?: boolean;
  homeCompact?: boolean;
}) {
  const t = useTranslations("releases");
  const release = releases[0];
  if (!release) return null;
  const workHref = releases.map(releaseWorkHref).find(Boolean) ?? `/novedades?lanzamiento=${release.id}`;
  const cover = releaseCover(releases);
  const gaps = releaseInformationGaps(releases);
  const synopsis = releaseSynopsis(releases);
  const title = <h3 className="break-words font-serif text-lg font-semibold leading-snug">{release.title}</h3>;
  const exact = releases.filter((row) => row.date_precision === "day");
  const announced = releases.filter((row) => row.date_precision !== "day");
  const inLibrary = releases.some((row) => userState[row.id]?.inLibrary);
  const pendingRelease = releases.find((row) => row.status === "published");
  return <article id={`lanzamiento-${release.id}`} data-work-key={release.work_key}
    className={`min-w-0 ${homeCompact ? "home-week-card" : ""} ${limited ? "border-b border-border py-3" : "rounded-card border border-border bg-surface p-4"}`}>
    <div className={`grid min-w-0 gap-4 ${limited ? "grid-cols-1" : compact ? "grid-cols-[64px_minmax(0,1fr)]" : "grid-cols-[80px_minmax(0,1fr)] sm:grid-cols-[96px_minmax(0,1fr)]"}`}>
      {!limited && <div className="relative aspect-[2/3] self-start overflow-hidden rounded-cover border border-border bg-surface-muted shadow-cover">
        <Link href={workHref} aria-label={t("viewDetails", { title: release.title })} className="block h-full">
        {cover ? <Image src={cover} alt="" fill unoptimized sizes={compact ? "64px" : "96px"} className="object-cover" />
          : <div aria-hidden className="flex h-full items-center justify-center px-2 text-center font-serif text-xs text-muted-foreground">{release.title}</div>}
        </Link>
      </div>}
      <div className="min-w-0">
        <p className={`release-work-type mb-1 font-mono text-[10px] uppercase tracking-wider ${MEDIA_ACCENT[release.item_type].text}`}>{t(`types.${release.item_type}`)}</p>
        {workHref ? <Link href={workHref} className="hover:underline">{title}</Link> : title}
        {!compact && gaps.length > 0 && <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {gaps.map((gap) => <span key={gap}>{t(gap === "cover" ? "missingCover" : "missingSynopsis")}</span>)}
        </div>}
        {!compact && synopsis?.synopsis_language === "en" && <p className="mt-2 text-xs text-muted-foreground">{t("synopsisEnglish")}</p>}
        {showSynopsis && synopsis && <p className="mt-2 whitespace-pre-line break-words text-sm text-muted-foreground">{synopsis.synopsis}</p>}
        {(release.author || release.subtitle) && <p className="release-work-author mt-1 break-words text-sm text-muted-foreground">{release.author || release.subtitle}</p>}
        {release.publisher && <p className="release-work-publisher mt-1 text-xs text-muted-foreground">{release.publisher}</p>}
        {!compact && pendingRelease && stateAvailable && <div className="mt-3">
          <PendingReleaseAction releaseId={pendingRelease.id} authenticated={authenticated} inLibrary={inLibrary} returnPath={returnPath} />
        </div>}
      </div>
    </div>
    <div className="mt-4 flex flex-col gap-3">
      {exact.map((row) => <ReleaseDateRow key={row.id} release={row} authenticated={authenticated} subscribed={Boolean(userState[row.id]?.subscribed)} stateAvailable={stateAvailable} returnPath={returnPath} compact={compact} />)}
      {announced.length > 0 && <div className="flex flex-col gap-3">
        {exact.length > 0 && <p className="text-xs font-medium text-muted-foreground">{t("otherAnnouncements")}</p>}
        {announced.map((row) => <ReleaseDateRow key={row.id} release={row} authenticated={authenticated} subscribed={Boolean(userState[row.id]?.subscribed)} stateAvailable={stateAvailable} returnPath={returnPath} compact={compact} />)}
      </div>}
    </div>
  </article>;
}

function ReleaseDateRow({ release, authenticated, subscribed, stateAvailable, returnPath, compact }: {
  release: CulturalRelease; authenticated: boolean; subscribed: boolean; stateAvailable: boolean; returnPath: string; compact: boolean;
}) {
  const t = useTranslations("releases");
  const reviewed = releaseReviewDate(release.checked_at);
  const sourceUrl = safeReleaseUrl(release.source_url);
  const languageCode = release.language === "es-ES" ? "es" : release.language;
  const language = ["es", "en", "fr", "de", "it", "pt", "und"].includes(languageCode)
    ? t(`languages.${languageCode as "es" | "en" | "fr" | "de" | "it" | "pt" | "und"}`) : release.language;
  return <div data-release-id={release.id} className="min-w-0 border-t border-border pt-3">
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="text-sm font-medium">{release.modality === "season" && release.season_number !== null
        ? t("season", { number: release.season_number }) : t(`modalities.${release.modality}`)}</span>
      {release.status === "cancelled" && <span className="text-sm font-medium text-status-dropped">{t("cancelled")}</span>}
      <time dateTime={release.date_value ?? undefined} className="text-sm">{release.date_precision === "unknown" ? t("unknownDate") : formatReleaseDate(release)}</time>
      <span className="rounded-full bg-surface-muted px-2 py-1 font-mono text-[10px]">{t(`markets.${release.market}`)}</span>
    </div>
    {release.market === "INT" && <p className="mt-1 text-xs text-muted-foreground">{t("internationalNotice")}</p>}
    {release.digital_platform && release.modality === "digital" && <p className="mt-1 text-sm">{release.digital_platform}</p>}
    {release.item_type === "book" && <p className="mt-1 text-xs text-muted-foreground">{t("language", { language })}</p>}
    {!compact && <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="break-words underline hover:text-foreground">{t("source", { name: release.source_name })}</a>
        : <span>{t("source", { name: release.source_name })}</span>}
      <span>{reviewed ? t("reviewed", { date: reviewed }) : t("notReviewed")}</span>
    </div>}
    {!compact && stateAvailable && <div className="mt-1">
      <ReleaseNoticeAction releaseId={release.id} authenticated={authenticated} subscribed={subscribed} cancelled={release.status === "cancelled"} returnPath={returnPath} />
    </div>}
  </div>;
}
