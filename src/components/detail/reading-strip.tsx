"use client";

import Link from "next/link";
import { useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { ReadingStrip } from "@/lib/passes/reading-strip";
import { durationLabel, monthLabel, sessionDateLabel } from "@/lib/sessions/session-date";
import { NoteForm } from "@/components/notes/note-form";
import { SessionRow, useSegmentText } from "./session-row";
import { SessionMonths } from "./session-months";
import styles from "./reading-strip.module.css";

// La tarjeta de la tira (spec 2026-11-11-ficha-linea-de-lectura, punto 2), las
// tres últimas sesiones y el historial. Las tarjetas de nota llegan del servidor
// ya pintadas (`noteNodes`, por clave `note:<id>` / `margin:<id>`). Una nota se
// ve en un solo sitio: el detalle del tramo seleccionado.
export function ReadingStripCard({
  strip,
  itemId,
  sessionsPassId,
  currentYear,
  noteNodes,
  showCloseHint,
}: {
  strip: ReadingStrip;
  itemId: string;
  /** Pase dueño de las sesiones: destino de «Registrar sesión». */
  sessionsPassId: string | null;
  currentYear: number;
  noteNodes: Record<string, ReactNode>;
  showCloseHint: boolean;
}) {
  const t = useTranslations("detail.readingStrip");
  const tSessions = useTranslations("item.sessions");
  const tProgress = useTranslations("detail.log.progress");
  const segmentText = useSegmentText();
  const { segments, scale } = strip;
  // Abre por defecto «donde estás»: el tramo más reciente que contiene la
  // página actual (el mismo que se queda una nota escrita ahí, ver
  // buildReadingStrip). Si la última sesión volvió atrás no tiene tramo propio,
  // y abrirla escondería sus notas. Sin ninguno, la última que avanzó; sin
  // tramos, la última sesión. Si cambia (sesión nueva tras revalidar), se vuelve
  // a él (ajuste en render).
  const page = strip.currentPage;
  const lastId =
    segments.findLast((s) => s.advanced && s.from < page && page <= s.to)?.sessionId ??
    segments.findLast((s) => s.advanced)?.sessionId ??
    segments.at(-1)?.sessionId ??
    null;
  const [selected, setSelected] = useState<string | null>(lastId);
  const [prevLastId, setPrevLastId] = useState(lastId);
  if (lastId !== prevLastId) {
    setPrevLastId(lastId);
    setSelected(lastId);
  }
  const current = segments.find((s) => s.sessionId === selected) ?? null;

  const cardRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const pointerType = useRef("mouse");

  function showNotes(sessionId: string) {
    setSelected(sessionId);
    // jsdom no implementa scrollIntoView.
    cardRef.current?.scrollIntoView?.({ block: "nearest" });
  }

  // Con el dedo, el tramo más cercano al punto tocado: no se exige acertar en
  // 3px. Con ratón o teclado, el tramo pulsado.
  function nearestTo(x: number): string | null {
    let best: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const b of trackRef.current?.querySelectorAll<HTMLButtonElement>("[data-segment]") ?? []) {
      const r = b.getBoundingClientRect();
      const d = Math.abs(x - (r.left + r.width / 2));
      if (d < bestDistance) {
        bestDistance = d;
        best = b.dataset.segment ?? null;
      }
    }
    return best;
  }
  function onTrackClick(e: MouseEvent<HTMLDivElement>) {
    const hit = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-segment]")?.dataset.segment ?? null;
    const id = pointerType.current !== "mouse" && e.detail > 0 ? (nearestTo(e.clientX) ?? hit) : hit;
    if (id) setSelected((prev) => (prev === id ? null : id));
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // Escape dentro de un campo de texto (el compositor de notas) no cierra el
    // tramo: desmontaría el formulario y se perdería el borrador.
    if (e.defaultPrevented || (e.target as HTMLElement).closest("input, textarea, select, [contenteditable='true']")) return;
    if (e.key === "Escape" && selected) {
      e.stopPropagation();
      setSelected(null);
    }
  }

  const visible = segments.filter((s) => s.advanced);
  const marks = [...segments.flatMap((s) => s.notes), ...strip.loose.ahead, ...strip.loose.afterLast, ...strip.loose.other].filter(
    (n): n is typeof n & { page: number } => n.page !== null && n.page <= scale,
  );
  const percent = strip.totalPages ? Math.min(100, Math.round((strip.currentPage / strip.totalPages) * 100)) : null;
  const monthsChrono = [...strip.months].reverse();

  return (
    <section data-testid="reading-strip" className="flex flex-col gap-4" aria-labelledby="reading-strip-title">
      {/* h3 y enlace hermanos: varios e2e se anclan a esta estructura. */}
      <div className="flex items-baseline justify-between gap-2">
        <h3 id="reading-strip-title" data-section-title className="label-section">
          {tSessions("title")}
        </h3>
        {sessionsPassId && (
          <Link href={`/sesion/${sessionsPassId}`} className="shrink-0 text-xs text-muted-foreground underline hover:text-foreground">
            {tSessions("add")}
          </Link>
        )}
      </div>

      <div ref={cardRef} onKeyDown={onKeyDown} className="flex flex-col gap-3 rounded-[14px] border border-border bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="m-0">
            <span
              data-testid="reading-current-page"
              className="font-serif text-[26px] leading-none font-semibold tabular-nums"
              style={{ color: "var(--work-title)" }}
            >
              {t("page", { page: strip.currentPage })}
            </span>
            {strip.totalPages !== null && percent !== null && (
              <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                {t("pageOf", { total: strip.totalPages, percent })}
              </span>
            )}
          </p>
          {segments.length > 0 && (
            <span className="font-mono text-[11px] text-muted-foreground">
              {t("summary", { sessions: segments.length, time: durationLabel(strip.totalMinutes), perSession: strip.pagesPerSession })}
            </span>
          )}
        </div>

        <div className="relative pt-3.5">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-3">
            {marks.map((n) => (
              <span key={n.key} className={n.kind === "margin" ? styles.markMargin : styles.mark} style={{ left: `${(n.page / scale) * 100}%` }} />
            ))}
          </div>
          <div
            ref={trackRef}
            role="group"
            aria-label={t("stripLabel")}
            className={styles.track}
            onPointerDown={(e) => {
              pointerType.current = e.pointerType;
            }}
            onClick={onTrackClick}
          >
            {visible.map((s, i) => {
              const date = sessionDateLabel(s.date, currentYear);
              const label = [t("segmentLabel", { date, from: s.from, to: s.to }), s.minutes != null ? durationLabel(s.minutes) : null]
                .filter(Boolean)
                .join(", ");
              return (
                <button
                  key={s.sessionId}
                  type="button"
                  data-segment={s.sessionId}
                  aria-pressed={s.sessionId === selected}
                  aria-label={label}
                  title={label}
                  className={`${styles.segment} ${i > 0 && visible[i - 1].monthKey !== s.monthKey ? styles.monthStart : ""}`}
                  style={{ width: `${(s.pages / scale) * 100}%`, "--recency": s.recency } as CSSProperties}
                />
              );
            })}
            <span aria-hidden className={styles.rest} />
          </div>
          <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
            <span>{t("page", { page: 0 })}</span>
            <span>{t("page", { page: scale })}</span>
          </div>
        </div>

        {segments.length > 0 && (
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 font-mono text-[10px] text-muted-foreground">
            <span className="flex flex-wrap gap-3">
              {monthsChrono.map((m) => (
                <span key={m.key} className="flex items-center gap-1.5">
                  <span aria-hidden className="h-2 w-2 rounded-sm bg-accent" style={{ opacity: 0.38 + m.segments[0].recency * 0.62 }} />
                  {monthLabel(m.key, currentYear)}
                </span>
              ))}
            </span>
            <span className="flex gap-3">
              <span className="flex items-center gap-1.5">
                <span aria-hidden className={styles.mark} style={{ position: "static", margin: 0 }} />
                {t("legendNote")}
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className={styles.markMargin} style={{ position: "static", margin: 0 }} />
                {t("legendMargin")}
              </span>
            </span>
          </div>
        )}

        {showCloseHint && strip.totalPages !== null && (
          <p className="m-0 text-[12.5px] text-muted-foreground">{tProgress("closeHint", { total: strip.totalPages })}</p>
        )}

        {current && (
          <div data-testid="reading-strip-detail" className="flex flex-col gap-2 rounded-[10px] bg-surface-muted p-3">
            <p className="m-0 text-sm font-semibold">
              {t("detailTitle", { n: current.index, date: sessionDateLabel(current.date, currentYear) })}{" "}
              <span className="font-normal text-muted-foreground">· {segmentText(current)}</span>
            </p>
            {current.notes.map((n) => (
              <div key={n.key}>{noteNodes[n.key]}</div>
            ))}
            <NoteForm key={current.sessionId} bare itemType="book" itemId={itemId} anchor={{ kind: "page", page: current.to }} />
          </div>
        )}

        {segments.length === 0 && (
          <>
            <p className="m-0 text-sm text-muted-foreground">{t("empty")}</p>
            <NoteForm bare itemType="book" itemId={itemId} anchor={{ kind: "page", page: strip.currentPage }} />
          </>
        )}
      </div>

      {segments.length > 0 && (
        <div>
          <p className="label-section m-0 mb-1">{t("recent")}</p>
          <ul className="flex flex-col">
            {segments
              .slice(-3)
              .reverse()
              .map((s) => (
                <SessionRow key={s.sessionId} segment={s} scale={scale} currentYear={currentYear} itemId={itemId} onShowNotes={showNotes} />
              ))}
          </ul>
        </div>
      )}

      {segments.length > 3 && (
        <SessionMonths
          months={strip.months}
          total={segments.length}
          scale={scale}
          currentYear={currentYear}
          itemId={itemId}
          onShowNotes={showNotes}
        />
      )}
    </section>
  );
}
