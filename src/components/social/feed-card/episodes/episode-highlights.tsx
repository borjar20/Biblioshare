"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { FeedEpisode } from "@/lib/social/feed";
import type { ItemType } from "@/lib/catalog/types";
import { highlights } from "./episode-stats";
import { EpisodeList, EpisodeRow } from "./episode-list";

// Post con 13 o más episodios: la lista entera sería un muro. «Lo mejor» y «lo
// peor» (3 y 3) a la vista; el resto, a un toque en «Ver los N episodios».
export function EpisodeHighlights({ episodes, itemType }: { episodes: FeedEpisode[]; itemType: ItemType }) {
  const t = useTranslations("feed");
  const [open, setOpen] = useState(false);
  const { best, worst } = highlights(episodes);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { key: "best", title: t("card.highlightsBest"), list: best },
          { key: "worst", title: t("card.highlightsWorst"), list: worst },
        ].map((col) => (
          <section key={col.key}>
            <h3 className="mb-1 font-mono text-[10px] tracking-[0.06em] text-muted-foreground uppercase">{col.title}</h3>
            <ul>
              {col.list.map((e) => (
                <EpisodeRow key={`${e.season}-${e.episode}`} episode={e} itemType={itemType} longCode />
              ))}
            </ul>
          </section>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="self-start text-[12.5px] font-medium text-accent hover:underline"
      >
        {open ? t("card.showLess") : t("card.showAll", { count: episodes.length })}
      </button>
      {open && <EpisodeList episodes={episodes} itemType={itemType} />}
    </div>
  );
}
