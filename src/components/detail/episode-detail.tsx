"use client";

import { useTranslations } from "next-intl";
import type { EpisodeRow, OwnWatch } from "@/lib/series/get-episode-data";
import { formatDots } from "@/lib/rating/dots";
import type { GridSource } from "./episode-grid";

const dateFmt = new Intl.DateTimeFormat("es", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : dateFmt.format(d);
}

type DetailProps = {
  episode: EpisodeRow;
  own: OwnWatch;
  source: GridSource;
  interactive: boolean;
  isPending: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  /** Cuántos marcaría «Vistos hasta aquí» (incluido este); 0 lo oculta. */
  markUpToCount: number;
  onMarkUpTo: () => void;
};

// La línea `.em` de los frames: duración · emitido · nota, en mono y apagada.
// Con fuente comunidad la nota es la media con sus votos; con "mis notas", la
// propia — en texto plano /5, nada de ★ (dots en todo).
function MetaLine({
  episode,
  own,
  source,
  className = "",
}: {
  episode: EpisodeRow;
  own: OwnWatch;
  source: GridSource;
  className?: string;
}) {
  const t = useTranslations("episode");
  const aired = formatDate(episode.airDate);

  const parts: string[] = [];
  if (episode.runtimeMinutes) parts.push(t("runtime", { n: episode.runtimeMinutes }));
  if (aired)
    parts.push(
      episode.aired ? t("airedOn", { date: aired }) : t("upcomingOn", { date: aired }),
    );
  else if (!episode.aired) parts.push(t("upcoming"));
  if (source === "mine" && own.rating !== null)
    parts.push(t("yourRatingMeta", { value: formatDots(own.rating) ?? "" }));
  if (source === "community" && episode.avgRating !== null)
    parts.push(
      `${formatDots(episode.avgRating)}/5 · ${t("communityCount", { count: episode.ratingCount })}`,
    );

  if (parts.length === 0) return null;
  return (
    <p className={`font-mono text-[10.5px] text-muted-foreground ${className}`}>
      {parts.join(" · ")}
    </p>
  );
}

// La reseña se guarda sola al salir del cuadro (fase 3, H6): antes había un
// «Guardar» aparte y, a la vez, puntuar guardaba de rebote el borrador — dos
// reglas para el mismo bloque. Ahora solo hay una: lo escrito se guarda al
// soltar el foco, si cambió.
function ReviewBox({
  draft,
  saved,
  onDraftChange,
  onSave,
}: {
  draft: string;
  saved: string;
  onDraftChange: (value: string) => void;
  onSave: () => void;
}) {
  const t = useTranslations("episode");
  return (
    <div className="flex flex-col gap-1">
      <textarea
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        onBlur={() => {
          if (draft.trim() !== saved.trim()) onSave();
        }}
        placeholder={t("reviewPlaceholder")}
        className="h-14 w-full resize-none rounded-[9px] border border-border bg-surface-muted px-[11px] py-[9px] text-xs text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none lg:h-[70px] lg:px-[13px] lg:py-[11px] lg:text-[13px]"
      />
      <p className="font-mono text-[9.5px] text-muted-foreground">{t("reviewAutosave")}</p>
    </div>
  );
}

// El detalle del episodio (`.epi-detail`), desplegado bajo su fila: metadatos,
// sinopsis y tu reseña, sangrados hasta la columna del título.
export function EpisodeInlineDetail({
  episode,
  own,
  source,
  interactive,
  isPending,
  draft,
  onDraftChange,
  onSave,
  markUpToCount,
  onMarkUpTo,
}: DetailProps) {
  const t = useTranslations("episode");
  return (
    <div className="flex flex-col">
      <MetaLine episode={episode} own={own} source={source} className="mt-3" />
      {episode.synopsis && (
        <p className="my-3 text-xs leading-[1.55] text-foreground-soft">
          {episode.synopsis}
        </p>
      )}
      {interactive && (
        <ReviewBox
          draft={draft}
          saved={own.review ?? ""}
          onDraftChange={onDraftChange}
          onSave={onSave}
        />
      )}
      {/* Solo si marca algo más que este mismo episodio: para eso ya está la
          casilla de la fila. */}
      {interactive && markUpToCount > (own.watched ? 0 : 1) && (
        <button
          type="button"
          onClick={onMarkUpTo}
          disabled={isPending}
          className="mt-2 self-start rounded-full border border-border px-3 py-1 text-[11px] text-foreground hover:bg-surface-muted disabled:opacity-60"
        >
          {t("markUpTo", { count: markUpToCount })}
        </button>
      )}
    </div>
  );
}
