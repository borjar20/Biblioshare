"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import type { StripSegment } from "@/lib/passes/reading-strip";
import { deleteSession } from "@/lib/sessions/actions";
import { durationLabel, sessionDateLabel } from "@/lib/sessions/session-date";
import { ActionMenu } from "@/components/ui/action-menu";

/** «pág. 148 → 190 · 42 páginas · 1 h 25 min»; sin avance, «pág. 40 · 30 min». */
export function useSegmentText() {
  const t = useTranslations("detail.readingStrip");
  return (s: StripSegment) =>
    [
      s.advanced ? `${t("range", { from: s.from, to: s.to })} · ${t("rangePages", { count: s.pages })}` : t("page", { page: s.to }),
      s.minutes != null ? durationLabel(s.minutes) : null,
    ]
      .filter(Boolean)
      .join(" · ");
}

// Una sesión en «Mi registro» (libros): fecha absoluta, tramo y una minibarra
// que dice en qué parte del libro cayó. Las notas NO se pintan aquí (una nota
// está en un solo sitio visible): la pastilla abre su tramo en la tira.
export function SessionRow({
  segment,
  scale,
  currentYear,
  itemId,
  onShowNotes,
}: {
  segment: StripSegment;
  scale: number;
  currentYear: number;
  itemId: string;
  onShowNotes: (sessionId: string) => void;
}) {
  const t = useTranslations("detail.readingStrip");
  const tSessions = useTranslations("item.sessions");
  const text = useSegmentText();
  const [isPending, startTransition] = useTransition();
  const notes = segment.notes.length;

  return (
    <li className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 border-t border-border py-2.5 text-[13px] first:border-t-0">
      <time dateTime={segment.date} className="font-mono text-[11px] text-muted-foreground tabular-nums">
        {sessionDateLabel(segment.date, currentYear)}
      </time>
      <div className="min-w-0">
        <span className="text-foreground">{text(segment)}</span>
        {notes > 0 && (
          <button
            type="button"
            onClick={() => onShowNotes(segment.sessionId)}
            className="ml-2 rounded-full border border-border px-2 py-px text-[11px] transition-colors hover:bg-surface-muted"
            style={{ color: "var(--accent-ink)" }}
          >
            {t("notesPill", { count: notes })}
          </button>
        )}
        <span aria-hidden className="relative mt-1.5 block h-1 overflow-hidden rounded-sm bg-surface-3">
          <span
            className="absolute inset-y-0 rounded-sm bg-accent"
            style={{ left: `${(segment.from / scale) * 100}%`, width: `${Math.max(0.8, (segment.pages / scale) * 100)}%` }}
          />
        </span>
      </div>
      {/* Mismo borrado que session-list.tsx (F3-012): pregunta solo si la
          sesión arrastra su publicación y su hilo. */}
      <ActionMenu
        label={tSessions("actionsLabel")}
        menuAlign="right"
        triggerClassName="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
        items={[
          {
            key: "delete",
            label: tSessions("delete"),
            danger: true,
            disabled: isPending,
            onSelect: () => {
              if (segment.hasPost && !window.confirm(tSessions("deleteConfirmShared"))) return;
              startTransition(() => deleteSession(segment.sessionId, "book", itemId));
            },
          },
        ]}
      />
    </li>
  );
}
