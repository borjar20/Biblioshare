"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { EpisodeRow } from "@/lib/series/get-episode-data";
import { averageRating, ratingColor, RATING_TIERS } from "@/lib/series/rating-scale";

export type SeasonGroup = { season: number; episodes: EpisodeRow[] };
export type GridSource = "mine" | "community";

function seasonAverage(episodes: EpisodeRow[]) {
  return averageRating(episodes.map((ep) => ep.avgRating).filter((value) => value !== null));
}

function CommunityDetail({ episode }: { episode: EpisodeRow }) {
  const t = useTranslations("episode");
  return (
    <>
      <p className="font-mono text-xs text-muted-foreground">{t("codeLong", { s: episode.season, e: episode.episode })}</p>
      <h3 className="mt-1 font-serif text-xl font-semibold">{episode.title ?? t("untitled")}</h3>
      <p className="mt-2 text-sm">
        {episode.avgRating !== null && <strong>{episode.avgRating.toFixed(1)}/10 · </strong>}
        {t("communityCount", { count: episode.ratingCount })}
        {!episode.aired && ` · ${t("upcoming")}`}
      </p>
      {episode.synopsis && <p className="mt-3 text-sm leading-relaxed">{episode.synopsis}</p>}
    </>
  );
}

export function EpisodeGrid({ seasons }: { seasons: SeasonGroup[] }) {
  const t = useTranslations("episode");
  const tLegend = useTranslations("detail.grid.legend");
  const [selected, setSelected] = useState<EpisodeRow | null>(null);
  const root = useRef<HTMLElement>(null);
  const index = useRef<HTMLDialogElement>(null);
  const sheet = useRef<HTMLDialogElement>(null);
  const side = useRef<HTMLElement>(null);
  const maxEpisodes = seasons.reduce((max, group) => group.episodes.reduce((n, ep) => Math.max(n, ep.episode), max), 0);
  const columns = Array.from({ length: maxEpisodes }, (_, i) => i + 1);
  const seasonAnchor = (season: number, desktop: boolean) => `episodes-${desktop ? "table" : "season"}-${season}`;

  function cell(ep: EpisodeRow, desktop: boolean) {
    const color = ratingColor(ep.avgRating);
    const active = ep.season === selected?.season && ep.episode === selected.episode;
    const code = t("code", { s: ep.season, e: ep.episode });
    return (
      <button key={ep.episode} type="button"
        aria-label={[code, ep.title, ep.avgRating?.toFixed(1), t("communityCount", { count: ep.ratingCount }), !ep.aired && t("upcoming")].filter(Boolean).join(" · ")}
        aria-pressed={active} aria-haspopup={desktop ? undefined : "dialog"}
        onClick={() => {
          setSelected(ep);
          if (desktop) side.current?.focus({ preventScroll: true });
          else sheet.current?.showModal();
        }}
        style={color ? { backgroundColor: color, color: "var(--tier-foreground)" } : undefined}
        className={`flex w-full min-w-0 flex-col justify-between rounded-md border px-1.5 py-1 leading-none tabular-nums ${desktop ? "min-h-9 items-center justify-center" : "min-h-11"} ${color ? "border-transparent" : ep.aired ? "border-border bg-surface-muted" : "border-dashed border-border"} ${active ? "outline-2 outline-offset-1 outline-type-series" : ""}`}>
        {!desktop && <span className="self-start font-mono text-[10px]">{t("episodeShort", { n: ep.episode })}</span>}
        <span className={desktop ? "font-mono text-xs" : "self-end text-lg leading-none font-semibold"}>{ep.avgRating?.toFixed(1) ?? "—"}</span>
      </button>
    );
  }

  return (
    <section ref={root} className="@container/episodes min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-xl font-semibold">{t("communityEpisodes")}</h2>
        {seasons.length >= 4 && <button type="button" className="min-h-11 text-sm font-semibold underline underline-offset-4" onClick={() => index.current?.showModal()}>{t("jumpSeason")}</button>}
      </div>
      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {RATING_TIERS.map((tier) => <span key={tier.key} className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm" style={{ backgroundColor: tier.color }} />{tLegend(tier.key)}</span>)}
        <span>— {t("noScore")}</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm border border-dashed border-border" />{t("upcoming")}</span>
      </div>
      <div className="space-y-5 @min-[760px]/episodes:hidden">
        {seasons.map(({ season, episodes }) => {
          const avg = seasonAverage(episodes);
          return <section key={season} id={seasonAnchor(season, false)} tabIndex={-1} aria-label={t("season", { n: season })} className="scroll-mt-28">
            <h3 className="mb-1.5 text-sm font-semibold">{t("season", { n: season })} {avg !== null && <span className="text-xs font-normal text-muted-foreground">{t("avgShort", { value: avg.toFixed(1) })}</span>}</h3>
            <div className="grid grid-cols-4 gap-1 @min-[300px]/episodes:grid-cols-5">{episodes.map((ep) => cell(ep, false))}</div>
          </section>;
        })}
      </div>
      <div className="hidden items-start gap-4 @min-[760px]/episodes:grid @min-[760px]/episodes:grid-cols-[minmax(0,1fr)_minmax(210px,30%)]">
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-1">
            <thead><tr><td />{columns.map((n) => <th key={n} scope="col" className="font-mono text-[10px]">{t("episodeShort", { n })}</th>)}</tr></thead>
            <tbody>{seasons.map(({ season, episodes }) => {
              const avg = seasonAverage(episodes);
              const byEpisode = new Map(episodes.map((ep) => [ep.episode, ep]));
              return <tr key={season} id={seasonAnchor(season, true)} tabIndex={-1} className="scroll-mt-28">
                <th scope="row" className="sticky left-0 bg-background pr-2 text-left text-xs">{t("seasonShort", { n: season })}{avg !== null && <span className="block whitespace-nowrap text-[10px] font-normal">{t("avgShort", { value: avg.toFixed(1) })}</span>}</th>
                {columns.map((n) => {
                  const ep = byEpisode.get(n);
                  return <td key={n} className="min-w-10">{ep && cell(ep, true)}</td>;
                })}
              </tr>;
            })}</tbody>
          </table>
        </div>
        <aside ref={side} role="region" tabIndex={-1} aria-label={t("detailRegion")} className="sticky top-28 border-l border-border pl-4">
          {selected ? <CommunityDetail episode={selected} /> : <p className="text-sm text-muted-foreground">{t("hoverHint")}</p>}
        </aside>
      </div>
      <dialog ref={sheet} aria-label={t("detailRegion")} className="fixed inset-0 m-auto max-h-[85dvh] w-[min(90vw,28rem)] overflow-auto rounded-xl bg-surface p-5 text-foreground backdrop:bg-black/50">
        {selected && <CommunityDetail episode={selected} />}
        <button type="button" className="mt-4 min-h-11 font-semibold underline" onClick={() => sheet.current?.close()}>{t("closeDetail")}</button>
      </dialog>
      <dialog ref={index} aria-label={t("jumpSeason")} className="fixed inset-0 m-auto max-h-[80dvh] w-[min(90vw,25rem)] overflow-auto rounded-xl bg-surface p-4 text-foreground backdrop:bg-black/50">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">{t("jumpSeason")}</h3>
          <button type="button" className="min-h-11 px-2 text-sm underline" onClick={() => index.current?.close()}>{t("closeDetail")}</button>
        </div>
        <nav className="grid grid-cols-2 gap-2">{seasons.map(({season}) => {
          const href = seasonAnchor(season, false);
          return <a key={season} href={`#${href}`} className="rounded-md border border-border p-2.5 text-sm" onClick={(event) => {
            event.preventDefault();
            index.current?.close();
            const desktop = (root.current?.clientWidth ?? 0) >= 760;
            const target = document.getElementById(seasonAnchor(season, desktop));
            target?.focus({ preventScroll: true });
            target?.scrollIntoView({block: "start"});
          }}>{t("season", { n: season })}</a>;
        })}</nav>
      </dialog>
    </section>
  );
}
