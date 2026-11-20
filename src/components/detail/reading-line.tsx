import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import type { ProgressSession } from "@/lib/sessions/types";
import type { Pass } from "@/lib/passes/types";
import type { Edition } from "@/lib/editions/types";
import type { getNotesForItem } from "@/lib/notes/get-notes";
import type { getItemMarginNotes } from "@/lib/margin/queries";
import {
  READING_STRIP_SESSION_CAP,
  buildReadingStrip,
  marginToStrip,
  noteToStrip,
  resolveReadingPages,
} from "@/lib/passes/reading-strip";
import { NoteCard } from "@/components/notes/note-card";
import { MarginNoteCard } from "@/components/margin/margin-note-card";
import { MarginComposerButton } from "@/components/margin/margin-composer-button";
import { MarginReveal } from "@/components/margin/margin-reveal";
import { MarginRetroSeen } from "@/components/margin/margin-retro-seen";
import { PassDiary } from "./pass-diary";
import { PassLogHead } from "./pass-log-head";
import { ReadingStripCard } from "./reading-strip";
import { AddToCollectionButton, AddingPlaceholder, type ManagedEntry } from "./log-panel";

type Notes = Awaited<ReturnType<typeof getNotesForItem>>;
type Margin = Awaited<ReturnType<typeof getItemMarginNotes>>;

// «Mi registro» en libros (spec 2026-11-11-ficha-linea-de-lectura): cabecera,
// tira, notas sueltas, cabecera del margen, diario y «Añadir a colección».
// Servidor: espera notas y margen (que la ficha empezó antes de after(), #754),
// arma la tira y pinta las tarjetas de nota para pasarlas a las islas.
// Sin `use cache`: todo depende de quién mira (regla #437).
export async function ReadingLine({
  itemId,
  entry,
  passes,
  sessions,
  editions,
  workTotalUnits,
  canContribute,
  notesPromise,
  marginPromise,
  marginPages,
  currentYear,
}: {
  itemId: string;
  entry: ManagedEntry | null;
  passes: Pass[];
  sessions: ProgressSession[];
  editions: Edition[];
  workTotalUnits: number | null;
  canContribute: boolean;
  notesPromise: Promise<Notes> | null;
  marginPromise: Promise<Margin> | null;
  marginPages: number | null;
  currentYear: number;
}) {
  if (!entry) return <AddingPlaceholder />;

  const t = await getTranslations("detail.readingStrip");
  const tMargin = await getTranslations("margin");
  const [notes, margin] = await Promise.all([
    notesPromise ?? Promise.resolve([] as Notes),
    marginPromise ?? Promise.resolve({ found: [], mine: [] } as Margin),
  ]);

  const { openPass, activePass, totalPages, currentPage } = resolveReadingPages({
    passes,
    editions,
    workTotalUnits,
    position: entry.position,
  });
  const marginAll = [...margin.found, ...margin.mine.filter((m) => !margin.found.some((f) => f.noteId === m.noteId))];

  const strip = buildReadingStrip({
    sessions,
    notes: [...notes.map(noteToStrip), ...marginAll.map((v) => marginToStrip(v, totalPages))],
    totalPages,
    currentPage,
    closed: openPass === null,
    complete: sessions.length < READING_STRIP_SESSION_CAP,
  });

  const noteNodes: Record<string, ReactNode> = {};
  for (const n of notes) noteNodes[`note:${n.id}`] = <NoteCard note={n} />;
  for (const v of marginAll) {
    noteNodes[`margin:${v.noteId}`] = (
      <MarginNoteCard note={v} showNew={!!v.encounter && !v.encounter.seenAt && v.encounter.foundVia === "retro"} />
    );
  }

  // Mismo reparto que margin-section.tsx: revelación al cruzar el punto, y los
  // encuentros retroactivos se marcan vistos.
  const reveal = margin.found.filter((n) => n.encounter && !n.encounter.seenAt && n.encounter.foundVia !== "retro");
  const retroUnseen = margin.found.flatMap((n) =>
    n.encounter && !n.encounter.seenAt && n.encounter.foundVia === "retro" ? [n.encounter.id] : [],
  );

  const showCloseHint =
    openPass !== null &&
    totalPages !== null &&
    totalPages > 0 &&
    strip.currentPage < totalPages &&
    (totalPages - strip.currentPage) / totalPages < 0.1;

  const groups = [
    ["ahead", strip.loose.ahead],
    ["afterLast", strip.loose.afterLast],
    ["other", strip.loose.other],
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <PassLogHead
        itemType="book"
        itemId={itemId}
        entryStatus={entry.status}
        passes={passes}
        editions={editions}
        canContribute={canContribute}
      />
      <ReadingStripCard
        strip={strip}
        itemId={itemId}
        sessionsPassId={activePass?.id ?? null}
        currentYear={currentYear}
        noteNodes={noteNodes}
        showCloseHint={showCloseHint}
      />
      {groups.map(([key, list]) =>
        list.length === 0 ? null : (
          <section key={key} className="flex flex-col gap-3" aria-labelledby={`loose-${key}`}>
            <h3 id={`loose-${key}`} data-section-title className="label-section">
              {t(key)}
            </h3>
            {list.map((n) => (
              <div key={n.key}>{noteNodes[n.key]}</div>
            ))}
          </section>
        ),
      )}
      <section className="flex flex-col gap-3" aria-labelledby="margin-title">
        <div className="flex items-center justify-between gap-2">
          <h3 id="margin-title" data-section-title className="label-section">
            {tMargin("sectionTitle")}
          </h3>
          <MarginComposerButton itemType="book" itemId={itemId} pages={marginPages} />
        </div>
        <MarginRetroSeen key={retroUnseen.join(",")} ids={retroUnseen} />
        <MarginReveal key={reveal.map((n) => n.encounter!.id).join(",")} notes={reveal} />
      </section>
      <PassDiary itemType="book" itemId={itemId} passes={passes} editions={editions} />
      <AddToCollectionButton itemType="book" itemId={itemId} />
    </div>
  );
}
