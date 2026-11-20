"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { StripMonth } from "@/lib/passes/reading-strip";
import { durationLabel, monthLabel } from "@/lib/sessions/session-date";
import { SessionRow } from "./session-row";

// El historial completo, por meses y plegado (spec 2026-11-11, «Historial por
// meses»). El mes más reciente va abierto. Solo se monta con más de tres
// sesiones: las tres últimas ya están a la vista.
export function SessionMonths({
  months,
  total,
  scale,
  currentYear,
  itemId,
  onShowNotes,
}: {
  months: StripMonth[];
  total: number;
  scale: number;
  currentYear: number;
  itemId: string;
  onShowNotes: (sessionId: string) => void;
}) {
  const t = useTranslations("detail.readingStrip");
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="self-start rounded-[9px] border border-border px-3 py-1.5 text-[12.5px] font-medium text-foreground-soft transition-colors hover:bg-surface-muted"
      >
        {open ? t("hideAll") : t("seeAll", { count: total })}
      </button>
      {open &&
        months.map((m, i) => (
          <details key={m.key} open={i === 0} data-testid="session-month" className="rounded-[12px] border border-border bg-surface">
            <summary className="flex cursor-pointer list-none flex-col gap-1 px-3.5 py-3">
              <span className="font-serif text-[17px] font-semibold">{monthLabel(m.key, currentYear)}</span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {t("monthSummary", { sessions: m.segments.length, pages: m.pages, time: durationLabel(m.minutes), notes: m.notesCount })}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">{t("range", { from: m.from, to: m.to })}</span>
            </summary>
            <ul className="flex flex-col border-t border-border px-3.5">
              {[...m.segments].reverse().map((s) => (
                <SessionRow key={s.sessionId} segment={s} scale={scale} currentYear={currentYear} itemId={itemId} onShowNotes={onShowNotes} />
              ))}
            </ul>
          </details>
        ))}
    </div>
  );
}
