"use client";

import { useTranslations } from "next-intl";
import { formatDots } from "@/lib/rating/dots";

// Resumen de una temporada, calculado por el panel sobre la capa optimista
// (ver episode-panel.tsx): el índice no lee episodios, solo cifras.
export type SeasonStat = {
  season: number;
  total: number;
  watched: number;
  avg: number | null;
};

export function seasonPercent(s: SeasonStat): number {
  return s.total === 0 ? 0 : Math.round((s.watched / s.total) * 100);
}

// `.ring` del handoff: aro de progreso en conic-gradient con el hueco central
// recortado por una capa a --surface. El color es el acento de serie en crudo
// (`--type-series`, no `--color-type-series`): @theme inline no emite las
// variables del tema, así que en un gradiente la otra forma no resuelve —
// misma trampa documentada en media-accent.ts.
export function ProgressRing({
  percent,
  label,
  size,
}: {
  percent: number;
  label: string;
  size: "sm" | "lg";
}) {
  return (
    <div
      aria-hidden
      className={`relative shrink-0 rounded-full ${
        size === "lg" ? "h-10 w-10" : "h-7 w-7"
      }`}
      style={{
        background: `conic-gradient(var(--type-series) ${percent}%, var(--surface-muted) 0)`,
      }}
    >
      <div className="absolute inset-[3px] rounded-full bg-surface" />
      <span
        className={`relative grid h-full w-full place-items-center font-mono font-semibold text-type-series ${
          size === "lg" ? "text-[10px]" : "text-[8px]"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

// Etiqueta del aro: ✓ completa, "4/12" a medias, "0" sin empezar.
function ringLabel(s: SeasonStat): string {
  if (s.total > 0 && s.watched === s.total) return "✓";
  if (s.watched === 0) return "0";
  return `${s.watched}/${s.total}`;
}

// Línea `.sm`: "12 ep · 4,0 · activa". La media va con el dot oro (el glifo de
// nota de Paper; la maqueta dibuja ★ pero la app derogó las estrellas en todas
// partes) y el sufijo de estado solo aparece cuando dice algo.
function SeasonMeta({
  stat,
  active,
  isLoggedIn,
  className = "",
}: {
  stat: SeasonStat;
  active: boolean;
  isLoggedIn: boolean;
  className?: string;
}) {
  const t = useTranslations("episode");
  const status = active
    ? t("seasonActive")
    : isLoggedIn && stat.watched === 0
      ? t("seasonUnseen")
      : null;

  return (
    <span
      className={`flex items-center gap-1 font-mono text-[9px] text-muted-foreground ${className}`}
    >
      <span>{t("episodeCountShort", { count: stat.total })}</span>
      {stat.avg !== null && (
        <>
          <span aria-hidden>·</span>
          <i aria-hidden className="h-[4px] w-[4px] rounded-full bg-gold" />
          <span>{formatDots(stat.avg)}</span>
        </>
      )}
      {status && (
        <>
          <span aria-hidden>·</span>
          <span>{status}</span>
        </>
      )}
    </span>
  );
}

// Nivel 1 del móvil (frame E3): las temporadas en rejilla de 2 columnas. Es la
// respuesta a la escala — con 12 temporadas la ficha ya no crece, cabe en 6
// filas, y tocar una baldosa entra al nivel 2 (frame E2).
export function SeasonIndex({
  stats,
  activeSeason,
  isLoggedIn,
  onSelect,
  className = "",
}: {
  stats: SeasonStat[];
  activeSeason: number;
  isLoggedIn: boolean;
  onSelect: (season: number) => void;
  className?: string;
}) {
  const t = useTranslations("episode");

  return (
    <div className={`grid grid-cols-2 gap-2.5 ${className}`}>
      {stats.map((s) => {
        const active = s.season === activeSeason;
        const percent = seasonPercent(s);
        return (
          <button
            key={s.season}
            type="button"
            onClick={() => onSelect(s.season)}
            aria-label={t("openSeason", { n: s.season })}
            className={`rounded-[12px] border p-3 text-left transition-colors ${
              active
                ? "border-type-series/40 bg-type-series/5"
                : "border-border bg-surface"
            } ${isLoggedIn && s.watched === 0 && !active ? "opacity-70" : ""}`}
          >
            <span className="flex items-center gap-2.5">
              {isLoggedIn && (
                <ProgressRing percent={percent} label={ringLabel(s)} size="lg" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block font-serif text-[16px] leading-none font-semibold text-foreground">
                  {t("seasonTile", { n: s.season })}
                </span>
                <SeasonMeta
                  stat={s}
                  active={active}
                  isLoggedIn={isLoggedIn}
                  className="mt-[5px]"
                />
              </span>
            </span>
            {isLoggedIn && (
              <span className="mt-[11px] block h-[5px] overflow-hidden rounded-full bg-surface-muted">
                <span
                  className="block h-full rounded-full bg-type-series"
                  style={{ width: `${percent}%` }}
                />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Columna izquierda de PC (frame PC·1): las mismas temporadas como raíl
// vertical. En escritorio no hay dos niveles — el índice y la lista conviven,
// así que esto es un selector, no una navegación.
export function SeasonRail({
  stats,
  activeSeason,
  isLoggedIn,
  onSelect,
  className = "",
}: {
  stats: SeasonStat[];
  activeSeason: number;
  isLoggedIn: boolean;
  onSelect: (season: number) => void;
  className?: string;
}) {
  const t = useTranslations("episode");

  return (
    <div className={`max-h-[560px] overflow-y-auto p-2 ${className}`}>
      {stats.map((s) => {
        const active = s.season === activeSeason;
        const done = s.total > 0 && s.watched === s.total;
        return (
          <button
            key={s.season}
            type="button"
            onClick={() => onSelect(s.season)}
            aria-current={active ? "true" : undefined}
            className={`flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-[9px] text-[13px] font-semibold transition-colors ${
              active
                ? "bg-type-series/8 text-type-series"
                : done && isLoggedIn
                  ? "text-green hover:bg-surface-muted"
                  : "text-muted-foreground hover:bg-surface-muted"
            }`}
          >
            {isLoggedIn && (
              <ProgressRing
                percent={seasonPercent(s)}
                label={ringLabel(s)}
                size="sm"
              />
            )}
            <span className="min-w-0 flex-1 truncate text-left">
              {t("season", { n: s.season })}
            </span>
            <span className="shrink-0 font-mono text-[9.5px] font-normal text-muted-foreground">
              {s.total}
            </span>
          </button>
        );
      })}
    </div>
  );
}
