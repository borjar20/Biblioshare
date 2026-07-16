"use client";

import Image from "next/image";
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

// La línea `.em` del frame 11: duración · emitido · nota, en mono y apagada.
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
  tall = false,
}: {
  draft: string;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  isPending: boolean;
  tall?: boolean;
}) {
  const t = useTranslations("episode");
  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        placeholder={t("reviewPlaceholder")}
        className={`w-full resize-none rounded-[9px] border border-border bg-surface-muted px-[11px] py-[9px] text-xs text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none lg:px-[13px] lg:py-[11px] lg:text-[13px] ${
          tall ? "h-[70px]" : "h-14"
        }`}
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

// Desplegable inline del móvil (`.epi-detail` del frame 4): sinopsis y tu
// reseña, sangrados hasta la columna del título.
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

// Tarjeta fija de PC (`.desk-epdetail` del frame 11): fotograma 16:9 con el
// código del episodio encima, título en serif, la línea de metadatos y la
// reseña. Se queda quieta a la derecha mientras recorres la lista — el mismo
// gesto que el resumen de Comunidad.
export function EpisodeDetailCard({
  episode,
  own,
  source,
  interactive,
  isPending,
  draft,
  onDraftChange,
  onSave,
}: Omit<DetailProps, "episode" | "own" | "onSave"> & {
  episode: EpisodeRow | null;
  own: OwnWatch | null;
  onSave?: () => void;
}) {
  const t = useTranslations("episode");

  if (!episode || !own) {
    return (
      <div className="rounded-[12px] border border-border bg-surface p-[18px]">
        <p className="text-[13px] text-muted-foreground">{t("selectHint")}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[12px] border border-border bg-surface">
      <div className="relative aspect-video bg-surface-muted">
        {episode.stillUrl && (
          <Image
            src={episode.stillUrl}
            alt=""
            fill
            sizes="340px"
            className="object-cover"
          />
        )}
        <span className="absolute bottom-2.5 left-3 rounded-[5px] bg-black/45 px-2 py-[3px] font-mono text-[10px] tracking-[0.05em] text-white uppercase">
          {t("codeLong", { s: episode.season, e: episode.episode })}
        </span>
      </div>
      <div className="p-[18px]">
        <h3 className="font-serif text-[19px] font-semibold text-foreground">
          {episode.title ?? t("untitled")}
        </h3>
        <MetaLine
          episode={episode}
          own={own}
          source={source}
          className="mt-1.5 mb-3"
        />
        {episode.synopsis && (
          <p className="text-[13.5px] leading-[1.6] text-foreground-soft">
            {episode.synopsis}
          </p>
        )}
        {interactive && (
          <div className="mt-3.5">
            <ReviewBox
              draft={draft}
              onDraftChange={onDraftChange}
              onSave={onSave ?? (() => {})}
              isPending={isPending}
              tall
            />
          </div>
        )}
      </div>
    </div>
  );
}
