// Frases de la narradora (spec 2026-10-06 §5). NO se guardan en el payload: se
// resuelven al pintar, así que un cambio de copy llega a los wrap-ups ya generados.
// Clave `wrapUps.narrator.<variante>.<story>`; solo `cover` y `closing` tienen voz
// propia por variante (los siete estados), el resto cae en `default`.
import { formatHours, timeKind } from "./format";
import type { Story, WrapUpPayload } from "./types";

type T = (key: string, values?: Record<string, string | number>) => string;

const PER_VARIANT = new Set<Story["id"]>(["cover", "closing"]);

/** Cifras interpolables de cada story; las frases solo usan lo que existe. */
function valuesFor(story: Story, payload: WrapUpPayload): Record<string, string | number> {
  switch (story.id) {
    case "time": return formatHours(timeTotal(story));
    case "finished": return { count: story.total };
    case "in_progress": return { count: story.items.length };
    case "rhythm": return { count: story.activeDays };
    case "best_rated": return { title: story.item.title };
    case "experience": return { title: story.title };
    case "together": return { count: story.jointViewings + story.clubDays };
    case "creators": return { name: story.top[0]?.name ?? "" };
    case "pile": return { added: story.added, removed: story.removed };
    case "closing": return { count: payload.share.finished };
    default: return {};
  }
}

const timeTotal = (s: Extract<Story, { id: "time" }>) => s.minutes.book + s.minutes.movie + s.minutes.series;

/** Sufijo de clave cuando la frase depende de si hay dato (un cero no medido no se narra como cifra). */
function suffixFor(story: Story): string {
  switch (story.id) {
    case "time": {
      const k = timeKind(timeTotal(story), story.episodesWithoutRuntime);
      return k === "measured" ? "" : k === "episodesOnly" ? "Episodes" : "None";
    }
    case "creators": return story.top.length === 0 ? "_empty" : "";
    case "pile": return story.added > 0 && story.removed > 0 ? "" : story.added > 0 ? "Added" : story.removed > 0 ? "Removed" : "None";
    default: return "";
  }
}

export function narratorLine(story: Story, payload: WrapUpPayload, t: T): string {
  const scope = PER_VARIANT.has(story.id) ? payload.narrator : "default";
  return t(`wrapUps.narrator.${scope}.${story.id}${suffixFor(story)}`, valuesFor(story, payload));
}
