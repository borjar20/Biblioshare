// Frases de la narradora (spec 2026-10-06 §5). NO se guardan en el payload: se
// resuelven al pintar, así que un cambio de copy llega a los wrap-ups ya generados.
// Clave `wrapUps.narrator.<variante>.<story>`; solo `cover` y `closing` tienen voz
// propia por variante (los siete estados), el resto cae en `default`.
import { formatHours } from "./view-models";
import type { Story, WrapUpPayload } from "./types";

type T = (key: string, values?: Record<string, string | number>) => string;

const PER_VARIANT = new Set<Story["id"]>(["cover", "closing"]);

/** Cifras interpolables de cada story; las frases solo usan lo que existe. */
function valuesFor(story: Story, payload: WrapUpPayload): Record<string, string | number> {
  switch (story.id) {
    case "time": {
      const { value, unit } = formatHours(story.minutes.book + story.minutes.movie + story.minutes.series);
      return { value, unit };
    }
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

export function narratorLine(story: Story, payload: WrapUpPayload, t: T): string {
  const scope = PER_VARIANT.has(story.id) ? payload.narrator : "default";
  return t(`wrapUps.narrator.${scope}.${story.id}`, valuesFor(story, payload));
}
