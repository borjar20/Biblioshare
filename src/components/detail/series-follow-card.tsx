"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { RatingDots } from "@/components/ui/rating-dots";
import { formatDots } from "@/lib/rating/dots";
import { ratePass } from "@/lib/passes/actions";
import { updateStatus } from "@/lib/library/manage-actions";
import { useItemStatus } from "./item-status-context";

const dateFmt = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" });

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : dateFmt.format(d);
}

// La tarjeta de estado de seguimiento de la pestaña Episodios (fase 2 del
// rediseño de series, spec 2026-09-23 §4.1). Dos caras, nunca a la vez:
//
//   - «Estás al día»: viendo, todo lo emitido visto y la serie sigue en
//     emisión. En vez de la hoja de cierre (la serie no ha terminado), se pide
//     aquí la nota de la serie «hasta ahora», con la media de tus episodios
//     como sugerencia — editable después, como cualquier nota de pase.
//   - «Hay episodios nuevos»: la diste por vista y TMDB ha publicado más.
//     «Seguir» reabre el MISMO pase (`resume: "continue"`), no empieza un
//     revisionado: el cursor sigue donde estaba.
export function SeriesFollowCard({
  seriesId,
  passId,
  passRating,
  mode,
  nextAirDate,
  continueSeason,
  episodesAverage,
}: {
  seriesId: string;
  passId: string;
  passRating: number | null;
  mode: "upToDate" | "newEpisodes";
  /** Fecha del siguiente episodio anunciado (YYYY-MM-DD), si TMDB la sabe. */
  nextAirDate: string | null;
  /** Temporada del primer episodio nuevo (cara «newEpisodes»). */
  continueSeason: number | null;
  /** Media (1–10) de TUS notas de episodio en este pase; null sin ninguna. */
  episodesAverage: number | null;
}) {
  const t = useTranslations("episode");
  const { setStatus, setSaving } = useItemStatus();
  const [isPending, startTransition] = useTransition();
  const [rating, setRating] = useState(passRating);
  const [prevPassRating, setPrevPassRating] = useState(passRating);
  if (passRating !== prevPassRating) {
    setPrevPassRating(passRating);
    setRating(passRating);
  }

  const rate = (next: number) => {
    setRating(next);
    startTransition(() => ratePass(passId, "series", seriesId, next));
  };

  if (mode === "newEpisodes") {
    const resume = () => {
      // Optimista en la píldora del hero, como StatusSegments: el badge cambia
      // en el mismo commit y `isSaving` lo expone mientras vuela (#106).
      setStatus("in_progress");
      setSaving(true);
      startTransition(async () => {
        try {
          await updateStatus("series", seriesId, "in_progress", "continue");
        } finally {
          setSaving(false);
        }
      });
    };
    return (
      <section className="mb-5 flex flex-wrap items-center gap-3 rounded-[14px] border border-type-series/40 bg-type-series/7 px-[18px] py-[15px]">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground">{t("newEpisodesTitle")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("continueHint")}</p>
        </div>
        <button
          type="button"
          onClick={resume}
          disabled={isPending}
          className="rounded-[9px] bg-accent px-4 py-[11px] text-[13px] font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
        >
          {continueSeason !== null
            ? t("continueSeason", { n: continueSeason })
            : t("continueWatching")}
        </button>
      </section>
    );
  }

  const airOn = formatDate(nextAirDate);
  const suggestion = episodesAverage !== null ? Math.round(episodesAverage) : null;

  return (
    <section className="mb-5 flex flex-col gap-3 rounded-[14px] border border-border bg-surface px-[18px] py-[15px]">
      <div className="flex items-center gap-2">
        <i aria-hidden className="h-2 w-2 rounded-full bg-status-in-progress" />
        <p className="text-[13px] font-semibold text-foreground">{t("upToDateTitle")}</p>
        <p className="ml-auto font-mono text-[10.5px] text-muted-foreground">
          {airOn ? t("nextAirOn", { date: airOn }) : t("waitingSeason")}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="label-section">{t("rateSoFar")}</span>
        <RatingDots
          value={rating}
          onChange={rate}
          disabled={isPending}
          size="sm"
          itemType="series"
        />
        {rating === null && suggestion !== null && (
          <button
            type="button"
            onClick={() => rate(suggestion)}
            disabled={isPending}
            className="rounded-full border border-border px-3 py-1 text-[11px] text-foreground hover:bg-surface-muted disabled:opacity-60"
          >
            {t("useEpisodesAverage", { value: formatDots(suggestion) ?? "" })}
          </button>
        )}
      </div>
    </section>
  );
}
