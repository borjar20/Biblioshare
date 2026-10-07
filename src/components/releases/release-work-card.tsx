"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { CulturalRelease } from "@/lib/releases/types";
import { formatReleaseDate } from "@/lib/releases/precision";
import { releaseCover, releaseInformationGaps, releaseSynopsis } from "@/lib/releases/quality";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { PendingReleaseAction, ReleaseNoticeAction } from "./release-actions";
import { releaseReviewDate, releaseWorkHref, safeReleaseUrl, type ReleaseUserState } from "./release-view";
import styles from "./releases.module.css";

export function ReleaseWorkCard({ releases, authenticated = false, userState = {}, stateAvailable = true, returnPath = "/novedades", compact = false, limited = false, showSynopsis = false, headingLevel = 3, homeCompact = false }: {
  releases: CulturalRelease[]; authenticated?: boolean; userState?: ReleaseUserState; stateAvailable?: boolean;
  returnPath?: string; compact?: boolean; limited?: boolean; showSynopsis?: boolean; headingLevel?: 3 | 4; homeCompact?: boolean;
}) {
  const t = useTranslations("releases");
  const release = releases[0];
  if (!release) return null;
  const workHref = releases.map(releaseWorkHref).find(Boolean) ?? `/novedades?lanzamiento=${release.id}`;
  const cover = releaseCover(releases);
  const gaps = releaseInformationGaps(releases);
  const synopsis = releaseSynopsis(releases);
  const Heading = headingLevel === 4 ? "h4" : "h3";
  const exact = releases.filter((row) => row.date_precision === "day");
  const announced = releases.filter((row) => row.date_precision !== "day");
  const inLibrary = releases.some((row) => userState[row.id]?.inLibrary);
  const pendingRelease = releases.find((row) => row.status === "published");
  const pendingAction = !compact && pendingRelease && stateAvailable ? <PendingReleaseAction releaseId={pendingRelease.id} authenticated={authenticated} inLibrary={inLibrary} returnPath={returnPath} dense={!showSynopsis} /> : null;
  return <article id={`lanzamiento-${release.id}`} data-work-key={release.work_key}
    className={`${styles.card} ${homeCompact ? "home-week-card" : ""} ${compact && !homeCompact ? styles.compact : ""} ${limited ? styles.limited : ""} ${showSynopsis ? styles.detail : ""}`}>
    {!limited && cover && <div aria-hidden className={`${styles.ambient} ${homeCompact ? "home-release-ambient" : ""}`} style={homeCompact ? { backgroundImage: `url("${cover}")`, backgroundSize: "cover" } : undefined}>{!homeCompact && <Image src={cover} alt="" fill unoptimized sizes="220px" className="object-cover" />}</div>}
    {!limited && <Link href={workHref} aria-label={t("viewDetails", { title: release.title })} className={`${styles.cover} ${homeCompact ? "release-work-cover" : ""}`}>
      {cover ? <Image src={cover} alt="" fill unoptimized sizes="(max-width:640px) 56px, 72px" className="object-cover" />
        : <div aria-hidden className="flex h-full items-center justify-center px-2 text-center font-serif text-xs text-muted-foreground">{release.title}</div>}
    </Link>}
    <div className={`${styles.copy} ${homeCompact ? "release-work-info" : ""}`}><div className="release-work-info-inner">
      <p className={`release-work-type text-[11px] ${MEDIA_ACCENT[release.item_type].text}`}>{t(`types.${release.item_type}`)}</p>
      <Link href={workHref} className="hover:underline"><Heading className={styles.title}>{release.title}</Heading></Link>
      {(release.author || release.subtitle) && <p className="release-work-author mb-1 break-words text-xs text-muted-foreground">{release.author || release.subtitle}</p>}
      {release.publisher && <p className="release-work-publisher mb-1 text-xs text-muted-foreground">{release.publisher}</p>}
      {!compact && gaps.length > 0 && <div className="mb-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
        {gaps.map((gap) => <span key={gap}>{t(gap === "cover" ? "missingCover" : "missingSynopsis")}</span>)}
      </div>}
      {!compact && synopsis?.synopsis_language === "en" && <p className="mb-1 text-xs text-muted-foreground">{t("synopsisEnglish")}</p>}
      {showSynopsis && synopsis && <p className="my-3 whitespace-pre-line break-words text-sm leading-relaxed text-muted-foreground">{synopsis.synopsis}</p>}
    </div></div>
    <div className={`${styles.metadata} ${homeCompact ? "release-work-dates" : ""}`}><div className="release-work-dates-inner">
      <div className={styles.dateRows}>
        {exact.map((row) => <ReleaseDateRow pendingAction={row.id === pendingRelease?.id ? pendingAction : null} key={row.id} release={row} authenticated={authenticated} subscribed={Boolean(userState[row.id]?.subscribed)} stateAvailable={stateAvailable} returnPath={returnPath} compact={compact} />)}
        {announced.length > 0 && <>
          {exact.length > 0 && <p className="mt-1 text-xs font-medium text-muted-foreground">{t("otherAnnouncements")}</p>}
          {announced.map((row) => <ReleaseDateRow pendingAction={row.id === pendingRelease?.id ? pendingAction : null} key={row.id} release={row} authenticated={authenticated} subscribed={Boolean(userState[row.id]?.subscribed)} stateAvailable={stateAvailable} returnPath={returnPath} compact={compact} />)}
        </>}
      </div>
      {!compact && <div className={styles.footer}>
        <details className={styles.references} open={showSynopsis || undefined}>
          <summary><span aria-hidden>▸</span>{t("sourceDetails")}</summary>
          <ul className={styles.referenceList}>
            {releases.map((row) => {
              const reviewed = releaseReviewDate(row.checked_at); const sourceUrl = safeReleaseUrl(row.source_url);
              return <li key={row.id} className="flex flex-col gap-1">
                <span>{row.modality === "season" && row.season_number !== null ? t("season", { number: row.season_number }) : t(`modalities.${row.modality}`)} · {t(`markets.${row.market}`)}</span>
                {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="break-words underline underline-offset-2 hover:text-foreground">{t("source", { name: row.source_name })}</a>
                  : <span>{t("source", { name: row.source_name })}</span>}
                <span>{reviewed ? t("reviewed", { date: reviewed }) : t("notReviewed")}</span>
              </li>;
            })}
          </ul>
        </details>

      </div>}
    </div></div>
  </article>;
}

function ReleaseDateRow({ release, authenticated, subscribed, stateAvailable, returnPath, compact, pendingAction }: {
  release: CulturalRelease; authenticated: boolean; subscribed: boolean; stateAvailable: boolean; returnPath: string; compact: boolean; pendingAction?: ReactNode;
}) {
  const t = useTranslations("releases");
  const languageCode = release.language === "es-ES" ? "es" : release.language;
  const language = ["es", "en", "fr", "de", "it", "pt", "und"].includes(languageCode)
    ? t(`languages.${languageCode as "es" | "en" | "fr" | "de" | "it" | "pt" | "und"}`) : release.language;
  return <div data-release-id={release.id} className={styles.dateRow}>
    <div className={styles.dateInfo}>
      <span className="font-medium">{release.modality === "season" && release.season_number !== null
        ? t("season", { number: release.season_number }) : t(`modalities.${release.modality}`)}</span>
      {release.status === "cancelled" && <span className="font-medium text-status-dropped">{t("cancelled")}</span>}
      <time dateTime={release.date_value ?? undefined}>{release.date_precision === "unknown" ? t("unknownDate") : formatReleaseDate(release)}</time>
      <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px]">{t(`markets.${release.market}`)}</span>
    </div>
    {!compact && stateAvailable && <div className="flex flex-wrap items-start gap-1">{pendingAction}<ReleaseNoticeAction releaseId={release.id} authenticated={authenticated} subscribed={subscribed} cancelled={release.status === "cancelled"} returnPath={returnPath} dense /></div>}
    {release.market === "INT" && <p className={styles.dateExtra}>{t("internationalNotice")}</p>}
    {release.digital_platform && release.modality === "digital" && <p className={styles.dateExtra}>{release.digital_platform}</p>}
    {release.item_type === "book" && <p className={styles.dateExtra}>{t("language", { language })}</p>}
  </div>;
}