import type { ProgressSession } from "@/lib/sessions/types";
import type { Note } from "@/lib/notes/types";
import type { MarginNoteView } from "@/lib/margin/types";
import type { Pass } from "@/lib/passes/types";
import type { Edition } from "@/lib/editions/types";
import type { Position } from "@/lib/library/position";
import { pagesForPass } from "@/lib/editions/edition-label";

// La tira de «Mi registro» en libros (spec 2026-11-11-ficha-linea-de-lectura):
// un tramo por sesión, del ancho de lo que se leyó, con las notas colgando de su
// tramo. Pura: la ficha la llama en servidor y los tests, sin navegador.

/** Sesiones que la ficha de libro carga para la tira (`getSessions`). Si llegan
 *  justo estas, el historial puede estar cortado y la primera no parte de 0. */
export const READING_STRIP_SESSION_CAP = 500;

export type StripNote = { key: string; kind: "note" | "quote" | "margin"; page: number | null; createdAt: string };

export type StripSegment = {
  sessionId: string;
  /** Posición cronológica, desde 1 («Sesión N»). */
  index: number;
  from: number;
  to: number;
  /** Páginas leídas; 0 si la sesión no avanzó. */
  pages: number;
  advanced: boolean;
  date: string;
  minutes: number | null;
  hasPost: boolean;
  /** "YYYY-MM" de `sessionDate`. */
  monthKey: string;
  /** 0 = mes más antiguo de la lectura, 1 = el más reciente. */
  recency: number;
  notes: StripNote[];
};

export type StripMonth = {
  key: string;
  segments: StripSegment[];
  pages: number;
  minutes: number;
  notesCount: number;
  from: number;
  to: number;
};

export type ReadingStrip = {
  /** Cronológicos. */
  segments: StripSegment[];
  /** Del más reciente al más antiguo. */
  months: StripMonth[];
  loose: { ahead: StripNote[]; afterLast: StripNote[]; other: StripNote[] };
  /** Total de páginas que mide la tira (el libro o, sin total, lo alcanzado). */
  scale: number;
  currentPage: number;
  totalPages: number | null;
  totalMinutes: number;
  pagesPerSession: number;
};

export function noteToStrip(note: Note): StripNote {
  const page = "page" in note.position && note.position.page !== undefined ? note.position.page : null;
  return { key: `note:${note.id}`, kind: note.kind, page, createdAt: note.createdAt };
}

export function marginToStrip(view: MarginNoteView, totalPages: number | null): StripNote {
  const a = view.anchor;
  const page = a.kind === "ratio" ? a.page : a.kind === "finish" ? totalPages : null;
  return { key: `margin:${view.noteId}`, kind: "margin", page, createdAt: view.createdAt };
}

function reachedPage(session: ProgressSession): number | null {
  return "page" in session.position && session.position.page !== undefined ? session.position.page : null;
}

// Por página; a igualdad, la más nueva primero (mismo desempate que compareNotes).
// Las notas sin página van al final.
function byNoteOrder(a: StripNote, b: StripNote): number {
  const pa = a.page ?? Number.POSITIVE_INFINITY;
  const pb = b.page ?? Number.POSITIVE_INFINITY;
  if (pa !== pb) return pa < pb ? -1 : 1;
  return b.createdAt.localeCompare(a.createdAt);
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

export function buildReadingStrip(input: {
  sessions: ProgressSession[];
  notes: StripNote[];
  totalPages: number | null;
  currentPage: number | null;
  closed: boolean;
  /** false si las sesiones llegaron cortadas por el tope de carga. */
  complete: boolean;
}): ReadingStrip {
  const ordered = [...input.sessions].sort(
    (a, b) => a.sessionDate.localeCompare(b.sessionDate) || a.createdAt.localeCompare(b.createdAt),
  );

  const segments: StripSegment[] = [];
  let previous: number | null = input.complete ? 0 : null;
  ordered.forEach((session, i) => {
    const reached = reachedPage(session);
    const from = previous ?? reached ?? 0;
    const to = reached ?? from;
    const advanced = to > from;
    segments.push({
      sessionId: session.id,
      index: i + 1,
      from,
      to,
      pages: advanced ? to - from : 0,
      advanced,
      date: session.sessionDate,
      minutes: session.durationMinutes,
      hasPost: session.hasPost,
      monthKey: session.sessionDate.slice(0, 7),
      recency: 1,
      notes: [],
    });
    previous = to;
  });

  const monthKeys = [...new Set(segments.map((s) => s.monthKey))];
  for (const s of segments) {
    s.recency = monthKeys.length === 1 ? 1 : monthKeys.indexOf(s.monthKey) / (monthKeys.length - 1);
  }

  const lastTo = segments.length > 0 ? Math.max(...segments.map((s) => s.to)) : 0;
  const currentPage = input.currentPage ?? segments.at(-1)?.to ?? 0;
  const reached = Math.max(currentPage, lastTo);
  const scale =
    input.totalPages !== null && input.totalPages > 0
      ? Math.max(input.totalPages, reached)
      : Math.max(reached, 1);

  const loose: ReadingStrip["loose"] = { ahead: [], afterLast: [], other: [] };
  for (const note of [...input.notes].sort(byNoteOrder)) {
    if (note.page === null) {
      loose.other.push(note);
      continue;
    }
    const page = note.page;
    // La sesión MÁS RECIENTE cuyo tramo contiene la página: si se volvió atrás
    // y se releyó, la nota de hoy es de la sesión de hoy, no de la primera que
    // pasó por ahí (con un historial que solo avanza, es la misma).
    const home = segments.findLast((s) => s.advanced && s.from < page && page <= s.to);
    if (home) home.notes.push(note);
    else if (page > reached) (input.closed ? loose.afterLast : loose.ahead).push(note);
    else loose.other.push(note);
  }

  const months: StripMonth[] = [...monthKeys].reverse().map((key) => {
    const ms = segments.filter((s) => s.monthKey === key);
    return {
      key,
      segments: ms,
      pages: sum(ms.map((s) => s.pages)),
      minutes: sum(ms.map((s) => s.minutes ?? 0)),
      notesCount: sum(ms.map((s) => s.notes.length)),
      from: Math.min(...ms.map((s) => s.from)),
      to: Math.max(...ms.map((s) => s.to)),
    };
  });

  const totalPagesRead = sum(segments.map((s) => s.pages));
  return {
    segments,
    months,
    loose,
    scale,
    currentPage,
    totalPages: input.totalPages,
    totalMinutes: sum(segments.map((s) => s.minutes ?? 0)),
    pagesPerSession: segments.length > 0 ? Math.round(totalPagesRead / segments.length) : 0,
  };
}

// Qué pase manda en la pestaña y cuántas páginas tiene el libro para él. La
// edición del pase manda; sin ella, las páginas orientativas de la obra
// (pagesForPass, #901). Con el pase cerrado, la del pase activo (el último).
export function resolveReadingPages(input: {
  passes: Pass[];
  editions: Edition[];
  workTotalUnits: number | null;
  position: Position;
}): { openPass: Pass | null; activePass: Pass | null; totalPages: number | null; currentPage: number | null } {
  const openPass = input.passes.find((p) => p.status === "planned" || p.status === "in_progress") ?? null;
  const activePass = input.passes.find((p) => p.isActive) ?? null;
  const owner = openPass ?? activePass;
  const edition = owner?.editionId != null ? (input.editions.find((e) => e.id === owner.editionId) ?? null) : null;
  const currentPage = "page" in input.position && input.position.page !== undefined ? input.position.page : null;
  return { openPass, activePass, totalPages: pagesForPass(edition, input.workTotalUnits), currentPage };
}
