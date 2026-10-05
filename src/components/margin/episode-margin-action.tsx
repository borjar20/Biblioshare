"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MarginNoteSheet } from "./margin-note-sheet";

// «Dejar nota en este episodio»: botón + hoja con el compositor anclado al
// episodio. Solo se pinta en episodios ya vistos (lo decide quien lo monta).
export function EpisodeMarginAction({
  itemId,
  season,
  episode,
}: {
  itemId: string;
  season: number;
  episode: number;
}) {
  const t = useTranslations("margin");
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex min-h-11 items-center self-start rounded-full border border-border px-3 text-[11px] text-foreground hover:bg-surface-muted"
      >
        {t("leaveEpisode")}
      </button>
      <MarginNoteSheet
        open={open}
        onClose={() => setOpen(false)}
        itemType="series"
        itemId={itemId}
        defaultEpisode={{ season, episode }}
      />
    </>
  );
}
