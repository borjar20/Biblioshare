"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { EpisodeGrid, type SeasonGroup, type GridSource } from "./episode-grid";
import { EpisodeList } from "./episode-list";

type View = "grid" | "list";

// Contenedor de la pestaña Episodios (§7.36): contador de vistos + conmutadores
// de vista (rejilla/lista) y de fuente (mis notas/comunidad). La pantalla sigue
// siendo única para la serie.
export function EpisodePanel({
  seriesId,
  seasons,
  isLoggedIn,
}: {
  seriesId: string;
  seasons: SeasonGroup[];
  isLoggedIn: boolean;
}) {
  const t = useTranslations("episode");
  const [view, setView] = useState<View>("grid");
  const [source, setSource] = useState<GridSource>(isLoggedIn ? "mine" : "community");

  const { total, watched } = useMemo(() => {
    const all = seasons.flatMap((s) => s.episodes);
    return {
      total: all.length,
      watched: all.filter((e) => e.own.watched).length,
    };
  }, [seasons]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {isLoggedIn ? (
          <p className="font-mono text-xs text-muted-foreground">
            {t("watchedProgress", { watched, total })}
          </p>
        ) : (
          <p className="font-mono text-xs text-muted-foreground">
            {t("episodeCount", { count: total })}
          </p>
        )}

        <div className="flex items-center gap-2">
          {isLoggedIn && (
            <Segmented
              value={source}
              onChange={(v) => setSource(v as GridSource)}
              options={[
                { value: "mine", label: t("sourceMine") },
                { value: "community", label: t("sourceCommunity") },
              ]}
            />
          )}
          <Segmented
            value={view}
            onChange={(v) => setView(v as View)}
            options={[
              { value: "grid", label: t("viewGrid") },
              { value: "list", label: t("viewList") },
            ]}
          />
        </div>
      </div>

      {view === "grid" ? (
        <EpisodeGrid seasons={seasons} source={source} />
      ) : (
        <EpisodeList
          seriesId={seriesId}
          seasons={seasons}
          source={source}
          isLoggedIn={isLoggedIn}
        />
      )}
    </div>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-md border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded px-2.5 py-1 font-mono text-[11px] transition-colors ${
            value === o.value
              ? "bg-surface-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
