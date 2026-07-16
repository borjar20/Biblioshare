"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { EpisodeRow } from "@/lib/series/get-episode-data";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import {
  RATING_TIERS,
  ratingColor,
  averageRating,
} from "@/lib/series/rating-scale";

export type SeasonGroup = { season: number; episodes: EpisodeRow[] };
export type GridSource = "mine" | "community";

// Cuántas temporadas caben en la ventana del móvil (frame C3). Con más, la
// rejilla se pagina en horizontal en vez de encoger las celdas.
const WINDOW = 6;

// Valor y metadatos de una celda según la fuente seleccionada.
function cellData(ep: EpisodeRow, source: GridSource) {
  if (source === "mine") {
    return {
      rating: ep.own.rating,
      present: ep.own.watched,
      hasNote: Boolean(ep.own.review),
    };
  }
  return { rating: ep.avgRating, present: ep.ratingCount > 0, hasNote: false };
}

// Rejilla temporada × episodio (§7.36). Dos dibujos, uno por breakpoint, y por
// una razón: el eje largo cambia de sitio. En móvil (frame C3) la rejilla va
// TRANSPUESTA —temporadas en columnas, episodios en filas— para que lo que
// crece sin límite (los episodios) crezca hacia abajo, que es por donde el
// móvil tiene sitio; y solo se enseña una ventana de 6 temporadas, paginada.
// En PC se queda la tabla de siempre (temporadas en filas): el ancho da para
// las 12 sin encoger nada.
export function EpisodeGrid({
  seasons,
  source,
  selectedKey,
  onSelect,
}: {
  seasons: SeasonGroup[];
  source: GridSource;
  selectedKey: string | null;
  onSelect: (ep: EpisodeRow) => void;
}) {
  const t = useTranslations("episode");
  const tLegend = useTranslations("detail.grid.legend");
  const [hover, setHover] = useState<EpisodeRow | null>(null);

  const maxEpisodes = seasons.reduce(
    (max, s) => Math.max(max, ...s.episodes.map((e) => e.episode)),
    0,
  );
  const columns = Array.from({ length: maxEpisodes }, (_, i) => i + 1);

  // La ventana arranca donde está el cursor: la primera temporada con algo sin
  // ver (o la última, si están todas vistas), no siempre en la T1.
  const cursorIndex = useMemo(() => {
    const i = seasons.findIndex((s) => s.episodes.some((e) => !e.own.watched));
    return i === -1 ? seasons.length - 1 : i;
  }, [seasons]);
  const maxStart = Math.max(0, seasons.length - WINDOW);
  const [start, setStart] = useState(() =>
    Math.min(Math.max(0, cursorIndex - WINDOW + 1), Math.max(0, seasons.length - WINDOW)),
  );
  const windowSeasons = seasons.slice(start, start + WINDOW);
  const paged = seasons.length > WINDOW;
  // Las filas se cuentan DENTRO de la ventana: si ninguna de las 6 temporadas
  // visibles llega a 13 episodios, no se pintan filas vacías por una T11 que
  // ni se ve.
  const windowRows = Array.from(
    {
      length: windowSeasons.reduce(
        (max, s) => Math.max(max, ...s.episodes.map((e) => e.episode)),
        0,
      ),
    },
    (_, i) => i + 1,
  );

  const detail = hover ?? null;

  return (
    <div className="flex flex-col gap-4">
      {/* `.ctwin` de C3: paginador de la ventana de temporadas. */}
      {paged && (
        <div className="order-1 flex items-center gap-2.5 lg:hidden">
          <button
            type="button"
            onClick={() => setStart((s) => Math.max(0, s - WINDOW))}
            disabled={start === 0}
            aria-label={t("prevSeasons")}
            className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] border border-border bg-surface text-muted-foreground disabled:opacity-40"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <p className="flex-1 text-center">
            <span className="block font-serif text-[15px] leading-[1.1] font-semibold text-foreground">
              {t("seasonWindow", {
                from: windowSeasons[0]?.season ?? 0,
                to: windowSeasons[windowSeasons.length - 1]?.season ?? 0,
              })}
            </span>
            <span className="mt-[3px] block font-mono text-[8.5px] tracking-[0.05em] text-muted-foreground uppercase">
              {t("seasonWindowHint", { size: WINDOW, total: seasons.length })}
            </span>
          </p>
          <button
            type="button"
            onClick={() => setStart((s) => Math.min(maxStart, s + WINDOW))}
            disabled={start >= maxStart}
            aria-label={t("nextSeasons")}
            className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] border border-border bg-surface text-muted-foreground disabled:opacity-40"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Leyenda. En C3 va ANTES de la rejilla (los colores son el contenido, no
          una nota al pie); en la tabla de PC se queda debajo, como estaba. */}
      <div className="order-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 lg:order-4">
        {RATING_TIERS.map((tier) => (
          <span key={tier.key} className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: tier.color }}
            />
            <span className="font-mono text-[10px] text-muted-foreground">
              {tLegend(tier.key)}
            </span>
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-border bg-surface-muted" />
          <span className="font-mono text-[10px] text-muted-foreground">
            {t("legendUnseen")}
          </span>
        </span>
        {source === "mine" && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-foreground/70" />
            <span className="font-mono text-[10px] text-muted-foreground">
              {t("hasNote")}
            </span>
          </span>
        )}
      </div>

      {/* C3 — móvil: temporadas en columnas, episodios en filas. */}
      <div
        className="order-3 grid gap-[5px] lg:hidden"
        style={{
          gridTemplateColumns: `26px repeat(${windowSeasons.length}, minmax(0,1fr))`,
        }}
      >
        <div />
        {windowSeasons.map((s) => {
          const watched = s.episodes.filter((e) => e.own.watched).length;
          const done = watched === s.episodes.length;
          return (
            <div
              key={s.season}
              className="flex flex-col items-center gap-0.5 pb-[3px]"
            >
              <span
                className={`font-mono text-[10px] font-semibold ${
                  s.season === seasons[cursorIndex]?.season
                    ? "text-type-series"
                    : "text-foreground"
                }`}
              >
                {t("seasonTile", { n: s.season })}
              </span>
              <span className="font-mono text-[8px] text-muted-foreground">
                {done ? "✓" : `${watched}/${s.episodes.length}`}
              </span>
            </div>
          );
        })}

        {windowRows.map((epNum) => (
          <FragmentRow
            key={epNum}
            epNum={epNum}
            windowSeasons={windowSeasons}
            source={source}
            selectedKey={selectedKey}
            onPick={(ep) => {
              setHover(ep);
              onSelect(ep);
            }}
            label={t("episodeShort", { n: epNum })}
          />
        ))}
      </div>

      {/* PC — la tabla de siempre: temporadas en filas, episodios en columnas. */}
      <div className="order-3 hidden overflow-x-auto lg:block">
        <table className="border-separate border-spacing-1">
          <tbody>
            {seasons.map((s) => {
              const ratings = s.episodes
                .map((e) => cellData(e, source).rating)
                .filter((r): r is number => r !== null);
              const avg = averageRating(ratings);
              const byEpisode = new Map(s.episodes.map((e) => [e.episode, e]));
              return (
                <tr key={s.season}>
                  <th className="pr-2 text-left align-middle">
                    <span className="block font-mono text-xs font-semibold text-foreground">
                      {t("seasonShort", { n: s.season })}
                    </span>
                    {avg !== null && (
                      <span className="block font-mono text-[10px] text-muted-foreground">
                        {t("avgShort", { value: avg.toFixed(1) })}
                      </span>
                    )}
                  </th>
                  {columns.map((epNum) => {
                    const ep = byEpisode.get(epNum);
                    if (!ep)
                      return <td key={epNum} className="min-w-[2.5rem]" />;
                    const { rating, present, hasNote } = cellData(ep, source);
                    const color = ratingColor(rating);
                    return (
                      <td key={epNum} className="min-w-[2.5rem]">
                        <button
                          type="button"
                          onMouseEnter={() => setHover(ep)}
                          onFocus={() => setHover(ep)}
                          onClick={() => {
                            setHover(ep);
                            onSelect(ep);
                          }}
                          style={
                            color
                              ? {
                                  backgroundColor: color,
                                  color: "var(--tier-foreground)",
                                }
                              : undefined
                          }
                          className={`relative flex h-9 w-full items-center justify-center rounded-md font-mono text-xs font-semibold transition-transform hover:scale-105 ${
                            color
                              ? ""
                              : present
                                ? "bg-surface-muted text-muted-foreground"
                                : "bg-surface-muted/40 text-muted-foreground/50"
                          }`}
                          title={`${t("code", { s: ep.season, e: ep.episode })}${ep.title ? ` · ${ep.title}` : ""}`}
                        >
                          {rating !== null ? rating.toFixed(1) : epNum}
                          {hasNote && (
                            // bg-current: hereda el color de texto de la celda,
                            // que ya contrasta con su fondo tenga tramo o no.
                            <span className="absolute bottom-1 h-1 w-1 rounded-full bg-current opacity-80" />
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Panel de detalle (hover en PC, toque en móvil) */}
      <div className="order-5 min-h-[3.75rem] rounded-card border border-border bg-surface px-4 py-3 shadow-card">
        {detail ? (
          <HoverDetail episode={detail} source={source} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("hoverHint")}</p>
        )}
      </div>
    </div>
  );
}

// Una fila de C3: el rótulo `.cteph` del episodio y su celda en cada temporada
// de la ventana. Sin envoltorio propio — las celdas son hijas directas de la
// rejilla, así que van sueltas en un fragmento.
function FragmentRow({
  epNum,
  windowSeasons,
  source,
  selectedKey,
  onPick,
  label,
}: {
  epNum: number;
  windowSeasons: SeasonGroup[];
  source: GridSource;
  selectedKey: string | null;
  onPick: (ep: EpisodeRow) => void;
  label: string;
}) {
  const t = useTranslations("episode");
  return (
    <>
      <span className="text-right font-mono text-[8.5px] text-muted-foreground">
        {label}
      </span>
      {windowSeasons.map((s) => {
        const ep = s.episodes.find((e) => e.episode === epNum);
        if (!ep) return <span key={s.season} aria-hidden />;
        const { rating, present, hasNote } = cellData(ep, source);
        const color = ratingColor(rating);
        const selected = selectedKey === `${ep.season}:${ep.episode}`;
        return (
          <button
            key={s.season}
            type="button"
            onClick={() => onPick(ep)}
            style={color ? { backgroundColor: color } : undefined}
            title={`${t("code", { s: ep.season, e: ep.episode })}${ep.title ? ` · ${ep.title}` : ""}`}
            className={`relative aspect-square rounded-[6px] border ${
              color
                ? "border-transparent"
                : present
                  ? "border-border bg-surface-muted"
                  : "border-border bg-surface-muted/40"
            } ${selected ? "z-10 outline-2 outline-offset-1 outline-type-series" : ""}`}
          >
            {hasNote && (
              <span
                className="absolute top-[3px] right-[3px] h-1 w-1 rounded-full"
                style={{
                  backgroundColor: color
                    ? "var(--tier-foreground)"
                    : "var(--muted-foreground)",
                }}
              />
            )}
          </button>
        );
      })}
    </>
  );
}

function HoverDetail({
  episode,
  source,
}: {
  episode: EpisodeRow;
  source: GridSource;
}) {
  const t = useTranslations("episode");
  const rating = source === "mine" ? episode.own.rating : episode.avgRating;

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-xs text-muted-foreground">
          {t("code", { s: episode.season, e: episode.episode })}
        </span>
        <span className="text-sm font-medium text-foreground">
          {episode.title ?? t("untitled")}
        </span>
        {rating !== null && (
          <span className="ml-auto font-mono text-sm font-semibold text-foreground">
            {rating.toFixed(1)}
            {source === "community" && (
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                {t("communityCount", { count: episode.ratingCount })}
              </span>
            )}
          </span>
        )}
      </div>
      {source === "mine" && episode.own.review ? (
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {episode.own.review}
        </p>
      ) : episode.synopsis ? (
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {episode.synopsis}
        </p>
      ) : null}
    </div>
  );
}
