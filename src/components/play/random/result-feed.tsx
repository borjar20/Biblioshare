"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { RandomEvent } from "@/lib/play/random/events";
import { describeRandomEvent } from "@/lib/play/random/selectors";

/**
 * Feed de últimos resultados + deshacer + limpiar todo. El deshacer revierte
 * el ÚLTIMO evento del log, sea de la sección que sea (spec §4) — por eso vive
 * aquí y no dentro de una sección. Limpiar pide confirmación en dos toques
 * (sin modal: patrón inline del resto de Play).
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

  return (
    <section className="mt-6" aria-label={t("feed.title")}>
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {t("feed.title")}
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="rounded-chip border border-border px-3 py-1 text-[12px] disabled:opacity-40"
          >
            {t("feed.undo")}
          </button>
          {confirming ? (
            <button
              type="button"
              onClick={() => {
                onClear();
                setConfirming(false);
              }}
              className="rounded-chip border border-play-danger px-3 py-1 text-[12px] text-play-danger"
            >
              {t("feed.clearConfirm")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={!canUndo}
              className="rounded-chip border border-border px-3 py-1 text-[12px] disabled:opacity-40"
            >
              {t("feed.clear")}
            </button>
          )}
        </div>
      </div>
      {feed.length === 0 ? (
        <p className="mt-2 text-[13px] text-muted-foreground">{t("feed.empty")}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {feed.map((event) => {
            const { key, params } = describeRandomEvent(event);
            return (
              <li key={event.id} className="text-[13px]">
                {t(`log.${key}`, params)}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
