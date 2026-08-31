"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { RandomEvent } from "@/lib/play/random/events";
import { feedRow, type FeedText } from "@/lib/play/random/selectors";

/**
 * Feed visual de últimos resultados: etiqueta mono, valor protagonista serif
 * y desglose secundario. Deshacer vive junto a la última tirada (revierte el
 * ÚLTIMO evento del log, sea de la sección que sea — por eso está aquí y no
 * dentro de una sección); limpiar todo es ghost con confirmación en dos toques.
 */
export function ResultFeed({
  feed,
  canUndo,
  onUndo,
  onClear,
}: {
  feed: RandomEvent[];
  canUndo: boolean;
  onUndo: () => void;
  onClear: () => void;
}) {
  const t = useTranslations("play.random");
  const [confirming, setConfirming] = useState(false);
  const text = (v: FeedText) => (typeof v === "string" ? v : t(v.key, v.params));

  const undoButton = (
    <button
      type="button"
      onClick={onUndo}
      disabled={!canUndo}
      className="ml-auto shrink-0 text-[12px] text-muted-foreground underline disabled:opacity-40"
    >
      {t("feed.undo")}
    </button>
  );

  return (
    <section className="mt-6" aria-label={t("feed.title")}>
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {t("feed.title")}
        </h2>
        {confirming ? (
          <button
            type="button"
            onClick={() => {
              onClear();
              setConfirming(false);
            }}
            className="text-[12px] text-play-danger underline"
          >
            {t("feed.clearConfirm")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!canUndo}
            className="text-[12px] text-muted-foreground underline disabled:opacity-40"
          >
            {t("feed.clear")}
          </button>
        )}
      </div>
      {feed.length === 0 ? (
        <p className="mt-2 flex items-center text-[13px] text-muted-foreground">
          {t("feed.empty")}
          {canUndo ? undoButton : null}
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {feed.map((event, i) => {
            const row = feedRow(event);
            return (
              <li key={event.id} className="flex items-baseline gap-3">
                <span className="w-20 shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {text(row.label)}
                </span>
                <span className="font-serif text-[16px] font-semibold">{text(row.primary)}</span>
                {row.detail ? (
                  <span className="text-[12px] text-muted-foreground">{row.detail}</span>
                ) : null}
                {i === 0 ? undoButton : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
