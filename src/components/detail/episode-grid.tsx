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

const EPISODES_PER_GROUP = 50;

function SeasonEpisodes({ episodes }: { episodes: EpisodeRow[] }) {
  const t = useTranslations("episode");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState(0);
  const [choice, setChoice] = useState("");
  const term = query.trim().toLocaleLowerCase();
  const matches = episodes.filter(ep => {
    if (!term) return true;
    if (/^e?\d+$/.test(term)) return ep.episode === Number(term.replace(/^e/, ""));
    return ep.title?.toLocaleLowerCase().includes(term);
  });
  const start = group * EPISODES_PER_GROUP;
  const visible = matches.slice(start, start + EPISODES_PER_GROUP);
  const selected = visible.find(ep => String(ep.episode) === choice);
  const field = "block min-h-11 w-full min-w-0 rounded-md border border-border bg-background px-3 text-sm";

  return (
    <div className="mt-3 space-y-3">
      {episodes.length > EPISODES_PER_GROUP && (
        <input type="search" value={query} aria-label={t("findEpisode")} placeholder={t("findEpisode")}
          className={field} onChange={event => {
            setQuery(event.target.value);
            setGroup(0);
            setChoice("");
          }} />
      )}
      {matches.length > EPISODES_PER_GROUP && (
        <label className="block text-sm">{t("episodeRange")}
          <select className={field} value={group} onChange={event => {
            setGroup(Number(event.target.value));
            setChoice("");
          }}>
            {Array.from({ length: Math.ceil(matches.length / EPISODES_PER_GROUP) }, (_, i) => {
              const first = matches[i * EPISODES_PER_GROUP];
              const last = matches[Math.min((i + 1) * EPISODES_PER_GROUP, matches.length) - 1];
              return <option key={i} value={i}>E{first.episode} – E{last.episode}</option>;
            })}
          </select>
        </label>
      )}
      {visible.length ? (
        <select aria-label={t("chooseEpisode")} className={field} value={choice}
          onChange={event => setChoice(event.target.value)}>
          <option value="">{t("chooseEpisode")}</option>
          {visible.map(ep => <option key={ep.episode} value={ep.episode}>
            {t("episodeShort", { n: ep.episode })} · {ep.title ?? t("untitled")}
          </option>)}
        </select>
      ) : <p role="status" className="text-sm text-muted-foreground">{t("noMatchingEpisodes")}</p>}
      {selected && <article className="border-t border-border pt-4"><CommunityDetail episode={selected} /></article>}
    </div>
  );
}

function EpisodeGuide({ seasons }: { seasons: SeasonGroup[] }) {
  const t = useTranslations("episode");
  const [choice, setChoice] = useState("");
  const selected = seasons.find(group => String(group.season) === choice);
  return (
    <div className="max-w-prose">
      <select aria-label={t("chooseSeason")} value={choice} onChange={event => setChoice(event.target.value)}
        className="min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm">
        <option value="">{t("chooseSeason")}</option>
        {seasons.map(({ season }) => <option key={season} value={season}>{t("season", { n: season })}</option>)}
      </select>
      {selected && <SeasonEpisodes key={selected.season} episodes={selected.episodes} />}
    </div>
  );
}

export function EpisodeGrid({ seasons }: { seasons: SeasonGroup[] }) {
  const t = useTranslations("episode");
  const tLegend = useTranslations("detail.grid.legend");
  const [selected, setSelected] = useState<EpisodeRow | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const sheet = useRef<HTMLDialogElement>(null);
  const side = useRef<HTMLElement>(null);
  const maxEpisodes = seasons.reduce((max, group) => group.episodes.reduce((n, ep) => Math.max(n, ep.episode), max), 0);
  const columns = Array.from({ length: maxEpisodes }, (_, i) => i + 1);

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
    <section className="@container/episodes min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-xl font-semibold">{t("communityEpisodes")}</h2>
        <button type="button" aria-pressed={showInfo} onClick={() => setShowInfo(!showInfo)}
          className="min-h-11 rounded-md px-2 text-sm font-semibold underline underline-offset-4 aria-pressed:bg-surface-muted">
          {t("episodeInfo")}
        </button>
      </div>
      {showInfo ? (
        <EpisodeGuide seasons={seasons} />
      ) : (
        <>
        <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          {RATING_TIERS.map((tier) => <span key={tier.key} className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm" style={{ backgroundColor: tier.color }} />{tLegend(tier.key)}</span>)}
          <span>— {t("noScore")}</span>
          <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm border border-dashed border-border" />{t("upcoming")}</span>
        </div>
        <div className="space-y-5 @min-[760px]/episodes:hidden">
          {seasons.map(({ season, episodes }) => {
            const avg = seasonAverage(episodes);
            return <section key={season} aria-label={t("season", { n: season })} className="scroll-mt-28">
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
                return <tr key={season} className="scroll-mt-28">
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
        </>
      )}
    </section>
  );
}
