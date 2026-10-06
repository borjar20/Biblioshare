// Reglas de aparición de las stories (spec 2026-10-06 §3). PURO: recibe hechos,
// devuelve qué se cuenta. «La regla que no se sostiene se calla» (principio 6
// de docs/design/paneles-estadisticos.md): sin dato, la story no existe.
import type { ItemType } from "@/lib/catalog/types";
import type { Intensity, NarratorVariant, Palette, Story, TimeFacts, WrapUpInputs } from "./types";
import type { WrapUpKind, WrapUpWindow } from "./windows";

const QUIET_BELOW: Record<WrapUpKind, number> = { week: 2, month: 4, year: 1 };

export function totalMinutes(time: TimeFacts): number {
  return time.minutes.book + time.minutes.movie + time.minutes.series;
}

export function hasAnyActivity(i: WrapUpInputs): boolean {
  return i.activeDays.length > 0 || i.finished.length > 0 || totalMinutes(i.time) > 0
    || i.time.episodesWithoutRuntime > 0 || i.experienceDays > 0;
}

export function intensityFor(kind: WrapUpKind, i: WrapUpInputs): Intensity {
  return i.activeDays.length < QUIET_BELOW[kind] ? "quiet" : "full";
}

export function dominantType(time: TimeFacts): ItemType | null {
  const total = totalMinutes(time);
  if (total <= 0) return null;
  for (const t of ["book", "movie", "series"] as const) {
    if (time.minutes[t] / total > 0.5) return t;
  }
  return null;
}

export function paletteFor(time: TimeFacts): Palette {
  return dominantType(time) ?? "mixed";
}

const BY_TYPE: Record<ItemType, NarratorVariant> = { book: "reader", movie: "cinephile", series: "binger" };

export function narratorFor(kind: WrapUpKind, intensity: Intensity, i: WrapUpInputs): NarratorVariant {
  if (kind === "year") return "festive";
  if (intensity === "quiet") return "quiet";
  if (i.together.jointViewings + i.together.clubDays >= 2) return "social";
  const dominant = dominantType(i.time);
  if (dominant) return BY_TYPE[dominant];
  if (i.experienceDays > 0) return "explorer";
  return "reader";
}

function momentStories(i: WrapUpInputs): Story[] {
  const out: Story[] = [];
  if (i.bestRated) out.push({ id: "best_rated", ...i.bestRated });
  if (i.phrase) out.push({ id: "phrase", ...i.phrase });
  if (i.experience) out.push({ id: "experience", ...i.experience });
  return out;
}

export function selectStories(w: WrapUpWindow, i: WrapUpInputs): Story[] {
  const out: Story[] = [{ id: "cover" }];
  const hasTime = totalMinutes(i.time) > 0 || i.time.episodesWithoutRuntime > 0;
  const rhythm: Story | null = i.activeDays.length >= 3 ? {
    id: "rhythm",
    days: daysOf(w).map((date) => ({ date, active: i.activeDays.includes(date) })),
    activeDays: i.activeDays.length, bestStreak: i.bestStreak,
    favoriteWeekday: i.favoriteWeekday, favoriteBandStartHour: i.favoriteBandStartHour,
  } : null;
  const finished: Story | null = i.finished.length > 0
    ? { id: "finished", items: i.finished.slice(0, 8), total: i.finished.length } : null;
  const genres: Story | null = i.genres.length >= 2 ? { id: "genres", top: i.genres.slice(0, 5) } : null;

  if (hasTime) out.push({ id: "time", ...i.time });

  if (w.kind === "week") {
    if (finished) out.push(finished);
    if (rhythm) out.push(rhythm);
    const first = momentStories(i)[0];
    if (first) out.push(first);
  } else if (w.kind === "month") {
    if (finished) out.push(finished);
    if (i.inProgress.length > 0) out.push({ id: "in_progress", items: i.inProgress.slice(0, 6) });
    if (rhythm) out.push(rhythm);
    if (genres) out.push(genres);
    out.push(...momentStories(i));
    if (i.together.jointViewings + i.together.clubDays > 0) out.push({ id: "together", ...i.together });
  } else {
    const a = i.annual;
    if (a) out.push({ id: "months", months: a.months });
    if (finished) out.push(finished);
    if (rhythm) out.push(rhythm);
    if (genres) out.push(genres);
    if (a && (a.records.busiestMonth || a.records.fastest || a.records.longestSessionMinutes)) {
      out.push({ id: "records", ...a.records });
    }
    if (a && a.creators.length >= 2) out.push({ id: "creators", top: a.creators.slice(0, 5) });
    out.push(...momentStories(i));
    if (i.together.jointViewings + i.together.clubDays > 0) out.push({ id: "together", ...i.together });
    if (a && a.pile.added + a.pile.removed > 0) out.push({ id: "pile", ...a.pile });
    if (a && i.pet) out.push({ id: "pet", stage: i.pet.stage, ...a.petYear });
  }
  out.push({ id: "closing" });
  return out;
}

/** Días de la ventana para la tira de ritmo (semana: 7; mes: 28-31; año: no se usa la tira diaria). */
function daysOf(w: WrapUpWindow): string[] {
  if (w.kind === "year") return [];
  const out: string[] = [];
  for (let d = new Date(`${w.start}T00:00:00Z`); d.toISOString().slice(0, 10) < w.endExclusive; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
