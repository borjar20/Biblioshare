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
  if (aired) parts.push(t("airedOn", { date: aired }));
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

function ReviewBox({
  draft,
  onDraftChange,
  onSave,
  isPending,
}: {
  draft: string;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  isPending: boolean;
}) {
  const t = useTranslations("episode");
  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        placeholder={t("reviewPlaceholder")}
        className="h-14 w-full resize-none rounded-[9px] border border-border bg-surface-muted px-[11px] py-[9px] text-xs text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none lg:h-[70px] lg:px-[13px] lg:py-[11px] lg:text-[13px]"
      />
      <button
        type="button"
        onClick={onSave}
        disabled={isPending}
        className="self-start rounded-full border border-border px-3 py-1 text-[11px] text-foreground hover:bg-surface-muted disabled:opacity-60"
      >
        {t("save")}
      </button>
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
}: DetailProps) {
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
          onDraftChange={onDraftChange}
          onSave={onSave}
          isPending={isPending}
        />
      )}
    </div>
  );
}
