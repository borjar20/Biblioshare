// Payload de ejemplo con TODAS las stories (semanal + anuales), para los tests
// de render del póster y para revisar el reproductor a ojo sin datos en la BD.
import type { ItemRef, Story, WrapUpPayload } from "@/lib/wrap-ups/types";

const book = (id: string, title: string, coverUrl: string | null = null): ItemRef => ({ type: "book", id, title, coverUrl, times: 1 });
const movie = (id: string, title: string): ItemRef => ({ type: "movie", id, title, coverUrl: null, times: 1 });
const series = (id: string, title: string): ItemRef => ({ type: "series", id, title, coverUrl: null, times: 1 });

const finished = [book("b1", "La mano izquierda de la oscuridad"), movie("m1", "Perfect Days"), series("s1", "Severance"), book("b2", "Piranesi")];

export const SAMPLE_STORIES: Story[] = [
  { id: "cover" },
  { id: "time", minutes: { book: 412, movie: 236, series: 380 }, episodesWithoutRuntime: 2, previousMinutes: 840 },
  { id: "finished", items: finished, total: 5 },
  { id: "in_progress", items: [{ ...book("b3", "Middlemarch"), percent: 42 }, { ...series("s2", "The Bear"), percent: null }] },
  { id: "rhythm", days: ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"].map((date, i) => ({ date, active: i !== 2 && i !== 5 })),
    activeDays: 5, bestStreak: 3, favoriteWeekday: 6, favoriteBandStartHour: 22 },
  { id: "genres", top: [{ name: "Ciencia ficción", works: 3 }, { name: "Drama", works: 2 }, { name: "Fantasía", works: 1 }] },
  { id: "best_rated", item: finished[3], rating: 9, review: "Un laberinto que se lee como una casa: cada sala abre otra y todas son la misma." },
  { id: "phrase", source: "quote", body: "La belleza de la Casa es inconmensurable; su bondad, infinita.", item: finished[3] },
  { id: "experience", experienceId: "e1", title: "Maratón de Severance con Ana", date: "2026-10-04" },
  { id: "together", jointViewings: 2, clubDays: 1 },
  { id: "months", months: Array.from({ length: 12 }, (_, i) => ({ month: `2026-${String(i + 1).padStart(2, "0")}`, minutes: i === 7 ? 0 : 300 + i * 40, works: 2 })) },
  { id: "records", busiestMonth: { month: "2026-07", minutes: 2210 }, fastest: { item: finished[3], days: 3 }, longestSessionMinutes: 245 },
  { id: "creators", top: [{ name: "Ursula K. Le Guin", works: 3 }, { name: "Wim Wenders", works: 2 }] },
  { id: "pile", added: 7, removed: 2 },
  { id: "pet", stage: "young", adventuresWon: 12, loot: 30 },
  { id: "closing" },
];

export function samplePayload(over: Partial<WrapUpPayload> = {}): WrapUpPayload {
  return {
    v: 1, kind: "week", periodStart: "2026-09-28", periodEnd: "2026-10-04",
    intensity: "full", narrator: "reader", palette: "book",
    pet: { name: "Bellota", petClass: "bard", stage: "young" },
    stories: SAMPLE_STORIES,
    share: { kind: "week", periodStart: "2026-09-28", periodEnd: "2026-10-04", narrator: "reader", palette: "book",
      minutes: 1028, episodesWithoutRuntime: 2, finished: 5, covers: finished, pet: null },
    ...over,
  };
}
